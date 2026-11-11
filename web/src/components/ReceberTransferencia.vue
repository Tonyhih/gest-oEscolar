<script setup>
import { computed, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { data as fData, dataHora, nota1 } from '@/util/formatar.js';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Escola de destino: introduz o código da guia, confere os dados e escolhe a turma
const props = defineProps({ turmas: { type: Array, required: true } });
const emit = defineEmits(['recebido']);
const accao = useAccao();
const lista = usePedido(() => api.get('/transferencias'), { inicial: [] });
const codigo = ref('');
const previa = ref(null);
const turma = ref('');
const resultado = ref(null);
const turmasDaClasse = computed(() => props.turmas.filter((t) => t.classeCodigo === previa.value?.matricula.classe));
const ESTADOS = { pendente: 'text-bg-warning', aceite: 'text-bg-success', recusada: 'text-bg-danger', cancelada: 'text-bg-secondary' };
const classeTexto = (c) => (c === 'INI' ? 'Iniciação' : `${c}.ª classe`);

// Médias por disciplina e trimestre, a partir de MAC, NPP e NPT
const notas = computed(() => {
  const m = new Map();
  for (const n of previa.value?.dados.notasAno ?? []) {
    if (!m.has(n.nome)) m.set(n.nome, [null, null, null]);
    m.get(n.nome)[n.trimestre - 1] = [n.mac, n.npp, n.npt].includes(null) ? null : (n.mac + n.npp + n.npt) / 3;
  }
  return [...m];
});

async function procurar() {
  resultado.value = null;
  previa.value = await accao.correr(() => api.get(`/transferencias/codigo/${codigo.value.trim().toUpperCase()}`));
  turma.value = turmasDaClasse.value.length === 1 ? turmasDaClasse.value[0].id : '';
}
async function aceitar() {
  const r = await accao.correr(() => api.post(`/transferencias/${previa.value.id}/aceitar`, { codigo: codigo.value.trim(), turma: turma.value }));
  if (r) {
    resultado.value = r;
    previa.value = null;
    codigo.value = '';
    lista.executar();
    emit('recebido');
  }
}
async function recusar() {
  const motivo = prompt('Recusar a transferência? Indique o motivo (a escola de origem vê-o):');
  if (!motivo || motivo.trim().length < 3) return;
  if (await accao.correr(() => api.post(`/transferencias/${previa.value.id}/recusar`, { motivo: motivo.trim() }), 'Transferência recusada.')) {
    previa.value = null;
    codigo.value = '';
    lista.executar();
  }
}
</script>

<template>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <div v-if="resultado" class="alert alert-success" role="status">
    <strong>{{ resultado.aluno.nome }}</strong> recebido(a) com o processo <strong>{{ resultado.aluno.numeroProcesso }}</strong>
    ({{ resultado.notas }} notas do ano copiadas).
    <RouterLink :to="{ name: 'aluno', params: { id: resultado.aluno.id } }">Abrir a ficha</RouterLink>
    <div v-if="resultado.semCorrespondencia.length" class="small mt-1">
      Estas disciplinas não existem nesta escola e não foram copiadas: {{ resultado.semCorrespondencia.join(', ') }}.
      Lance-as no histórico escolar, se for preciso.
    </div>
  </div>

  <form class="card shadow-sm mb-3" @submit.prevent="procurar">
    <div class="card-body d-flex flex-wrap gap-2 align-items-end">
      <div><label class="form-label small mb-0" for="tr-codigo">Código da guia de transferência</label>
        <input id="tr-codigo" v-model="codigo" class="form-control text-uppercase" maxlength="8" required pattern="[A-Za-z0-9]{8}"
               placeholder="8 letras e números" autocomplete="off" /></div>
      <button type="submit" class="btn btn-outline-primary" :disabled="accao.ocupado.value">Procurar</button>
    </div>
  </form>

  <section v-if="previa" class="card shadow-sm mb-3" aria-labelledby="t-previa">
    <div class="card-header"><h2 id="t-previa" class="h6 mb-0">{{ previa.aluno.nome }} · vem de {{ previa.escolaOrigem }}</h2></div>
    <div class="card-body">
      <p class="mb-2">
        {{ classeTexto(previa.matricula.classe) }} ({{ previa.matricula.turma }}, {{ previa.matricula.anoLectivo }}) ·
        nascido(a) a {{ fData(previa.dados.aluno.dataNascimento) }} · motivo: {{ previa.motivo }}
      </p>
      <p class="small mb-2">
        Encarregados: {{ previa.dados.encarregados.map((e) => `${e.nome} (${e.parentesco})`).join(', ') || '—' }}<br />
        Histórico: {{ previa.dados.historico.map((h) => `${h.classe}.ª (${h.anoLectivo})`).join(', ') || 'sem classes anteriores' }}
      </p>
      <div v-if="notas.length" class="table-responsive">
        <table class="table table-sm small text-center mb-2" style="max-width: 32rem">
          <thead><tr><th class="text-start">Disciplina</th><th>1.º T</th><th>2.º T</th><th>3.º T</th></tr></thead>
          <tbody><tr v-for="[nome, t] in notas" :key="nome"><td class="text-start">{{ nome }}</td><td v-for="(v, i) in t" :key="i">{{ nota1(v) }}</td></tr></tbody>
        </table>
      </div>
      <div v-if="previa.semCorrespondencia.length" class="alert alert-warning small py-2">
        Estas disciplinas não existem nesta escola e não serão copiadas: {{ previa.semCorrespondencia.join(', ') }}.
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-end">
        <div><label class="form-label small mb-0" for="tr-turma">Turma</label>
          <select id="tr-turma" v-model="turma" class="form-select form-select-sm" required>
            <option value="" disabled>—</option>
            <option v-for="t in turmasDaClasse" :key="t.id" :value="t.id">{{ t.designacao }} ({{ t.totalAlunos }}/{{ t.capacidade }})</option>
          </select></div>
        <button type="button" class="btn btn-sm btn-success" :disabled="!turma || accao.ocupado.value" @click="aceitar">Aceitar e matricular</button>
        <button type="button" class="btn btn-sm btn-outline-danger" :disabled="accao.ocupado.value" @click="recusar">Recusar</button>
      </div>
      <p v-if="!turmasDaClasse.length" class="small text-danger mt-2 mb-0">Não há turmas da {{ classeTexto(previa.matricula.classe) }} no ano lectivo activo.</p>
    </div>
  </section>

  <h2 class="h6">Guias enviadas e recebidas</h2>
  <p v-if="!lista.dados.value.length" class="small text-body-secondary">Ainda não há transferências.</p>
  <ul v-else class="list-group">
    <li v-for="g in lista.dados.value" :key="g.id" class="list-group-item d-flex flex-wrap justify-content-between gap-2">
      <span>
        <span class="badge me-1" :class="ESTADOS[g.estado]">{{ g.estado }}</span>
        <RouterLink v-if="g.aluno.id" :to="{ name: 'aluno', params: { id: g.aluno.id } }">{{ g.aluno.nome }}</RouterLink><template v-else>{{ g.aluno.nome }}</template>
        · {{ g.sentido === 'enviada' ? `para ${g.escolaDestino}` : `de ${g.escolaOrigem}` }}
      </span>
      <span class="small text-body-secondary">{{ dataHora(g.criadoEm) }}<template v-if="g.resposta"> · {{ g.resposta }}</template></span>
    </li>
  </ul>
</template>
