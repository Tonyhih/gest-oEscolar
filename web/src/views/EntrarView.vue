<script setup>
import { ref } from 'vue';
import { api } from '@/api/cliente.js';
import { useRoute, useRouter } from 'vue-router';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { useAccao } from '@/composables/usePedido.js';
import MensagemAccao from '@/components/MensagemAccao.vue';

const auth = useAutenticacao();
const route = useRoute();
const router = useRouter();
const email = ref('');
const palavraPasse = ref('');
const { ocupado, erro, sucesso, correr } = useAccao();
// Segundo factor do director: código enviado por email
const desafio = ref(null);
const codigo = ref('');

async function entrar() {
  const d = await correr(() => auth.entrar(email.value, palavraPasse.value));
  if (erro.value) return;
  if (d) { desafio.value = d; codigo.value = ''; return; }
  seguir();
}
async function confirmar() {
  await correr(() => auth.confirmarCodigo(desafio.value.desafio, codigo.value.trim()));
  if (erro.value) {
    if (/expirou|Demasiadas/.test(erro.value.message)) { desafio.value = null; palavraPasse.value = ''; }
    return;
  }
  seguir();
}
async function reenviar() {
  const d = await correr(() => api.post('/auth/login/reenviar', { desafio: desafio.value.desafio }), 'Enviámos um código novo.');
  if (d) desafio.value = d;
}
function voltar() {
  desafio.value = null;
  erro.value = null;
}
function seguir() {
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
          <form v-if="desafio" novalidate @submit.prevent="confirmar">
            <p>Enviámos um código de 6 algarismos para <strong>{{ desafio.email }}</strong>. É válido durante 10 minutos.</p>
            <div class="mb-3">
              <label for="codigo" class="form-label">Código de acesso</label>
              <input id="codigo" v-model.trim="codigo" class="form-control form-control-lg text-center" inputmode="numeric"
                     autocomplete="one-time-code" maxlength="6" pattern="\d{6}" required autofocus />
            </div>
            <MensagemAccao :erro="erro" :sucesso="sucesso" />
            <button type="submit" class="btn btn-primary w-100" :disabled="ocupado || !/^\d{6}$/.test(codigo)">
              <span v-if="ocupado" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Confirmar
            </button>
            <div class="d-flex justify-content-between mt-3 small">
              <button type="button" class="btn btn-link btn-sm p-0" :disabled="ocupado" @click="reenviar">Enviar outro código</button>
              <button type="button" class="btn btn-link btn-sm p-0" @click="voltar">Voltar</button>
            </div>
          </form>
          <form v-else novalidate @submit.prevent="entrar">
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
