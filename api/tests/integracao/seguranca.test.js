import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A } from './contexto.js';

let ctx;
beforeAll(async () => { ctx = await criarContexto(); });

describe('Cabeçalhos e erros (OWASP A05)', () => {
  it('usa os cabeçalhos do helmet e esconde o X-Powered-By', async () => {
    const r = await ctx.anonimo().get('/api/v1/saude');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ estado: 'ok' });
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toBeDefined();
  });

  it('CORS: só a origem do front-end recebe autorização', async () => {
    const ok = await ctx.anonimo().get('/api/v1/saude').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const outra = await ctx.anonimo().get('/api/v1/saude').set('Origin', 'https://site-malicioso.test');
    expect(outra.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('JSON mal formado → 400 sem detalhes internos', async () => {
    const r = await ctx.anonimo().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ mensagem: 'JSON mal formado.', codigo: 'VALIDACAO' });
  });

  it('identificador que não é UUID → 400 (validação antes da base de dados)', async () => {
    const r = await ctx.como(A.director).get('/alunos/123');
    expect(r.status).toBe(400);
    expect(r.body.detalhes[0].campo).toBe('params.id');
  });

  it('injecção SQL na pesquisa é tratada como texto', async () => {
    const r = await ctx.como(A.secretaria).get(`/alunos?pesquisa=${encodeURIComponent("' OR 1=1 --")}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
  });
});
