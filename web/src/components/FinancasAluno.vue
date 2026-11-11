<script setup>
import { computed, ref, watch } from 'vue';
import { api, descarregar } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { data as fData, hoje, kz, METODOS } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Ficha financeira de um aluno: propinas e emolumentos, registo de pagamentos e recibos
const props = defineProps({ alunoId: { type: String, required: true } });
const auth = useAutenticacao();
const ehDirector = computed(() => auth.perfil === 'director');
const accao = useAccao();
const ficha = usePedido(() => api.get(`/alunos/${props.alunoId}/financas`));
const rubricas = usePedido(() => api.get('/financas/rubricas'), { inicial: [] });
const emolumentos = computed(() => rubricas.dados.value.filter((r) => r.tipo !== 'propina' && r.activa));

const escolhidas = ref([]);
const metodo = ref('numerario');
const referencia = ref('');
const dataPagamento = ref(hoje());
watch(() => props.alunoId, () => { escolhidas.value = []; ficha.executar(); });

const pendentes = computed(() => ficha.dados.value?.cobrancas.filter((c) => c.estado === 'pendente') ?? []);
const outras = computed(() => ficha.dados.value?.cobrancas.filter((c) => c.estado !== 'pendente') ?? []);
// Multa prevista na data escolhida (a API calcula a definitiva)
const totalEscolhido = computed(() => pendentes.value.filter((c) => escolhidas.value.includes(c.id))
  .reduce((s, c) => s + c.valor + (dataPagamento.value > c.vencimento ? c.multaPrevista : 0), 0));

const nomeRecibo = (p) => `recibo-${p.numeroTexto.replace('/', '-')}.pdf`;
const recibo = (p) => accao.correr(() => descarregar(`/pagamentos/${p.id}/recibo`, nomeRecibo(p)));

async function pagar() {
  const corpo = { cobrancas: escolhidas.value, metodo: metodo.value, referencia: referencia.value || undefined, dataPagamento: dataPagamento.value };
  const p = await accao.correr(() => api.post(`/alunos/${props.alunoId}/pagamentos`, corpo));
  if (p) {
    accao.sucesso.value = `Pagamento registado: recibo n.º ${p.numeroTexto}.`;
    escolhidas.value = [];
    referencia.value = '';
    await ficha.executar();
    await descarregar(`/pagamentos/${p.id}/recibo`, nomeRecibo(p)).catch(() => {});
  }
}

const emolumento = ref('');
async function cobrar() {
  const r = await accao.correr(() => api.post(`/alunos/${props.alunoId}/cobrancas`, { rubrica: emolumento.value }), 'Cobrança acrescentada.');
  if (r) { emolumento.value = ''; ficha.executar(); }
}

async function anular(tipo, item) {
  const motivo = prompt(tipo === 'pagamento'
    ? `Anular o recibo n.º ${item.numeroTexto}? As cobranças voltam a ficar por pagar. Indique o motivo:`
    : `Anular "${item.descricao}" (isenção, erro…)? Indique o motivo:`);
  if (!motivo || motivo.trim().length < 3) return;
  const caminho = tipo === 'pagamento' ? `/pagamentos/${item.id}/anular` : `/cobrancas/${item.id}/anular`;
  if (await accao.correr(() => api.post(caminho, { motivo: motivo.trim() }), tipo === 'pagamento' ? 'Recibo anulado.' : 'Cobrança anulada.')) ficha.executar();
}
const ESTADOS = { paga: 'text-bg-success', anulada: 'text-bg-secondary' };
</script>

