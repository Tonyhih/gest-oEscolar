<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { TURNOS } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';
import GrelhaHorario from '@/components/GrelhaHorario.vue';

// Horário semanal da turma: o director (ou o coordenador do curso) edita; os outros vêem
const props = defineProps({ id: { type: String, required: true } });
const auth = useAutenticacao();
const accao = useAccao();
const turma = usePedido(() => api.get(`/turmas/${props.id}`));
const horario = usePedido(() => api.get(`/turmas/${props.id}/horario`));
const atribuicoes = usePedido(() => api.get(`/turmas/${props.id}/atribuicoes`), { inicial: [] });
const podeEditar = computed(() => auth.temPerfil('director', 'coordenador'));

// Edição: { 'dia|tempo': disciplinaId }
const editar = ref(false);
const escolha = ref({});
const sabado = ref(false);
watch(() => horario.dados.value, (h) => { if (h) sabado.value = h.aulas.some((a) => a.dia === 6); });
function comecar() {
  escolha.value = Object.fromEntries(horario.dados.value.aulas.map((a) => [`${a.dia}|${a.tempo}`, a.disciplina.id]));
  editar.value = true;
}
const professorDe = (disciplina) => atribuicoes.dados.value.find((a) => a.disciplina === disciplina)?.professorNome;
const contagem = computed(() => {
  const c = {};
  for (const disc of Object.values(escolha.value)) if (disc) c[disc] = (c[disc] ?? 0) + 1;
  return c;
});
async function gravar() {
  const aulas = Object.entries(escolha.value).filter(([, disc]) => disc)
    .map(([chave, disciplina]) => { const [dia, tempo] = chave.split('|').map(Number); return { dia, tempo, disciplina }; });
  const r = await accao.correr(() => api.put(`/turmas/${props.id}/horario`, aulas), 'Horário gravado.');
  if (r) { horario.dados.value = r; editar.value = false; }
}
</script>

<template>
  <RouterLink :to="{ name: 'turma', params: { id } }" class="small nao-imprimir">&larr; Turma</RouterLink>
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 my-2">
    <h1 class="h4 mb-0">Horário<template v-if="turma.dados.value"> · {{ turma.dados.value.designacao }}</template></h1>
    <div class="d-flex gap-2 nao-imprimir">
      <button v-if="podeEditar && !editar && horario.dados.value" type="button" class="btn btn-primary" @click="comecar">Editar horário</button>
      <button v-if="!editar" type="button" class="btn btn-outline-secondary" onclick="window.print()">Imprimir</button>
    </div>
  </div>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <EstadoPedido :carregando="horario.carregando.value" :erro="horario.erro.value" @repetir="horario.executar()">
    <template v-if="horario.dados.value">
      <p class="small text-body-secondary nao-imprimir">
        Turno da {{ TURNOS[horario.dados.value.turno]?.toLowerCase() }} · {{ horario.dados.value.tempos.length }} tempos
        <template v-if="horario.dados.value.predefinidos"> (horas típicas; o director pode ajustá-las em Configuração → Tempos lectivos)</template>
      </p>

      <div v-if="!editar" class="card shadow-sm">
        <GrelhaHorario :tempos="horario.dados.value.tempos" :aulas="horario.dados.value.aulas" />
        <div v-if="!horario.dados.value.aulas.length" class="card-footer small text-body-secondary">Ainda não há aulas marcadas.</div>
      </div>

      <form v-else class="card shadow-sm" @submit.prevent="gravar">
        <div class="card-body pb-0">
          <p v-if="!atribuicoes.dados.value.length" class="alert alert-warning small">Atribua primeiro os professores às disciplinas (página da turma).</p>
          <div class="form-check mb-2">
            <input id="sabado" v-model="sabado" class="form-check-input" type="checkbox" />
            <label class="form-check-label small" for="sabado">Aulas ao sábado</label>
          </div>
        </div>
        <GrelhaHorario :tempos="horario.dados.value.tempos" :sabado="sabado">
          <template #celula="{ dia, tempo }">
            <select v-model="escolha[`${dia}|${tempo}`]" class="form-select form-select-sm" :aria-label="`Dia ${dia}, ${tempo}.º tempo`">
              <option :value="undefined">—</option>
              <option v-for="a in atribuicoes.dados.value" :key="a.disciplina" :value="a.disciplina">{{ a.sigla }}</option>
            </select>
          </template>
        </GrelhaHorario>
        <div class="card-body">
          <p class="small mb-1">Tempos por semana:</p>
          <span v-for="a in atribuicoes.dados.value" :key="a.disciplina" class="badge text-bg-light border me-1">
            {{ a.sigla }}: {{ contagem[a.disciplina] ?? 0 }} · {{ professorDe(a.disciplina) }}
          </span>
        </div>
        <div class="card-footer d-flex flex-wrap gap-2 align-items-center">
          <button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Gravar horário</button>
          <button type="button" class="btn btn-outline-secondary" @click="editar = false">Cancelar</button>
          <span class="small text-body-secondary">O sistema avisa se um professor ou uma sala ficarem em duas turmas ao mesmo tempo.</span>
        </div>
      </form>
    </template>
  </EstadoPedido>
</template>
