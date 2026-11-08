<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAutenticacao, NOMES_PERFIL } from '@/stores/autenticacao.js';

const auth = useAutenticacao();
const router = useRouter();

// Menu conforme o perfil (a API volta a verificar as permissões)
const menu = computed(() => {
  const p = auth.perfil;
  if (!auth.autenticado || auth.trocaPendente) return [];
  if (p === 'admin_plataforma') return [{ nome: 'escolas', texto: 'Escolas' }];
  const itens = [{ nome: 'turmas', texto: p === 'professor' ? 'As minhas turmas' : 'Turmas' }];
  if (['director', 'secretaria'].includes(p)) itens.push({ nome: 'matriculas', texto: 'Matrículas' });
  if (['director', 'secretaria', 'coordenador'].includes(p)) itens.push({ nome: 'alunos', texto: 'Alunos' });
  if (['director', 'secretaria', 'coordenador'].includes(p)) itens.push({ nome: 'estagios', texto: 'Estágios' });
  if (['director', 'coordenador'].includes(p)) itens.push({ nome: 'configuracao', texto: 'Configuração' });
  if (p === 'director') {
    itens.unshift({ nome: 'painel', texto: 'Painel' });
    itens.push({ nome: 'utilizadores', texto: 'Utilizadores' }, { nome: 'auditoria', texto: 'Auditoria' });
  }
  return itens;
});

function sair() {
  auth.limpar();
  router.push({ name: 'entrar' });
}
</script>

<template>
  <a class="visually-hidden-focusable position-absolute p-2 bg-body" href="#conteudo">Saltar para o conteúdo</a>
  <nav v-if="auth.autenticado" class="navbar navbar-expand-lg bg-success" data-bs-theme="dark" aria-label="Menu principal">
    <div class="container-fluid">
      <RouterLink class="navbar-brand fw-semibold" :to="{ name: 'inicio' }">Gestão Escolar</RouterLink>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#menu"
              aria-controls="menu" aria-expanded="false" aria-label="Abrir o menu">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div id="menu" class="collapse navbar-collapse">
        <ul class="navbar-nav me-auto">
          <li v-for="item in menu" :key="item.nome" class="nav-item">
            <RouterLink class="nav-link" active-class="active" :to="{ name: item.nome }">{{ item.texto }}</RouterLink>
          </li>
        </ul>
        <div class="d-flex flex-column flex-lg-row align-items-lg-center gap-2 text-white small text-nowrap">
          <span :title="auth.utilizador.escola?.nome">
            <strong>{{ auth.utilizador.nome }}</strong> · {{ NOMES_PERFIL[auth.perfil] }}
          </span>
          <RouterLink class="btn btn-sm btn-outline-light" :to="{ name: 'trocar-palavra-passe' }">Palavra-passe</RouterLink>
          <button type="button" class="btn btn-sm btn-light" @click="sair">Sair</button>
        </div>
      </div>
    </div>
  </nav>
  <main id="conteudo" class="container-lg py-3 px-3">
    <RouterView />
  </main>
  <footer class="container-lg px-3 pb-3 small text-body-secondary nao-imprimir">
    <RouterLink :to="{ name: 'privacidade' }" class="link-secondary">Política de privacidade</RouterLink>
  </footer>
</template>
