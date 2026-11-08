<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { useAccao } from '@/composables/usePedido.js';
import MensagemAccao from '@/components/MensagemAccao.vue';

const auth = useAutenticacao();
const route = useRoute();
const router = useRouter();
const email = ref('');
const palavraPasse = ref('');
const { ocupado, erro, correr } = useAccao();

async function entrar() {
  await correr(() => auth.entrar(email.value, palavraPasse.value));
  if (erro.value) return;
  if (auth.trocaPendente) return router.push({ name: 'trocar-palavra-passe' });
  const destino = typeof route.query.r === 'string' && route.query.r.startsWith('/') ? route.query.r : '/';
  router.push(destino);
}
</script>

<template>
  <div class="row justify-content-center pt-md-5">
    <div class="col-12 col-sm-9 col-md-6 col-lg-4">
      <div class="text-center mb-4">
        <h1 class="h3 fw-semibold">Gestão Escolar</h1>
        <p class="text-body-secondary mb-0">Alunos, turmas, notas, faltas e pautas</p>
      </div>
      <div class="card shadow-sm">
        <div class="card-body p-4">
          <div v-if="route.query.expirou" class="alert alert-warning py-2" role="status">A sessão terminou. Entre de novo.</div>
          <form novalidate @submit.prevent="entrar">
            <div class="mb-3">
              <label for="email" class="form-label">Email</label>
              <input id="email" v-model.trim="email" type="email" class="form-control" autocomplete="username" required autofocus />
            </div>
            <div class="mb-3">
              <label for="palavra-passe" class="form-label">Palavra-passe</label>
              <input id="palavra-passe" v-model="palavraPasse" type="password" class="form-control" autocomplete="current-password" required />
            </div>
            <MensagemAccao :erro="erro" />
            <button type="submit" class="btn btn-primary w-100" :disabled="ocupado || !email || !palavraPasse">
              <span v-if="ocupado" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Entrar
            </button>
          </form>
        </div>
      </div>
      <p class="small text-body-secondary text-center mt-3">Esqueceu-se da palavra-passe? Peça à direcção da escola para a repor.</p>
    </div>
  </div>
</template>
