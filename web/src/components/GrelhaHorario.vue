<script setup>
import { computed } from 'vue';

// Grelha semanal (tempos × dias). Só leitura; no modo de edição, cada célula usa o slot "celula".
const props = defineProps({
  tempos: { type: Array, required: true },          // [{ numero, inicio, fim }]
  aulas: { type: Array, default: () => [] },        // [{ dia, tempo, disciplina, professor, turma, sala }]
  mostrar: { type: String, default: 'turma' },      // 'turma': disciplina + professor · 'professor': turma + disciplina
  sabado: { type: Boolean, default: false },
});
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const dias = computed(() => (props.sabado || props.aulas.some((a) => a.dia === 6) ? 6 : 5));
const mapa = computed(() => new Map(props.aulas.map((a) => [`${a.dia}|${a.tempo}`, a])));
const aula = (dia, tempo) => mapa.value.get(`${dia}|${tempo}`);
</script>

<template>
  <div class="table-responsive">
    <table class="table table-sm table-bordered text-center align-middle mb-0 grelha-horario">
      <thead>
        <tr><th scope="col">Tempo</th><th v-for="d in dias" :key="d" scope="col">{{ DIAS[d - 1] }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in tempos" :key="t.numero">
          <th scope="row" class="text-nowrap small">{{ t.numero }}.º<br /><span class="fw-normal text-body-secondary">{{ t.inicio }}–{{ t.fim }}</span></th>
          <td v-for="d in dias" :key="d" :class="{ 'table-success': aula(d, t.numero) && !$slots.celula }">
            <slot name="celula" :dia="d" :tempo="t.numero">
              <template v-if="aula(d, t.numero)">
                <template v-if="mostrar === 'turma'">
                  <strong>{{ aula(d, t.numero).disciplina.sigla }}</strong>
                  <div class="small text-body-secondary text-truncate" :title="aula(d, t.numero).professor.nome">{{ aula(d, t.numero).professor.nome }}</div>
                </template>
                <template v-else>
                  <strong>{{ aula(d, t.numero).turma.designacao }}</strong>
                  <div class="small">{{ aula(d, t.numero).disciplina.sigla }}<span v-if="aula(d, t.numero).sala" class="text-body-secondary"> · {{ aula(d, t.numero).sala }}</span></div>
                </template>
              </template>
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.grelha-horario { table-layout: fixed; min-width: 40rem; }
.grelha-horario th:first-child { width: 6.5rem; }
.grelha-horario td { height: 3.2rem; overflow: hidden; }
.grelha-horario td .text-truncate { max-width: 8rem; margin: 0 auto; }
</style>
