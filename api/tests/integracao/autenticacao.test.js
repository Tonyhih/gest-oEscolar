import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { criarContexto, A, B, ADMIN, PALAVRA_PASSE } from './contexto.js';

let ctx;
beforeAll(async () => { ctx = await criarContexto(); });

const login = (email, palavraPasse) => ctx.anonimo().post('/api/v1/auth/login').send({ email, palavraPasse });

describe('Login (RF05)', () => {
  it('devolve o token e os dados da sessão, sem o hash da palavra-passe', async () => {
    const r = await login(A.secretaria, PALAVRA_PASSE);
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTypeOf('string');
    expect(r.body.utilizador).toMatchObject({ email: A.secretaria, perfil: 'secretaria', escola: { nome: 'Complexo Escolar Fictício n.º 101' } });
    expect(JSON.stringify(r.body)).not.toContain('hash');
  });

  it('aceita o email com maiúsculas', async () => {
    expect((await login(A.secretaria.toUpperCase(), PALAVRA_PASSE)).status).toBe(200);
  });

  it('dá a mesma mensagem para palavra-passe errada e para email inexistente', async () => {
    const errada = await login(A.secretaria, 'errada');
    const inexistente = await login('ninguem@nada.test', 'errada');
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.body.mensagem).toBe(inexistente.body.mensagem);
  });

  it('limita as tentativas falhadas por IP (429)', async () => {
    const c = await criarContexto({ limiteLogin: 2 });
    const tentar = () => c.anonimo().post('/api/v1/auth/login').send({ email: A.secretaria, palavraPasse: 'errada' });
    expect((await tentar()).status).toBe(401);
    expect((await tentar()).status).toBe(401);
    expect((await tentar()).status).toBe(429);
  });

  it('recusa um corpo com tipos errados (400)', async () => {
    const r = await ctx.anonimo().post('/api/v1/auth/login').send({ email: 'não é email', palavraPasse: 123 });
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe('VALIDACAO');
  });
});

describe('Token (RFC 8725)', () => {
  it('sem token → 401', async () => {
    expect((await ctx.anonimo().get('/api/v1/auth/eu')).status).toBe(401);
  });

  it('token assinado com outro segredo → 401', async () => {
    const falso = jwt.sign({}, 'outro-segredo-qualquer-com-32-caracteres!!', {
      subject: 'x', issuer: 'gestao-escolar-api', audience: 'gestao-escolar-web' });
    expect((await ctx.anonimo().get('/api/v1/auth/eu').set('Authorization', `Bearer ${falso}`)).status).toBe(401);
  });

  it('token com alg "none" → 401', async () => {
    const semAssinatura = jwt.sign({ sub: 'x' }, null, { algorithm: 'none' });
    expect((await ctx.anonimo().get('/api/v1/auth/eu').set('Authorization', `Bearer ${semAssinatura}`)).status).toBe(401);
  });

  it('o perfil vem da base de dados e não do token', async () => {
    const r = await ctx.como(A.secretaria).get('/auth/eu');
    expect(r.body.perfil).toBe('secretaria');
  });
});

describe('Escola inactiva (RF03)', () => {
  it('ao desactivar a escola, os utilizadores dela deixam de entrar e os tokens deixam de valer', async () => {
    const c = await criarContexto();
    const tokenB = await c.token(B.director);
    const escolaB = await c.um(`SELECT id FROM escolas WHERE codigo = 'HBO-201'`);
    const r = await c.como(ADMIN).patch(`/plataforma/escolas/${escolaB.id}`).send({ estado: 'inactivo' });
    expect(r.status).toBe(200);
    expect((await c.anonimo().post('/api/v1/auth/login').send({ email: B.director, palavraPasse: PALAVRA_PASSE })).status).toBe(401);
    expect((await c.anonimo().get('/api/v1/auth/eu').set('Authorization', `Bearer ${tokenB}`)).status).toBe(401);
    // A Escola A continua a funcionar
    expect((await c.como(A.director).get('/auth/eu')).status).toBe(200);
  });
});

describe('Primeiro acesso e palavra-passe provisória (RF02, RF06, RF07)', () => {
  it('obriga a trocar a palavra-passe antes de usar o sistema', async () => {
    const criado = await ctx.como(A.director).post('/utilizadores')
      .send({ nome: 'Nova Secretária', email: 'nova@lda101.test', perfil: 'secretaria' });
    expect(criado.status).toBe(201);
    const provisoria = criado.body.palavraPasseProvisoria;

    const token = (await login('nova@lda101.test', provisoria)).body.token;
    const comToken = (req) => req.set('Authorization', `Bearer ${token}`);

    const bloqueado = await comToken(ctx.anonimo().get('/api/v1/alunos'));
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.codigo).toBe('TROCAR_PALAVRA_PASSE');
    expect((await comToken(ctx.anonimo().get('/api/v1/auth/eu'))).body.trocarPalavraPasse).toBe(true);

    const curta = await comToken(ctx.anonimo().post('/api/v1/auth/palavra-passe')).send({ actual: provisoria, nova: '123' });
    expect(curta.status).toBe(400);
    const ok = await comToken(ctx.anonimo().post('/api/v1/auth/palavra-passe')).send({ actual: provisoria, nova: 'UmaNovaSenha#1' });
    expect(ok.status).toBe(204);
    expect((await comToken(ctx.anonimo().get('/api/v1/alunos'))).status).toBe(200);
  });
});

describe('Atribuição em massa (OWASP A04)', () => {
  it('o director não pode criar outro director pela rota de utilizadores', async () => {
    const r = await ctx.como(A.director).post('/utilizadores').send({ nome: 'Outro Director', email: 'outro@lda101.test', perfil: 'director' });
    expect(r.status).toBe(400);
  });

  it('um escolaId enviado pelo cliente é ignorado: o utilizador fica na escola do director', async () => {
    const escolaB = await ctx.um(`SELECT id FROM escolas WHERE codigo = 'HBO-201'`);
    const r = await ctx.como(A.director).post('/utilizadores')
      .send({ nome: 'Professor Novo', email: 'prof.novo@lda101.test', perfil: 'professor', escolaId: escolaB.id, escola_id: escolaB.id });
    expect(r.status).toBe(201);
    const u = await ctx.um(`SELECT e.codigo FROM utilizadores u JOIN escolas e ON e.id = u.escola_id WHERE u.email = 'prof.novo@lda101.test'`);
    expect(u.codigo).toBe('LDA-101');
    // E recebeu logo a ficha de professor
    expect(await ctx.um(`SELECT 1 AS ok FROM professores p JOIN utilizadores u ON u.id = p.utilizador_id WHERE u.email = 'prof.novo@lda101.test'`))
      .toEqual({ ok: 1 });
  });
});