<template>
  <div class="card shadow-sm mt-3">
    <div class="card-header d-flex flex-wrap justify-content-between gap-2">
      <span>Propinas e pagamentos</span>
      <span v-if="ficha.dados.value" class="small">
        Em dívida: <strong :class="{ 'text-danger': ficha.dados.value.totais.emAtraso > 0 }">{{ kz(ficha.dados.value.totais.emAtraso) }}</strong>
        · Por pagar: {{ kz(ficha.dados.value.totais.pendente) }} · Pago: {{ kz(ficha.dados.value.totais.pago) }}
      </span>
    </div>
    <div class="card-body">
      <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
      <EstadoPedido :carregando="ficha.carregando.value" :erro="ficha.erro.value">
        <template v-if="ficha.dados.value">
          <h3 class="h6">Por pagar</h3>
          <p v-if="!pendentes.length" class="small text-body-secondary">Nada por pagar.</p>
          <form v-else @submit.prevent="pagar">
            <div class="table-responsive">
              <table class="table table-sm align-middle small mb-2">
                <thead><tr><th scope="col"><span class="visually-hidden">Escolher</span></th><th>Descrição</th><th>Vencimento</th><th class="text-end">Valor</th><th class="text-end">Multa</th><th v-if="ehDirector"></th></tr></thead>
                <tbody>
                  <tr v-for="c in pendentes" :key="c.id" :class="{ 'table-danger': c.emAtraso }">
                    <td><input :id="`cb-${c.id}`" v-model="escolhidas" class="form-check-input" type="checkbox" :value="c.id" /></td>
                    <td><label :for="`cb-${c.id}`">{{ c.descricao }}</label></td>
                    <td>{{ fData(c.vencimento) }}<span v-if="c.emAtraso" class="badge text-bg-danger ms-1">em atraso</span></td>
                    <td class="text-end">{{ kz(c.valor) }}</td>
                    <td class="text-end">{{ c.multaPrevista ? kz(c.multaPrevista) : '—' }}</td>
                    <td v-if="ehDirector" class="text-end"><button type="button" class="btn btn-sm btn-link text-danger p-0" @click="anular('cobranca', c)">Anular</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="row g-2 align-items-end">
              <div class="col-6 col-md-3"><label class="form-label small mb-0" for="pg-metodo">Forma de pagamento</label>
                <select id="pg-metodo" v-model="metodo" class="form-select form-select-sm">
                  <option v-for="(t, k) in METODOS" :key="k" :value="k">{{ t }}</option>
                </select></div>
              <div class="col-6 col-md-3"><label class="form-label small mb-0" for="pg-ref">Referência (opcional)</label>
                <input id="pg-ref" v-model="referencia" class="form-control form-control-sm" maxlength="60" placeholder="N.º do talão…" /></div>
              <div class="col-6 col-md-2"><label class="form-label small mb-0" for="pg-data">Data</label>
                <input id="pg-data" v-model="dataPagamento" type="date" class="form-control form-control-sm" :max="hoje()" required /></div>
              <div class="col-6 col-md-4">
                <button type="submit" class="btn btn-sm btn-success w-100" :disabled="!escolhidas.length || accao.ocupado.value">
                  Registar pagamento<template v-if="escolhidas.length"> · {{ kz(totalEscolhido) }}</template>
                </button></div>
            </div>
          </form>

          <div v-if="emolumentos.length" class="d-flex flex-wrap gap-2 align-items-end mt-3">
            <div><label class="form-label small mb-0" for="pg-emol">Cobrar emolumento</label>
              <select id="pg-emol" v-model="emolumento" class="form-select form-select-sm">
                <option value="">—</option>
                <option v-for="r in emolumentos" :key="r.id" :value="r.id">{{ r.nome }} · {{ kz(r.valor) }}</option>
              </select></div>
            <button type="button" class="btn btn-sm btn-outline-primary" :disabled="!emolumento || accao.ocupado.value" @click="cobrar">Acrescentar</button>
          </div>

          <h3 class="h6 mt-4">Recibos</h3>
          <p v-if="!ficha.dados.value.pagamentos.length" class="small text-body-secondary">Ainda não há pagamentos.</p>
          <ul v-else class="list-group">
            <li v-for="p in ficha.dados.value.pagamentos" :key="p.id" class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span>
                <strong :class="{ 'text-decoration-line-through': p.estado === 'anulado' }">Recibo n.º {{ p.numeroTexto }} · {{ kz(p.valorTotal) }}</strong>
                <span v-if="p.estado === 'anulado'" class="badge text-bg-secondary ms-1" :title="p.anuladoMotivo">anulado</span>
                <span class="small text-body-secondary d-block">{{ fData(p.dataPagamento) }} · {{ METODOS[p.metodo] }} · {{ p.itens.map((i) => i.descricao).join(', ') }}</span>
              </span>
              <span class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary" @click="recibo(p)">PDF</button>
                <button v-if="ehDirector && p.estado === 'valido'" type="button" class="btn btn-sm btn-outline-danger" @click="anular('pagamento', p)">Anular</button>
              </span>
            </li>
          </ul>

          <details v-if="outras.length" class="mt-3 small">
            <summary>Cobranças pagas e anuladas ({{ outras.length }})</summary>
            <ul class="list-unstyled mt-2 mb-0">
              <li v-for="c in outras" :key="c.id">
                <span class="badge me-1" :class="ESTADOS[c.estado]">{{ c.estado }}</span>{{ c.descricao }} · {{ kz(c.valor) }}
                <span v-if="c.anuladaMotivo" class="text-body-secondary"> · {{ c.anuladaMotivo }}</span>
              </li>
            </ul>
          </details>
        </template>
      </EstadoPedido>
    </div>
  </div>
</template>
