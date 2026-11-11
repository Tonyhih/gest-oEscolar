<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { data as fData, hoje, kz, METODOS } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';
import FinancasAluno from '@/components/FinancasAluno.vue';

const auth = useAutenticacao();
const route = useRoute();
const ehDirector = computed(() => auth.perfil === 'director');
const SEPARADORES = [
  { id: 'pagamentos', texto: 'Receber pagamento' }, { id: 'dividas', texto: 'Dívidas' },
  { id: 'resumo', texto: 'Resumo do mês' }, { id: 'precario', texto: 'Preçário' },
];
const activo = ref('pagamentos');
const accao = useAccao();

// ---------------------------------------------------------------- Receber pagamento
const pesquisa = ref('');
const alunoId = ref(route.query.aluno ?? '');
const encontrados = usePedido(() => (pesquisa.value.trim().length >= 2
  ? api.get('/alunos', { pesquisa: pesquisa.value.trim(), limite: 10 }) : Promise.resolve({ dados: [] })), { inicial: { dados: [] }, imediato: false });
let espera;
function pesquisar() {
  clearTimeout(espera);
  espera = setTimeout(() => encontrados.executar(), 300);
}
function escolher(a) { alunoId.value = a.id; pesquisa.value = ''; encontrados.dados.value = { dados: [] }; activo.value = 'pagamentos'; }

// ---------------------------------------------------------------- Dívidas
const turmas = usePedido(() => api.get('/turmas'), { inicial: [] });
const turmaDividas = ref('');
const dividas = usePedido(() => api.get('/financas/dividas', { turma: turmaDividas.value || undefined }), { inicial: [] });
const totalDividas = computed(() => dividas.dados.value.reduce((s, d) => s + d.total, 0));

// ---------------------------------------------------------------- Resumo
const mes = ref(hoje().slice(0, 7));
const resumo = usePedido(() => api.get('/financas/resumo', { mes: mes.value }));

// ---------------------------------------------------------------- Preçário
const rubricas = usePedido(() => api.get('/financas/rubricas'), { inicial: [] });
const classes = usePedido(() => (ehDirector.value ? api.get('/classes') : Promise.resolve([])), { inicial: [] });
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ORDEM_MESES = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const TIPOS = { propina: 'Propina mensal', emolumento: 'Emolumento', outro: 'Outro' };
const vazia = () => ({ nome: '', tipo: 'propina', valor: '', classe: '', meses: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6], diaVencimento: 10, multaPercentagem: 0 });
const nova = reactive(vazia());
const textoMeses = (m) => (m ?? []).slice().sort((a, b) => ORDEM_MESES.indexOf(a) - ORDEM_MESES.indexOf(b)).map((x) => MESES[x - 1]).join(', ');
async function criarRubrica() {
  const corpo = {
    nome: nova.nome, tipo: nova.tipo, valor: Number(String(nova.valor).replace(/\s/g, '').replace(',', '.')),
    ...(nova.classe ? { classe: nova.classe } : {}),
    ...(nova.tipo === 'propina' ? { meses: nova.meses, diaVencimento: Number(nova.diaVencimento), multaPercentagem: Number(nova.multaPercentagem) } : {}),
  };
  if (await accao.correr(() => api.post('/financas/rubricas', corpo), 'Rubrica criada.')) { Object.assign(nova, vazia()); rubricas.executar(); }
}
async function gerar(r) {
  if (!confirm(`Gerar as propinas "${r.nome}" para os alunos matriculados? Os meses já gerados não se repetem.`)) return;
  const x = await accao.correr(() => api.post(`/financas/rubricas/${r.id}/gerar`));
  if (x) accao.sucesso.value = `${x.criadas} mensalidades geradas para ${x.alunos} alunos (${x.jaExistiam} já existiam).`;
}
async function alternar(r) {
  if (await accao.correr(() => api.patch(`/financas/rubricas/${r.id}`, { activa: !r.activa }))) rubricas.executar();
}
async function mudarValor(r) {
  const t = prompt(`Novo valor de "${r.nome}" (só para as cobranças futuras):`, String(Number(r.valor)).replace('.', ','));
  if (!t) return;
  const valor = Number(t.replace(/\s/g, '').replace(',', '.'));
  if (await accao.correr(() => api.patch(`/financas/rubricas/${r.id}`, { valor }), 'Valor actualizado.')) rubricas.executar();
}

function mudar(s) {
  activo.value = s;
  accao.erro.value = null;
  accao.sucesso.value = '';
  if (s === 'dividas') dividas.executar();
  if (s === 'resumo') resumo.executar();
  if (s === 'precario') rubricas.executar();
}
</script>

