<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { useAccao } from '@/composables/usePedido.js';
import MensagemAccao from '@/components/MensagemAccao.vue';

const auth = useAutenticacao();
const router = useRouter();
const actual = ref('');
const nova = ref('');
const confirmar = ref('');
const { ocupado, erro, sucesso, correr } = useAccao();

const problema = computed(() => {
  if (nova.value && nova.value.length < 8) return 'A nova palavra-passe tem de ter pelo menos 8 caracteres.';
  if (confirmar.value && confirmar.value !== nova.value) return 'As duas palavras-passe não coincidem.';
  return '';
});

async function gravar() {
  const obrigatoria = auth.trocaPendente;
  await correr(() => auth.alterarPalavraPasse(actual.value, nova.value), 'Palavra-passe alterada.');
  if (!erro.value && obrigatoria) router.push({ name: 'inicio' });
}
</script>

<template>
  <div class="row justify-content-center">
    <div class="col-12 col-md-7 col-lg-5">
      <h1 class="h4 mb-3">Alterar palavra-passe</h1>
      <div v-if="auth.trocaPendente" class="alert alert-info" role="status">
        Está a usar uma palavra-passe provisória. Escolha uma palavra-passe nova para continuar.
      </div>
      <div class="card shadow-sm">
        <form class="card-body" novalidate @submit.prevent="gravar">
          <div class="mb-3">
            <label for="actual" class="form-label">Palavra-passe actual</label>
            <input id="actual" v-model="actual" type="password" class="form-control" autocomplete="current-password" required />
          </div>
          <div class="mb-3">
            <label for="nova" class="form-label">Nova palavra-passe</label>
            <input id="nova" v-model="nova" type="password" class="form-control" autocomplete="new-password" minlength="8"
                   aria-describedby="ajuda-nova" required />
            <div id="ajuda-nova" class="form-text">Pelo menos 8 caracteres.</div>
          </div>
          <div class="mb-3">
            <label for="confirmar" class="form-label">Repita a nova palavra-passe</label>
            <input id="confirmar" v-model="confirmar" type="password" class="form-control" autocomplete="new-password" required />
          </div>
          <p v-if="problema" class="text-danger small" role="alert">{{ problema }}</p>
          <MensagemAccao :erro="erro" :sucesso="sucesso" />
          <button type="submit" class="btn btn-primary" :disabled="ocupado || !!problema || !actual || !nova || nova !== confirmar">
            Gravar
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
