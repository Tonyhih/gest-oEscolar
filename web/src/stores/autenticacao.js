import { defineStore } from 'pinia';
import { api, configurarCliente } from '@/api/cliente.js';

const CHAVE = 'gestao-escolar.token';

// sessionStorage: a sessão termina ao fechar o separador (decisão em 02-arquitetura.md).
const ler = () => { try { return sessionStorage.getItem(CHAVE); } catch { return null; } };
const gravar = (t) => { try { t ? sessionStorage.setItem(CHAVE, t) : sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } };

export const NOMES_PERFIL = {
  admin_plataforma: 'Administração da plataforma',
  director: 'Director(a)',
  secretaria: 'Secretaria',
  coordenador: 'Coordenação',
  professor: 'Professor(a)',
  encarregado: 'Encarregado(a) de educação',
  aluno: 'Aluno(a)',
};

export const useAutenticacao = defineStore('autenticacao', {
  state: () => ({ token: ler(), utilizador: null, iniciado: false }),

  getters: {
    autenticado: (s) => Boolean(s.token && s.utilizador),
    perfil: (s) => s.utilizador?.perfil ?? null,
    trocaPendente: (s) => Boolean(s.utilizador?.trocarPalavraPasse),
    /** Professor que dirige pelo menos uma turma */
    ehDirectorTurma: (s) => (s.utilizador?.turmasDirigidas?.length ?? 0) > 0,
  },

  actions: {
    temPerfil(...perfis) {
      return perfis.includes(this.perfil);
    },
    dirige(turmaId) {
      return this.utilizador?.turmasDirigidas?.includes(turmaId) ?? false;
    },

    /** Chamado uma vez, antes da primeira navegação: carrega o perfil se houver token guardado. */
    async iniciar() {
      if (this.iniciado) return;
      this.iniciado = true;
      if (!this.token) return;
      try {
        this.utilizador = await api.get('/auth/eu');
      } catch {
        this.limpar();
      }
    },

    /** Devolve o desafio do segundo factor (director) ou guarda a sessão. */
    async entrar(email, palavraPasse) {
      const r = await api.post('/auth/login', { email, palavraPasse });
      if (r.segundoFactor) return r;
      this.guardarSessao(r);
      return null;
    },

    async confirmarCodigo(desafio, codigo) {
      this.guardarSessao(await api.post('/auth/login/codigo', { desafio, codigo }));
    },

    guardarSessao({ token, utilizador }) {
      this.token = token;
      this.utilizador = utilizador;
      gravar(token);
    },

    async alterarPalavraPasse(actual, nova) {
      await api.post('/auth/palavra-passe', { actual, nova });
      this.utilizador = await api.get('/auth/eu');
    },

    /** Recarrega a sessão (por exemplo, depois de mudar o director de uma turma). */
    async actualizar() {
      this.utilizador = await api.get('/auth/eu');
    },

    limpar() {
      this.token = null;
      this.utilizador = null;
      gravar(null);
    },
  },
});

/** Liga a store ao cliente HTTP e ao router (chamado em main.js). */
export function ligarSessao(store, router) {
  configurarCliente({
    token: () => store.token,
    sessaoInvalida: (erro) => {
      if (erro.codigo === 'TROCAR_PALAVRA_PASSE') {
        if (store.utilizador) store.utilizador.trocarPalavraPasse = true;
        router.push({ name: 'trocar-palavra-passe' });
        return;
      }
      if (!store.token) return; // falha do próprio login: o formulário mostra a mensagem
      store.limpar();
      router.push({ name: 'entrar', query: { expirou: '1', r: router.currentRoute.value.fullPath } });
    },
  });
}