<template>
  <h1 class="h4 mb-3">Pagamentos</h1>
  <ul class="nav nav-tabs mb-3" role="tablist">
    <li v-for="s in SEPARADORES" :key="s.id" class="nav-item" role="presentation">
      <button type="button" class="nav-link" :class="{ active: activo === s.id }" role="tab" :aria-selected="activo === s.id" @click="mudar(s.id)">{{ s.texto }}</button>
    </li>
  </ul>
  <MensagemAccao v-if="activo !== 'pagamentos'" :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <!-- Receber pagamento -->
  <section v-if="activo === 'pagamentos'">
    <div class="position-relative" style="max-width: 32rem">
      <label class="form-label" for="pg-pesquisa">Aluno</label>
      <input id="pg-pesquisa" v-model="pesquisa" class="form-control" placeholder="Nome ou n.º de processo" autocomplete="off" @input="pesquisar" />
      <div v-if="encontrados.dados.value.dados.length" class="list-group position-absolute w-100 shadow" style="z-index: 10">
        <button v-for="a in encontrados.dados.value.dados" :key="a.id" type="button" class="list-group-item list-group-item-action" @click="escolher(a)">
          {{ a.nome }} <span class="small text-body-secondary">· processo {{ a.numeroProcesso }}<template v-if="a.turma"> · {{ a.turma }}</template></span>
        </button>
      </div>
    </div>
    <FinancasAluno v-if="alunoId" :key="alunoId" :aluno-id="alunoId" />
    <p v-else class="text-body-secondary mt-3">Procure o aluno para ver o que tem por pagar e registar o pagamento.</p>
  </section>

  <!-- Dívidas -->
  <section v-else-if="activo === 'dividas'">
    <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
      <div><label class="form-label small mb-0" for="dv-turma">Turma</label>
        <select id="dv-turma" v-model="turmaDividas" class="form-select form-select-sm" @change="dividas.executar()">
          <option value="">Todas</option>
          <option v-for="t in turmas.dados.value" :key="t.id" :value="t.id">{{ t.designacao }}</option>
        </select></div>
      <span class="small">Total em atraso: <strong class="text-danger">{{ kz(totalDividas) }}</strong></span>
    </div>
    <EstadoPedido :carregando="dividas.carregando.value" :erro="dividas.erro.value" :vazio="!dividas.dados.value.length" texto-vazio="Não há propinas em atraso.">
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead><tr><th>Aluno</th><th>Turma</th><th class="text-center">Em atraso</th><th>Desde</th><th class="text-end">Valor</th><th></th></tr></thead>
          <tbody>
            <tr v-for="d in dividas.dados.value" :key="d.id">
              <td>{{ d.nome }} <span class="small text-body-secondary">· {{ d.numeroProcesso }}</span></td>
              <td>{{ d.turma ?? '—' }}</td><td class="text-center">{{ d.cobrancas }}</td><td>{{ fData(d.maisAntiga) }}</td>
              <td class="text-end fw-semibold">{{ kz(d.total) }}</td>
              <td class="text-end"><button type="button" class="btn btn-sm btn-outline-success" @click="escolher(d)">Receber</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </EstadoPedido>
  </section>

  <!-- Resumo do mês -->
  <section v-else-if="activo === 'resumo'">
    <div class="mb-3" style="max-width: 12rem"><label class="form-label small mb-0" for="rs-mes">Mês</label>
      <input id="rs-mes" v-model="mes" type="month" class="form-control form-control-sm" @change="resumo.executar()" /></div>
    <EstadoPedido :carregando="resumo.carregando.value" :erro="resumo.erro.value">
      <template v-if="resumo.dados.value">
        <div class="row g-3 mb-3">
          <div class="col-12 col-md-4"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-body-secondary">Recebido no mês</div><div class="fs-4 fw-semibold text-success">{{ kz(resumo.dados.value.totalRecebido) }}</div></div></div></div>
          <div class="col-6 col-md-4"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-body-secondary">Em atraso (hoje)</div><div class="fs-4 fw-semibold text-danger">{{ kz(resumo.dados.value.emAtraso) }}</div></div></div></div>
          <div class="col-6 col-md-4"><div class="card shadow-sm h-100"><div class="card-body">
            <div class="small text-body-secondary">Por pagar (inclui a vencer)</div><div class="fs-4 fw-semibold">{{ kz(resumo.dados.value.pendente) }}</div></div></div></div>
        </div>
        <table v-if="resumo.dados.value.recebido.length" class="table table-sm" style="max-width: 32rem">
          <thead><tr><th>Forma de pagamento</th><th class="text-center">Recibos</th><th class="text-end">Total</th></tr></thead>
          <tbody><tr v-for="r in resumo.dados.value.recebido" :key="r.metodo"><td>{{ METODOS[r.metodo] }}</td><td class="text-center">{{ r.pagamentos }}</td><td class="text-end">{{ kz(r.total) }}</td></tr></tbody>
        </table>
        <p v-else class="text-body-secondary">Sem pagamentos neste mês.</p>
      </template>
    </EstadoPedido>
  </section>

  <!-- Preçário -->
  <section v-else>
    <EstadoPedido :carregando="rubricas.carregando.value" :erro="rubricas.erro.value" :vazio="!rubricas.dados.value.length"
                  texto-vazio="Ainda não há preçário para o ano lectivo activo.">
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead><tr><th>Rubrica</th><th>Tipo</th><th>Classe</th><th class="text-end">Valor</th><th>Meses · vencimento · multa</th><th v-if="ehDirector"></th></tr></thead>
          <tbody>
            <tr v-for="r in rubricas.dados.value" :key="r.id" :class="{ 'text-body-secondary': !r.activa }">
              <td>{{ r.nome }}<span v-if="!r.activa" class="badge text-bg-secondary ms-1">inactiva</span></td>
              <td>{{ TIPOS[r.tipo] }}</td><td>{{ r.classe }}</td><td class="text-end text-nowrap">{{ kz(r.valor) }}</td>
              <td class="small"><template v-if="r.tipo === 'propina'">{{ textoMeses(r.meses) }} · dia {{ r.diaVencimento }} · {{ Number(r.multaPercentagem) }}%</template><template v-else>—</template></td>
              <td v-if="ehDirector" class="text-end text-nowrap">
                <button v-if="r.tipo === 'propina' && r.activa" type="button" class="btn btn-sm btn-success me-1" :disabled="accao.ocupado.value" @click="gerar(r)">Gerar propinas</button>
                <button type="button" class="btn btn-sm btn-outline-secondary me-1" @click="mudarValor(r)">Valor</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="alternar(r)">{{ r.activa ? 'Desactivar' : 'Activar' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </EstadoPedido>

    <form v-if="ehDirector" class="card shadow-sm mt-3" @submit.prevent="criarRubrica">
      <div class="card-header">Nova rubrica</div>
      <div class="card-body row g-2">
        <div class="col-12 col-md-4"><label class="form-label small mb-0" for="rb-nome">Nome</label>
          <input id="rb-nome" v-model="nova.nome" class="form-control form-control-sm" required minlength="3" placeholder="Ex.: Propina 7.ª classe" /></div>
        <div class="col-6 col-md-3"><label class="form-label small mb-0" for="rb-tipo">Tipo</label>
          <select id="rb-tipo" v-model="nova.tipo" class="form-select form-select-sm"><option v-for="(t, k) in TIPOS" :key="k" :value="k">{{ t }}</option></select></div>
        <div class="col-6 col-md-2"><label class="form-label small mb-0" for="rb-valor">Valor (Kz)</label>
          <input id="rb-valor" v-model="nova.valor" class="form-control form-control-sm" inputmode="decimal" required /></div>
        <div class="col-12 col-md-3"><label class="form-label small mb-0" for="rb-classe">Classe</label>
          <select id="rb-classe" v-model="nova.classe" class="form-select form-select-sm">
            <option value="">Todas as classes</option>
            <option v-for="c in classes.dados.value" :key="c.id" :value="c.id">{{ c.designacao }}</option>
          </select></div>
        <template v-if="nova.tipo === 'propina'">
          <fieldset class="col-12"><legend class="form-label small mb-1">Meses cobrados</legend>
            <div class="d-flex flex-wrap gap-3">
              <div v-for="m in ORDEM_MESES" :key="m" class="form-check form-check-inline m-0">
                <input :id="`rb-m${m}`" v-model="nova.meses" class="form-check-input" type="checkbox" :value="m" />
                <label class="form-check-label small" :for="`rb-m${m}`">{{ MESES[m - 1] }}</label>
              </div>
            </div></fieldset>
          <div class="col-6 col-md-3"><label class="form-label small mb-0" for="rb-dia">Dia de vencimento</label>
            <input id="rb-dia" v-model="nova.diaVencimento" type="number" min="1" max="28" class="form-control form-control-sm" /></div>
          <div class="col-6 col-md-3"><label class="form-label small mb-0" for="rb-multa">Multa por atraso (%)</label>
            <input id="rb-multa" v-model="nova.multaPercentagem" type="number" min="0" max="100" step="0.5" class="form-control form-control-sm" /></div>
        </template>
        <div class="col-12"><button type="submit" class="btn btn-sm btn-primary" :disabled="accao.ocupado.value || (nova.tipo === 'propina' && !nova.meses.length)">Criar</button></div>
      </div>
    </form>
  </section>
</template>
