<script setup>
import { computed, ref } from 'vue';
import { useAutenticacao } from '@/stores/autenticacao.js';
import AnosLectivos from './AnosLectivos.vue';
import ClassesEscola from './ClassesEscola.vue';
import CursosDisciplinas from './CursosDisciplinas.vue';
import PlanosCurriculares from './PlanosCurriculares.vue';
import DadosEscola from './DadosEscola.vue';
import TemposLectivos from './TemposLectivos.vue';

const auth = useAutenticacao();
const separadores = computed(() => [
  ...(auth.perfil === 'director' ? [{ id: 'anos', texto: 'Ano lectivo', comp: AnosLectivos }, { id: 'classes', texto: 'Classes e avaliação', comp: ClassesEscola }] : []),
  { id: 'cursos', texto: 'Cursos e disciplinas', comp: CursosDisciplinas },
  { id: 'planos', texto: 'Planos curriculares', comp: PlanosCurriculares },
  ...(auth.perfil === 'director' ? [{ id: 'tempos', texto: 'Tempos lectivos', comp: TemposLectivos },
    { id: 'escola', texto: 'Dados da escola', comp: DadosEscola }] : []),
]);
const activo = ref(separadores.value[0].id);
const actual = computed(() => separadores.value.find((s) => s.id === activo.value));
</script>

<template>
  <h1 class="h4 mb-3">Configuração da escola</h1>
  <ul class="nav nav-tabs mb-3" role="tablist">
    <li v-for="s in separadores" :key="s.id" class="nav-item" role="presentation">
      <button type="button" class="nav-link" :class="{ active: activo === s.id }" role="tab" :aria-selected="activo === s.id"
              @click="activo = s.id">{{ s.texto }}</button>
    </li>
  </ul>
  <KeepAlive><component :is="actual.comp" :key="actual.id" /></KeepAlive>
</template>
