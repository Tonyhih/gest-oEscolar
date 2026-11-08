<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { data as fData, hoje } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const props = defineProps({ id: { type: String, required: true } });
const auth = useAutenticacao();
const route = useRoute();
const router = useRouter();
const accao = useAccao();

const turma = usePedido(() => api.get(`/turmas/${props.id}`));
const atribuicoes = usePedido(() => api.get(`/turmas/${props.id}/atribuicoes`), { inicial: [] });
const minhas = computed(() => atribuicoes.dados.value.filter((a) => a.professor === auth.utilizador.professorId));
const ehDT = computed(() => auth.dirige(props.id));

// ---------------------------------------------------------------- Registo de faltas (professor)
const disciplina = ref(route.query.disciplina ?? '');
watch(minhas, (l) => { if (!disciplina.value && l.length === 1) disciplina.value = l[0].disciplina; });
watch(disciplina, (d) => router.replace({ query: d ? { disciplina: d } : {} }));
const dia = ref(hoje());
const faltaram = ref(new Set());
const carregandoDia = ref(false);
async function carregarDia() {
  if (!disciplina.value) return;
  carregandoDia.value = true;
  try {
    const todas = await api.get(`/turmas/${props.id}/faltas`);
    faltaram.value = new Set(todas.filter((f) => f.disciplina === disciplina.value && f.data === dia.value).map((f) => f.matricula));
  } catch (e) {
    accao.erro.value = e;
  } finally {
    carregandoDia.value = false;
  }
}
watch([disciplina, dia], carregarDia, { immediate: true });
function alternar(m) {
  const s = new Set(faltaram.value);
  s.has(m) ? s.delete(m) : s.add(m);
  faltaram.value = s;
}
async function gravarFaltas() {
  const r = await accao.correr(() => api.put(`/turmas/${props.id}/disciplinas/${disciplina.value}/faltas`, [...faltaram.value], { data: dia.value }),
    `Faltas de ${fData(dia.value)} gravadas.`);
  if (r) { faltaram.value = new Set(r.map((f) => f.matricula)); if (verResumo.value) resumo.executar(); }
}

// ---------------------------------------------------------------- Resumo e justificação (director de turma e director)
const verResumo = computed(() => ehDT.value || auth.perfil === 'director');
const trimestre = ref(1);
const resumo = usePedido(() => (verResumo.value ? api.get(`/turmas/${props.id}/faltas/resumo`, { trimestre: trimestre.value }) : Promise.resolve([])), { inicial: [] });
const porJustificar = usePedido(() => (ehDT.value ? api.get(`/turmas/${props.id}/faltas`, { trimestre: trimestre.value }) : Promise.resolve([])), { inicial: [] });
watch(trimestre, () => { resumo.executar(); porJustificar.executar(); });
const injustificadas = computed(() => porJustificar.dados.value.filter((f) => f.estado === 'injustificada'));
async function justificar(f) {
  const motivo = prompt(`Motivo da falta de ${f.aluno.nome} a ${f.sigla} (${fData(f.data)}):`);
  if (!motivo) return;
  await accao.correr(() => api.post(`/faltas/${f.id}/justificar`, { motivo }), 'Falta justificada.');
  resumo.executar();
  porJustificar.executar();
}
</script>

<template>
  <RouterLink :to="{ name: 'turma', params: { id } }" class="small">&larr; Turma</RouterLink>
  <h1 class="h4 my-2">Faltas<template v-if="turma.dados.value"> · {{ turma.dados.value.designacao }}</template></h1>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <section v-if="minhas.length" class="card shadow-sm mb-3" aria-labelledby="t-registo">
    <div class="card-header"><h2 id="t-registo" class="h6 mb-0">Registar faltas de uma aula</h2></div>
    <div class="card-body">
      <div class="row g-2 mb-2">
        <div class="col-6 col-md-3"><label class="form-label small" for="f-disc">Disciplina</label>
          <select id="f-disc" v-model="disciplina" class="form-select form-select-sm">
            <option value="" disabled>—</option>
            <option v-for="a in minhas" :key="a.disciplina" :value="a.disciplina">{{ a.sigla }}</option>
          </select></div>
        <div class="col-6 col-md-3"><label class="form-label small" for="f-dia">Data da aula</label>
          <input id="f-dia" v-model="dia" type="date" class="form-control form-control-sm" :max="hoje()" /></div>
      </div>
      <EstadoPedido :carregando="carregandoDia || turma.carregando.value" :erro="turma.erro.value">
        <template v-if="disciplina && turma.dados.value">
          <p class="small text-body-secondary mb-2">Marque os alunos que <strong>faltaram</strong>. Desmarcar anula a falta.</p>
          <div class="list-group mb-2">
            <label v-for="a in turma.dados.value.alunos" :key="a.matricula" class="list-group-item d-flex gap-2 align-items-center"
                   :class="{ 'list-group-item-danger': faltaram.has(a.matricula) }">
              <input class="form-check-input m-0" type="checkbox" :checked="faltaram.has(a.matricula)" @change="alternar(a.matricula)" />
              <span>{{ a.nome }}</span>
            </label>
          </div>
          <button type="button" class="btn btn-primary" :disabled="accao.ocupado.value" @click="gravarFaltas">
            Gravar ({{ faltaram.size }} {{ faltaram.size === 1 ? 'falta' : 'faltas' }})
          </button>
        </template>
      </EstadoPedido>
    </div>
  </section>

  <section v-if="verResumo" aria-labelledby="t-resumo">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <h2 id="t-resumo" class="h6 mb-0">Resumo do trimestre</h2>
      <select v-model.number="trimestre" class="form-select form-select-sm w-auto" aria-label="Trimestre">
        <option :value="1">1.º trimestre</option><option :value="2">2.º trimestre</option><option :value="3">3.º trimestre</option>
      </select>
    </div>
    <EstadoPedido :carregando="resumo.carregando.value" :erro="resumo.erro.value" @repetir="resumo.executar()">
      <div class="table-responsive card shadow-sm mb-3">
        <table class="table table-sm mb-0">
          <thead><tr><th>Aluno</th><th>Por disciplina (justificadas / injustificadas)</th></tr></thead>
          <tbody>
            <tr v-for="l in resumo.dados.value" :key="l.aluno.id">
              <td>{{ l.aluno.nome }}</td>
              <td>
                <span v-if="!l.porDisciplina.length" class="text-body-secondary small">Sem faltas</span>
                <span v-for="d in l.porDisciplina" :key="d.disciplina" class="badge text-bg-light border me-1">
                  {{ d.disciplina }}: {{ d.justificadas }} / <span :class="{ 'text-danger': d.injustificadas }">{{ d.injustificadas }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </EstadoPedido>

    <template v-if="ehDT">
      <h2 class="h6">Faltas por justificar</h2>
      <EstadoPedido :carregando="porJustificar.carregando.value" :erro="porJustificar.erro.value" :vazio="injustificadas.length === 0"
                    texto-vazio="Não há faltas por justificar neste trimestre." @repetir="porJustificar.executar()">
        <ul class="list-group shadow-sm">
          <li v-for="f in injustificadas" :key="f.id" class="list-group-item d-flex justify-content-between align-items-center">
            <span>{{ f.aluno.nome }} · {{ f.sigla }} · {{ fData(f.data) }}</span>
            <button type="button" class="btn btn-sm btn-outline-primary" @click="justificar(f)">Justificar</button>
          </li>
        </ul>
      </EstadoPedido>
    </template>
  </section>
</template>
