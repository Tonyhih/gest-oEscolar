<script setup>
import { computed, reactive, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { data as fData, lerNota } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Estágio e TFC da 13.ª classe (RF40–RF43)
const auth = useAutenticacao();
const avalia = computed(() => auth.temPerfil('director', 'coordenador')); // notas e TFC
const accao = useAccao();
const { dados, carregando, erro, executar } = usePedido(() => api.get('/estagios'), { inicial: [] });

// Turmas da 13.ª e alunos ainda sem estágio
const turmas13 = usePedido(async () => (await api.get('/turmas')).filter((t) => t.avaliacao.apenasEstagio), { inicial: [] });
const professores = usePedido(() => api.get('/professores').catch(() => []), { inicial: [] });
const semEstagio = ref([]);
const turmaEscolhida = ref('');
async function escolherTurma() {
  if (!turmaEscolhida.value) { semEstagio.value = []; return; }
  const t = await api.get(`/turmas/${turmaEscolhida.value}`);
  const com = new Set(dados.value.map((e) => e.matricula));
  semEstagio.value = t.alunos.filter((a) => !com.has(a.matricula));
}
const novo = reactive({ matricula: '', entidade: '', orientadorEntidade: '', inicio: '', fim: '' });
async function registar() {
  const corpo = Object.fromEntries(Object.entries(novo).filter(([, v]) => v !== ''));
  await accao.correr(() => api.post('/estagios', corpo), 'Estágio registado.');
  if (!accao.erro.value) {
    Object.assign(novo, { matricula: '', entidade: '', orientadorEntidade: '', inicio: '', fim: '' });
    await executar();
    escolherTurma();
  }
}

// Edição: nota do estágio e TFC
const edicao = ref(null);
function editar(e) {
  edicao.value = {
    id: e.id, nome: e.aluno.nome, estado: e.estado, fim: e.fim ?? '', nota: e.nota ?? '',
    tema: e.tfc.tema ?? '', orientador: e.tfc.orientador ?? '', dataDefesa: e.tfc.dataDefesa ?? '',
    juri: (e.tfc.juri ?? []).join(', '), notaTfc: e.tfc.nota ?? '',
  };
}
const notaInvalida = (v) => { const n = lerNota(v); return n !== null && (Number.isNaN(n) || n < 0 || n > 20); };
async function gravar() {
  const ed = edicao.value;
  await accao.correr(async () => {
    await api.patch(`/estagios/${ed.id}`, {
      estado: ed.estado, ...(ed.fim ? { fim: ed.fim } : {}), ...(avalia.value ? { nota: lerNota(ed.nota) } : {}),
    });
    if (avalia.value) {
      const tfc = { nota: lerNota(ed.notaTfc) };
      if (ed.tema) tfc.tema = ed.tema;
      if (ed.orientador) tfc.orientador = ed.orientador;
      if (ed.dataDefesa) tfc.dataDefesa = ed.dataDefesa;
      if (ed.juri.trim()) tfc.juri = ed.juri.split(',').map((x) => x.trim()).filter(Boolean);
      await api.patch(`/estagios/${ed.id}/tfc`, tfc);
    }
  }, `Estágio de ${ed.nome} gravado.`);
  if (!accao.erro.value) { edicao.value = null; executar(); }
}
const nota = (v) => (v === null || v === undefined ? '—' : String(v).replace('.', ','));
</script>

<template>
  <h1 class="h4 mb-3">Estágios e TFC · 13.ª classe</h1>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <EstadoPedido :carregando="carregando" :erro="erro" :vazio="dados.length === 0"
                :texto-vazio="turmas13.dados.value.length ? 'Ainda não há estágios registados.' : 'A escola não tem turmas da 13.ª classe neste ano lectivo.'"
                @repetir="executar()">
    <div class="row g-3">
      <div v-for="e in dados" :key="e.id" class="col-md-6 col-xl-4">
        <div class="card h-100 shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between gap-2">
              <h2 class="h6 mb-1">{{ e.aluno.nome }}</h2>
              <span class="badge align-self-start" :class="e.cursoConcluido ? 'text-bg-success' : 'text-bg-secondary'">
                {{ e.cursoConcluido ? 'Curso concluído' : 'Por concluir' }}</span>
            </div>
            <p class="small text-body-secondary mb-2">{{ e.turmaDesignacao }} · {{ e.aluno.numeroProcesso }}</p>
            <dl class="row small mb-0">
              <dt class="col-5">Entidade</dt><dd class="col-7">{{ e.entidade }}</dd>
              <dt class="col-5">Período</dt><dd class="col-7">{{ fData(e.inicio) }} a {{ e.fim ? fData(e.fim) : '…' }}</dd>
              <dt class="col-5">Estado</dt><dd class="col-7">{{ e.estado === 'concluido' ? 'Concluído' : 'A decorrer' }}</dd>
              <dt class="col-5">Nota do estágio</dt><dd class="col-7" :class="{ negativa: e.nota !== null && e.nota < 10 }">{{ nota(e.nota) }}</dd>
              <dt class="col-5">TFC</dt><dd class="col-7">{{ e.tfc.tema ?? '—' }}</dd>
              <dt class="col-5">Defesa</dt><dd class="col-7">{{ e.tfc.dataDefesa ? fData(e.tfc.dataDefesa) : '—' }}
                <template v-if="e.tfc.nota !== null"> · <span :class="{ negativa: e.tfc.nota < 10 }">{{ nota(e.tfc.nota) }}</span></template></dd>
            </dl>
          </div>
          <div class="card-footer bg-transparent"><button type="button" class="btn btn-sm btn-outline-primary" @click="editar(e)">Actualizar</button></div>
        </div>
      </div>
    </div>
  </EstadoPedido>

  <form v-if="edicao" class="card card-body shadow-sm mt-3" @submit.prevent="gravar">
    <h2 class="h6">{{ edicao.nome }}</h2>
    <div class="row g-2">
      <div class="col-6 col-md-3"><label class="form-label small" for="ed-estado">Estado</label>
        <select id="ed-estado" v-model="edicao.estado" class="form-select form-select-sm"><option value="a_decorrer">A decorrer</option><option value="concluido">Concluído</option></select></div>
      <div class="col-6 col-md-3"><label class="form-label small" for="ed-fim">Fim</label><input id="ed-fim" v-model="edicao.fim" type="date" class="form-control form-control-sm" /></div>
      <div v-if="avalia" class="col-6 col-md-2"><label class="form-label small" for="ed-nota">Nota do estágio</label>
        <input id="ed-nota" v-model="edicao.nota" inputmode="decimal" class="form-control form-control-sm" :class="{ 'is-invalid': notaInvalida(edicao.nota) }" /></div>
    </div>
    <fieldset v-if="avalia" class="row g-2 mt-1">
      <legend class="h6 mt-2 mb-0">Trabalho de Fim de Curso</legend>
      <div class="col-md-6"><label class="form-label small" for="ed-tema">Tema</label><input id="ed-tema" v-model="edicao.tema" class="form-control form-control-sm" /></div>
      <div class="col-md-6"><label class="form-label small" for="ed-or">Orientador</label>
        <select id="ed-or" v-model="edicao.orientador" class="form-select form-select-sm">
          <option value="">—</option><option v-for="p in professores.dados.value" :key="p.id" :value="p.id">{{ p.nome }}</option>
        </select></div>
      <div class="col-6 col-md-3"><label class="form-label small" for="ed-def">Data da defesa</label><input id="ed-def" v-model="edicao.dataDefesa" type="date" class="form-control form-control-sm" /></div>
      <div class="col-6 col-md-2"><label class="form-label small" for="ed-ntfc">Nota da defesa</label>
        <input id="ed-ntfc" v-model="edicao.notaTfc" inputmode="decimal" class="form-control form-control-sm" :class="{ 'is-invalid': notaInvalida(edicao.notaTfc) }" /></div>
      <div class="col-md-7"><label class="form-label small" for="ed-juri">Júri (separado por vírgulas)</label><input id="ed-juri" v-model="edicao.juri" class="form-control form-control-sm" /></div>
    </fieldset>
    <p class="small text-body-secondary mt-2 mb-0">O curso fica concluído com o estágio e o TFC aprovados, cada um com nota ≥ 10.</p>
    <div class="mt-2 d-flex gap-2">
      <button type="submit" class="btn btn-sm btn-primary" :disabled="accao.ocupado.value || notaInvalida(edicao.nota) || notaInvalida(edicao.notaTfc)">Gravar</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="edicao = null">Cancelar</button>
    </div>
  </form>

  <form v-if="turmas13.dados.value.length" class="card card-body shadow-sm mt-3" @submit.prevent="registar">
    <h2 class="h6">Registar estágio</h2>
    <div class="row g-2">
      <div class="col-md-4"><label class="form-label small" for="n-turma">Turma</label>
        <select id="n-turma" v-model="turmaEscolhida" class="form-select form-select-sm" @change="escolherTurma">
          <option value="">—</option><option v-for="t in turmas13.dados.value" :key="t.id" :value="t.id">{{ t.designacao }}</option>
        </select></div>
      <div class="col-md-4"><label class="form-label small" for="n-aluno">Aluno</label>
        <select id="n-aluno" v-model="novo.matricula" class="form-select form-select-sm" required :disabled="!semEstagio.length">
          <option value="">—</option><option v-for="a in semEstagio" :key="a.matricula" :value="a.matricula">{{ a.nome }}</option>
        </select></div>
      <div class="col-md-4"><label class="form-label small" for="n-ent">Entidade de acolhimento</label><input id="n-ent" v-model="novo.entidade" class="form-control form-control-sm" required /></div>
      <div class="col-md-4"><label class="form-label small" for="n-orient">Orientador na entidade</label><input id="n-orient" v-model="novo.orientadorEntidade" class="form-control form-control-sm" /></div>
      <div class="col-6 col-md-4"><label class="form-label small" for="n-ini">Início</label><input id="n-ini" v-model="novo.inicio" type="date" class="form-control form-control-sm" required /></div>
      <div class="col-6 col-md-4"><label class="form-label small" for="n-fim">Fim previsto</label><input id="n-fim" v-model="novo.fim" type="date" class="form-control form-control-sm" /></div>
    </div>
    <p v-if="turmaEscolhida && !semEstagio.length" class="small text-body-secondary mt-2 mb-0">Todos os alunos desta turma já têm estágio.</p>
    <div class="mt-2"><button type="submit" class="btn btn-sm btn-primary" :disabled="accao.ocupado.value || !novo.matricula">Registar</button></div>
  </form>
</template>
