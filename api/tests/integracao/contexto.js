import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { aplicarMigracoes } from '../../src/bd/migracoes.js';
import { semear } from '../../src/bd/seed.js';
import { criarApp } from '../../src/app.js';

export const PALAVRA_PASSE = 'Teste#2026';

/** Adapta o PGlite à interface { query, transaccao } usada pela aplicação. */
function adaptar(pglite) {
  return {
    query: (sql, p) => pglite.query(sql, p),
    transaccao: (fn) => pglite.transaction((tx) => fn(tx)),
  };
}

/**
 * Cria uma API completa com uma base de dados PostgreSQL em memória, migrada e com o seed.
 * Devolve helpers para pedidos autenticados.
 */
export async function criarContexto({ limiteLogin = 1000, segundoFactor = null } = {}) {
  const pglite = new PGlite({ parsers: { 1700: (v) => (v === null ? null : Number(v)), 1082: (v) => v } });
  await aplicarMigracoes(pglite);
  await pglite.query('BEGIN');
  await semear(pglite, { palavraPasse: PALAVRA_PASSE });
  await pglite.query('COMMIT');

  const bd = adaptar(pglite);
  const emails = [];
  const config = {
    producao: false,
    jwt: { segredo: 'segredo-de-teste-com-mais-de-32-caracteres', expira: '1h' },
    corsOrigens: ['http://localhost:5173'],
    limiteLogin,
    segundoFactor,
    // Os emails ficam numa caixa em memória (ctx.emails), para os testes lerem os códigos
    email: { enviar: async (m) => { emails.push(m); } },
  };
  const app = criarApp({ bd, config });
  const tokens = new Map();

  const ctx = {
    app, bd, config, emails,
    /** Faz login (com cache) e devolve o token. */
    async token(email, palavraPasse = PALAVRA_PASSE) {
      if (!tokens.has(email)) {
        const r = await request(app).post('/api/v1/auth/login').send({ email, palavraPasse });
        if (r.status !== 200) throw new Error(`Login falhou para ${email}: ${r.status} ${JSON.stringify(r.body)}`);
        tokens.set(email, r.body.token);
      }
      return tokens.get(email);
    },
    /** Pedido autenticado: ctx.como('secretaria@lda101.test').get('/alunos') */
    como(email) {
      const pedido = (metodo) => (caminho) => {
        const req = request(app)[metodo](`/api/v1${caminho}`);
        const original = req.then.bind(req);
        // O token é obtido de forma assíncrona antes de enviar
        req.then = (ok, falha) => ctx.token(email).then((t) => { req.set('Authorization', `Bearer ${t}`); return original(ok, falha); });
        return req;
      };
      return { get: pedido('get'), post: pedido('post'), put: pedido('put'), patch: pedido('patch') };
    },
    anonimo: () => request(app),
    /** Primeira linha de uma consulta SQL directa (para obter ids do seed). */
    um: async (sql, p) => (await pglite.query(sql, p)).rows[0],
    todos: async (sql, p) => (await pglite.query(sql, p)).rows,
  };
  return ctx;
}

// E-mails do seed
export const A = {
  director: 'director@lda101.test', secretaria: 'secretaria@lda101.test',
  lurdes: 'lurdes@lda101.test', // LP, HIS, EMC, GEO; dirige a Iniciação A e a 6.ª A
  adao: 'adao@lda101.test',     // MAT, CN, FIS; dirige a 7.ª A e a 9.ª A
};
export const B = {
  director: 'director@hbo201.test', secretaria: 'secretaria@hbo201.test', coordenador: 'coordenador@hbo201.test',
  rui: 'rui@hbo201.test', marta: 'marta@hbo201.test',
};
export const ADMIN = 'admin@plataforma.test';

/** id da turma de uma classe (codigo) de uma escola (codigo). */
export const turmaDe = (ctx, escola, classe) => ctx.um(`
  SELECT t.id FROM turmas t JOIN classes c ON c.id = t.classe_id JOIN escolas e ON e.id = t.escola_id
  WHERE e.codigo = $1 AND c.codigo = $2`, [escola, classe]).then((r) => r.id);

export const disciplinaDe = (ctx, escola, sigla) => ctx.um(`
  SELECT d.id FROM disciplinas d JOIN escolas e ON e.id = d.escola_id WHERE e.codigo = $1 AND d.sigla = $2`, [escola, sigla])
  .then((r) => r.id);

export const alunoPorNome = (ctx, nome) => ctx.um(`
  SELECT a.id, m.id AS matricula FROM alunos a JOIN matriculas m ON m.aluno_id = a.id AND m.estado = 'activa'
  WHERE a.nome = $1`, [nome]);
