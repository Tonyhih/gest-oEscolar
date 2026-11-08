import { createRouter, createWebHashHistory } from 'vue-router';

// Hash history (#/...): no GitHub Pages, recarregar a página não dá 404.
// As vistas são carregadas só quando são precisas (import dinâmico), para a primeira página ser leve (RNF06).

const TODOS = ['director', 'secretaria', 'coordenador', 'professor'];

export const rotas = [
  { path: '/entrar', name: 'entrar', component: () => import('@/views/EntrarView.vue'), meta: { publica: true, titulo: 'Entrar' } },
  { path: '/trocar-palavra-passe', name: 'trocar-palavra-passe', component: () => import('@/views/TrocarPalavraPasseView.vue'),
    meta: { titulo: 'Alterar palavra-passe', permiteTroca: true } },
  { path: '/privacidade', name: 'privacidade', component: () => import('@/views/PrivacidadeView.vue'),
    meta: { publica: true, sempre: true, titulo: 'Privacidade' } },
  { path: '/', name: 'inicio', component: () => import('@/views/InicioView.vue'), meta: { titulo: 'Início' } },

  { path: '/plataforma/escolas', name: 'escolas', component: () => import('@/views/EscolasView.vue'),
    meta: { perfis: ['admin_plataforma'], titulo: 'Escolas' } },

  { path: '/utilizadores', name: 'utilizadores', component: () => import('@/views/UtilizadoresView.vue'),
    meta: { perfis: ['director'], titulo: 'Utilizadores' } },
  { path: '/configuracao', name: 'configuracao', component: () => import('@/views/configuracao/ConfiguracaoView.vue'),
    meta: { perfis: ['director', 'coordenador'], titulo: 'Configuração' } },

  { path: '/alunos', name: 'alunos', component: () => import('@/views/AlunosView.vue'),
    meta: { perfis: ['director', 'secretaria', 'coordenador'], titulo: 'Alunos' } },
  { path: '/alunos/:id', name: 'aluno', component: () => import('@/views/AlunoView.vue'), props: true,
    meta: { perfis: TODOS, titulo: 'Aluno' } },

  { path: '/turmas', name: 'turmas', component: () => import('@/views/TurmasView.vue'), meta: { perfis: TODOS, titulo: 'Turmas' } },
  { path: '/turmas/:id', name: 'turma', component: () => import('@/views/TurmaView.vue'), props: true,
    meta: { perfis: TODOS, titulo: 'Turma' } },
  { path: '/turmas/:id/notas/:disciplina', name: 'notas', component: () => import('@/views/NotasView.vue'), props: true,
    meta: { perfis: TODOS, titulo: 'Notas' } },
  { path: '/turmas/:id/descritiva', name: 'descritiva', component: () => import('@/views/DescritivaView.vue'), props: true,
    meta: { perfis: ['professor'], titulo: 'Avaliação descritiva' } },
  { path: '/turmas/:id/faltas', name: 'faltas', component: () => import('@/views/FaltasView.vue'), props: true,
    meta: { perfis: ['director', 'professor'], titulo: 'Faltas' } },
  { path: '/turmas/:id/pautas', name: 'pautas', component: () => import('@/views/PautasView.vue'), props: true,
    meta: { perfis: TODOS, titulo: 'Pautas' } },

  { path: '/estagios', name: 'estagios', component: () => import('@/views/EstagiosView.vue'),
    meta: { perfis: ['director', 'secretaria', 'coordenador'], titulo: 'Estágios e TFC' } },
  { path: '/painel', name: 'painel', component: () => import('@/views/PainelView.vue'),
    meta: { perfis: ['director'], titulo: 'Painel' } },
  { path: '/auditoria', name: 'auditoria', component: () => import('@/views/AuditoriaView.vue'),
    meta: { perfis: ['director'], titulo: 'Auditoria' } },

  { path: '/:caminho(.*)*', redirect: '/' },
];

/**
 * Guarda de navegação. Não é uma medida de segurança: a API verifica sempre as permissões.
 * Serve para não mostrar ecrãs que o perfil não pode usar.
 */
export function guarda(auth) {
  return async (para) => {
    await auth.iniciar();
    if (para.meta.sempre) return true;
    if (para.meta.publica) return auth.autenticado ? { name: 'inicio' } : true;
    if (!auth.autenticado) return { name: 'entrar', query: { r: para.fullPath } };
    if (auth.trocaPendente && !para.meta.permiteTroca) return { name: 'trocar-palavra-passe' };
    if (para.meta.perfis && !auth.temPerfil(...para.meta.perfis)) return { name: 'inicio' };
    return true;
  };
}

export function criarRouter(auth) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: rotas,
    scrollBehavior: () => ({ top: 0 }),
  });
  router.beforeEach(guarda(auth));
  router.afterEach((para) => { document.title = `${para.meta.titulo ?? 'Início'} · Gestão Escolar`; });
  return router;
}
