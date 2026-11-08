<script setup>
// Mostra o resultado de uma acção: erro da API (com detalhes de validação) ou sucesso.
defineProps({
  erro: { type: Object, default: null },
  sucesso: { type: String, default: '' },
});
</script>

<template>
  <div v-if="erro" class="alert alert-danger py-2 mb-2" role="alert">
    {{ erro.message }}
    <ul v-if="erro.detalhes?.length" class="mb-0 small">
      <li v-for="(d, i) in erro.detalhes" :key="i">{{ d.campo.replace(/^(body|query|params)\.?/, '') || 'pedido' }}: {{ d.mensagem }}</li>
    </ul>
  </div>
  <div v-else-if="sucesso" class="alert alert-success py-2 mb-2" role="status">{{ sucesso }}</div>
</template>
