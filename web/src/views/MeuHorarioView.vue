<script setup>
import { computed } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido } from '@/composables/usePedido.js';
import { TURNOS } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import GrelhaHorario from '@/components/GrelhaHorario.vue';

// Horário do professor no ano lectivo activo, um quadro por turno
const { dados, carregando, erro, executar } = usePedido(() => api.get('/horario/professor'));
const turnos = computed(() => Object.keys(dados.value?.tempos ?? {}).sort((a, b) => Object.keys(TURNOS).indexOf(a) - Object.keys(TURNOS).indexOf(b)));
const total = computed(() => dados.value?.aulas.length ?? 0);
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
    <h1 class="h4 mb-0">O meu horário</h1>
    <button type="button" class="btn btn-outline-secondary nao-imprimir" onclick="window.print()">Imprimir</button>
  </div>
  <EstadoPedido :carregando="carregando" :erro="erro" :vazio="total === 0"
                texto-vazio="Ainda não tem aulas marcadas nos horários das turmas." @repetir="executar()">
    <p class="small text-body-secondary">{{ total }} tempos por semana.</p>
    <section v-for="t in turnos" :key="t" class="card shadow-sm mb-3">
      <div class="card-header">{{ TURNOS[t] }}</div>
      <GrelhaHorario :tempos="dados.tempos[t]" :aulas="dados.aulas.filter((a) => a.turno === t)" mostrar="professor" />
    </section>
  </EstadoPedido>
</template>
