<script setup>
// Estados de ecrã: carregamento, erro, vazio e sucesso (o conteúdo, no slot).
defineProps({
  carregando: { type: Boolean, default: false },
  erro: { type: Object, default: null },
  vazio: { type: Boolean, default: false },
  textoVazio: { type: String, default: 'Ainda não há registos.' },
});
defineEmits(['repetir']);
</script>

<template>
  <div v-if="carregando" class="d-flex align-items-center gap-2 text-body-secondary py-4" role="status">
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    <span>A carregar…</span>
  </div>
  <div v-else-if="erro" class="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">
    <span class="flex-grow-1">{{ erro.message }}</span>
    <button type="button" class="btn btn-sm btn-outline-danger" @click="$emit('repetir')">Tentar de novo</button>
  </div>
  <div v-else-if="vazio" class="text-body-secondary border rounded p-4 text-center">
    <slot name="vazio">{{ textoVazio }}</slot>
  </div>
  <slot v-else />
</template>
