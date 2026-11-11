import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, alunoPorNome } from './contexto.js';

let ctx, graca, isabel, helder, turmaA7, joana;

/** Entra com a palavra-passe provisória e troca-a, como no primeiro acesso. */
async function primeiroAcesso(email, provisoria) {
  const token = await ctx.token(email, provisoria);
  const r = await ctx.anonimo().post('/api/v1/auth/palavra-passe').set('Authorization', `Bearer ${token}`)
    .send({ actual: provisoria, nova: 'PortalNovo#1' });
  expect(r.status).toBe(204);
}

beforeAll(async () => {
  ctx = await criarContexto();
  graca = await alunoPorNome(ctx, 'Graça Lukeny');      // 7.ª A, todas as notas 14
  isabel = await alunoPorNome(ctx, 'Isabel Ndala');     // 7.ª A, outro aluno
  helder = await alunoPorNome(ctx, 'Hélder Cassoma');   // 7.ª A
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
  joana = await ctx.um(`SELECT e.id FROM encarregados e WHERE e.nome = 'Joana Lukeny'`); // encarregada da Graça
});

describe('Contas do portal', () => {
  it('a secretaria dá acesso ao encarregado; não se cria duas vezes', async () => {
    const r = await ctx.como(A.secretaria).post(`/encarregados/${joana.id}/acesso-portal`).send({ email: 'joana@familia.test' });
    expect(r.status).toBe(201);
    expect(r.body.utilizador).toMatchObject({ perfil: 'encarregado', email: 'joana@familia.test' });
    await primeiroAcesso('joana@familia.test', r.body.palavraPasseProvisoria);
    expect((await ctx.como(A.secretaria).post(`/encarregados/${joana.id}/acesso-portal`).send({ email: 'outro@familia.test' })).status).toBe(409);
    const ficha = await ctx.como(A.secretaria).get(`/alunos/${graca.id}`);
    expect(ficha.body.encarregados[0].encarregado.acessoPortal).toBe(true);
  });

  it('um professor não cria contas do portal; outra escola não vê o encarregado', async () => {
    expect((await ctx.como(A.adao).post(`/alunos/${helder.id}/acesso-portal`).send({ email: 'x@y.test' })).status).toBe(403);
    expect((await ctx.como(B.secretaria).post(`/encarregados/${joana.id}/acesso-portal`).send({ email: 'x@y.test' })).status).toBe(404);
  });
});

describe('O que o encarregado vê', () => {
  it('só os seus educandos', async () => {
    const r = await ctx.como('joana@familia.test').get('/portal/educandos');
    expect(r.body.map((a) => a.nome)).toEqual(['Graça Lukeny']);
    expect((await ctx.como('joana@familia.test').get(`/portal/alunos/${isabel.id}`)).status).toBe(404);
  });

  it('não acede ao resto do sistema', async () => {
    for (const caminho of ['/turmas', '/alunos', `/alunos/${graca.id}`, '/matriculas', '/painel']) {
      expect((await ctx.como('joana@familia.test').get(caminho)).status).toBe(403);
    }
  });

  it('antes da publicação, não vê nenhuma nota (mas vê as faltas)', async () => {
    const r = await ctx.como('joana@familia.test').get(`/portal/alunos/${graca.id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tipo: 'notas', trimestresPublicados: [], situacao: null,
      matricula: { turma: '7.ª A', directorTurma: 'Adão Ngola (fictício)' } });
    expect(r.body.disciplinas.every((d) => d.trimestres.every((t) => t === null))).toBe(true);
    expect(r.body.faltas.length).toBeGreaterThan(0); // a Graça tem faltas no seed
  });

  it('depois de publicado o 1.º trimestre, vê as MT desse trimestre e mais nenhuma', async () => {
    expect((await ctx.como(A.adao).post(`/turmas/${turmaA7}/trimestres/1/publicar`)).status).toBe(200);
    const r = await ctx.como('joana@familia.test').get(`/portal/alunos/${graca.id}`);
    expect(r.body.trimestresPublicados).toEqual([1]);
    expect(r.body.disciplinas.find((d) => d.sigla === 'LP').trimestres).toEqual([14, null, null]);
    expect(r.body.situacao).toBeNull();
  });

  it('com o 3.º trimestre publicado, vê as notas finais e a situação', async () => {
    await ctx.como(A.director).post(`/turmas/${turmaA7}/trimestres/2/publicar`);
    await ctx.como(A.director).post(`/turmas/${turmaA7}/trimestres/3/publicar`);
    const r = await ctx.como('joana@familia.test').get(`/portal/alunos/${graca.id}`);
    expect(r.body.trimestresPublicados).toEqual([1, 2, 3]);
    expect(r.body.disciplinas.find((d) => d.sigla === 'MAT')).toMatchObject({ trimestres: [14, 14, 14], notaFinal: 14 });
    expect(r.body.situacao.situacao).toBe('transita');
  });
});

describe('O que o aluno vê', () => {
  it('a secretaria dá acesso ao aluno; o aluno vê-se só a si próprio', async () => {
    const r = await ctx.como(A.secretaria).post(`/alunos/${helder.id}/acesso-portal`).send({ email: 'helder@aluno.test' });
    expect(r.status).toBe(201);
    expect(r.body.utilizador.perfil).toBe('aluno');
    await primeiroAcesso('helder@aluno.test', r.body.palavraPasseProvisoria);
    expect((await ctx.como('helder@aluno.test').get('/portal/educandos')).body.map((a) => a.nome)).toEqual(['Hélder Cassoma']);
    const resumo = await ctx.como('helder@aluno.test').get(`/portal/alunos/${helder.id}`);
    expect(resumo.body.situacao.situacao).toBe('transita'); // negativas 9 e 8, fora das disciplinas-chave
    expect((await ctx.como('helder@aluno.test').get(`/portal/alunos/${graca.id}`)).status).toBe(404);
    expect((await ctx.como(A.secretaria).get(`/alunos/${helder.id}`)).body.acessoPortal).toBe(true);
  });
});
