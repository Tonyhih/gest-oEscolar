import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, PALAVRA_PASSE } from './contexto.js';

let ctx;
const login = (email, palavraPasse = PALAVRA_PASSE) => ctx.anonimo().post('/api/v1/auth/login').send({ email, palavraPasse });
const codigo = () => ctx.emails.at(-1).texto.match(/é (\d{6})\./)[1];
const confirmar = (desafio, c) => ctx.anonimo().post('/api/v1/auth/login/codigo').send({ desafio, codigo: c });

beforeAll(async () => {
  ctx = await criarContexto({ segundoFactor: { perfis: ['director'] } });
});

describe('Segundo factor do director (código por email)', () => {
  it('a palavra-passe certa não dá o token: envia um código para o email', async () => {
    const r = await login(A.director);
    expect(r.status).toBe(200);
    expect(r.body.token).toBeUndefined();
    expect(r.body).toMatchObject({ segundoFactor: true, email: 'd******r@lda101.test' });
    expect(ctx.emails.at(-1)).toMatchObject({ para: A.director });
    expect(ctx.emails.at(-1).assunto).toMatch(/^Código de acesso: \d{6}$/);
    // O código não fica guardado em claro
    const linha = await ctx.um('SELECT codigo_hash FROM codigos_acesso WHERE id = $1', [r.body.desafio]);
    expect(linha.codigo_hash).not.toContain(codigo());
  });

  it('com o código certo recebe a sessão; o código não serve duas vezes', async () => {
    const r = await login(A.director);
    const c = codigo();
    const s = await confirmar(r.body.desafio, c);
    expect(s.status).toBe(200);
    expect(s.body.utilizador.perfil).toBe('director');
    expect((await ctx.anonimo().get('/api/v1/auth/eu').set('Authorization', `Bearer ${s.body.token}`)).status).toBe(200);
    expect((await confirmar(r.body.desafio, c)).status).toBe(401);
  });

  it('código errado → 401; à 5.ª tentativa errada o desafio fica bloqueado', async () => {
    const r = await login(A.director);
    const certo = codigo();
    const errado = certo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) expect((await confirmar(r.body.desafio, errado)).status).toBe(401);
    const bloqueado = await confirmar(r.body.desafio, certo);
    expect(bloqueado.status).toBe(401);
    expect(bloqueado.body.mensagem).toMatch(/Demasiadas tentativas/);
  });

  it('código expirado → 401', async () => {
    const r = await login(A.director);
    await ctx.um(`UPDATE codigos_acesso SET expira_em = now() - interval '1 minute' WHERE id = $1`, [r.body.desafio]);
    expect((await confirmar(r.body.desafio, codigo())).body.mensagem).toMatch(/expirou/);
  });

  it('reenviar: só depois de 1 minuto; o código anterior deixa de valer', async () => {
    const r = await login(A.director);
    const antigo = codigo();
    expect((await ctx.anonimo().post('/api/v1/auth/login/reenviar').send({ desafio: r.body.desafio })).status).toBe(422);
    await ctx.um(`UPDATE codigos_acesso SET enviado_em = now() - interval '2 minutes' WHERE id = $1`, [r.body.desafio]);
    const n = ctx.emails.length;
    expect((await ctx.anonimo().post('/api/v1/auth/login/reenviar').send({ desafio: r.body.desafio })).status).toBe(200);
    expect(ctx.emails.length).toBe(n + 1);
    const novo = codigo();
    if (novo !== antigo) expect((await confirmar(r.body.desafio, antigo)).status).toBe(401);
    expect((await confirmar(r.body.desafio, novo)).status).toBe(200);
  });

  it('palavra-passe errada não envia código; os outros perfis entram como antes', async () => {
    const n = ctx.emails.length;
    expect((await login(A.director, 'Errada#2026')).status).toBe(401);
    expect(ctx.emails.length).toBe(n);
    const s = await login(A.secretaria);
    expect(s.body.token).toBeDefined();
  });

  it('formato inválido → 400', async () => {
    expect((await ctx.anonimo().post('/api/v1/auth/login/codigo').send({ desafio: 'x', codigo: '12' })).status).toBe(400);
  });
});
