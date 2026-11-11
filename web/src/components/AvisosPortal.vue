<script setup>
import { computed, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido } from '@/composables/usePedido.js';
import { dataHora } from '@/util/formatar.js';

// Avisos do portal: notas publicadas, faltas, faltas vermelhas, propinas e recibos
const avisos = usePedido(() => api.get('/portal/avisos'), { inicial: { naoLidos: 0, avisos: [] } });
const verTodos = ref(false);
const visiveis = computed(() => (verTodos.value ? avisos.dados.value.avisos : avisos.dados.value.avisos.slice(0, 5)));
const ICONES = {
  notas_publicadas: { texto: 'Notas', classe: 'text-bg-success' },
  faltas_injustificadas: { texto: 'Faltas', classe: 'text-bg-warning' },
  falta_disciplinar: { texto: 'Falta vermelha', classe: 'text-bg-danger' },
  propina_atraso: { texto: 'Propina', classe: 'text-bg-warning' },
  recibo: { texto: 'Recibo', classe: 'text-bg-primary' },
};
async function lido(ids) {
  try { avisos.dados.value = await api.post('/portal/avisos/lidos', ids ? { avisos: ids } : {}); } catch { /* volta a tentar na próxima abertura */ }
}
</script>

<template>
  <section v-if="avisos.dados.value.avisos.length" class="card shadow-sm mb-3" aria-labelledby="t-avisos">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <h2 id="t-avisos" class="h6 mb-0">
        Avisos <span v-if="avisos.dados.value.naoLidos" class="badge rounded-pill text-bg-danger">{{ avisos.dados.value.naoLidos }} por ler</span>
      </h2>
      <button v-if="avisos.dados.value.naoLidos" type="button" class="btn btn-sm btn-outline-secondary" @click="lido()">Marcar todos como lidos</button>
    </div>
    <ul class="list-group list-group-flush">
      <li v-for="a in visiveis" :key="a.id" class="list-group-item" :class="{ 'bg-body-tertiary': a.lido }">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <span>
            <span class="badge me-1" :class="ICONES[a.tipo].classe">{{ ICONES[a.tipo].texto }}</span>
            <strong :class="{ 'fw-normal': a.lido }">{{ a.titulo }}</strong>
          </span>
          <span class="small text-body-secondary">{{ a.aluno }} · {{ dataHora(a.criadoEm) }}</span>
        </div>
        <div class="small mt-1">{{ a.mensagem }}</div>
        <button v-if="!a.lido" type="button" class="btn btn-sm btn-link p-0" @click="lido([a.id])">Marcar como lido</button>
      </li>
    </ul>
    <div v-if="avisos.dados.value.avisos.length > 5" class="card-footer">
      <button type="button" class="btn btn-sm btn-link p-0" @click="verTodos = !verTodos">
        {{ verTodos ? 'Mostrar só os recentes' : `Ver todos (${avisos.dados.value.avisos.length})` }}
      </button>
    </div>
  </section>
</template>
