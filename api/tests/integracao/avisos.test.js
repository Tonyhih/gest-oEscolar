import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, disciplinaDe, alunoPorNome } from './contexto.js';

let ctx, graca, isabel, turmaA7, mat, auth;
const EMAIL = 'joana.avisos@familia.test';
const portal = () => ({
  get: (c) => ctx.anonimo().get(`/api/v1${c}`).set(auth),
  post: (c) => ctx.anonimo().post(`/api/v1${c}`).set(auth),
});
const avisos = async () => (await portal().get('/portal/avisos')).body;
const faltas = (data, matriculas) => ctx.como(A.adao).put(`/turmas/${turmaA7}/disciplinas/${mat}/faltas?data=${data}`).send(matriculas);

beforeAll(async () => {
  ctx = await criarContexto();
  graca = await alunoPorNome(ctx, 'Graça Lukeny');   // 7.ª A, encarregada Joana Lukeny
  isabel = await alunoPorNome(ctx, 'Isabel Ndala');
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
  mat = await disciplinaDe(ctx, 'LDA-101', 'MAT');    // Adão lecciona MAT na 7.ª A
  const joana = await ctx.um(`SELECT id FROM encarregados WHERE nome = 'Joana Lukeny'`);
  const conta = await ctx.como(A.secretaria).post(`/encarregados/${joana.id}/acesso-portal`).send({ email: EMAIL });
  const t = await ctx.token(EMAIL, conta.body.palavraPasseProvisoria);
  await ctx.anonimo().post('/api/v1/auth/palavra-passe').set('Authorization', `Bearer ${t}`)
    .send({ actual: conta.body.palavraPasseProvisoria, nova: 'PortalNovo#1' });
  const r = await ctx.anonimo().post('/api/v1/auth/login').send({ email: EMAIL, palavraPasse: 'PortalNovo#1' });
  auth = { Authorization: `Bearer ${r.body.token}` };
});

describe('Avisos no portal', () => {
  it('sem acontecimentos, não há avisos', async () => {
    expect(await avisos()).toEqual({ naoLidos: 0, avisos: [] });
  });

  it('publicar o trimestre avisa os encarregados da turma (uma só vez)', async () => {
    await ctx.como(A.adao).post(`/turmas/${turmaA7}/trimestres/1/publicar`);
    const r = await avisos();
    expect(r.naoLidos).toBe(1);
    expect(r.avisos[0]).toMatchObject({ tipo: 'notas_publicadas', titulo: 'Notas do 1.º trimestre publicadas', aluno: 'Graça Lukeny', lido: false });
  });

  it('ao chegar a 3 faltas injustificadas na disciplina (limite da escola), avisa uma vez', async () => {
    await faltas('2026-10-05', [graca.matricula]);
    await faltas('2026-10-06', [graca.matricula]);
    expect((await avisos()).avisos.filter((a) => a.tipo === 'faltas_injustificadas')).toHaveLength(0);
    await faltas('2026-10-07', [graca.matricula]);
    await faltas('2026-10-08', [graca.matricula]);
    const f = (await avisos()).avisos.filter((a) => a.tipo === 'faltas_injustificadas');
    expect(f).toHaveLength(1);
    expect(f[0].mensagem).toMatch(/3 faltas injustificadas a Matemática no 1\.º trimestre/);
  });

  it('o director muda o limite de faltas da escola', async () => {
    const r = await ctx.como(A.director).patch('/escola').send({ limiteAvisoFaltas: 2 });
    expect(r.status).toBe(200);
    expect(r.body.limiteAvisoFaltas).toBe(2);
    expect((await ctx.como(A.director).patch('/escola').send({ limiteAvisoFaltas: 0 })).status).toBe(400);
  });

  it('marcar como lido: um aviso ou todos', async () => {
    const r = await avisos();
    const um = await portal().post('/portal/avisos/lidos').send({ avisos: [r.avisos[0].id] });
    expect(um.body.naoLidos).toBe(r.naoLidos - 1);
    const todos = await portal().post('/portal/avisos/lidos').send({});
    expect(todos.body.naoLidos).toBe(0);
  });
});

describe('Faltas vermelhas (disciplinares)', () => {
  let falta;
  it('o professor marca a falta vermelha com a ocorrência; o encarregado é avisado', async () => {
    const r = await ctx.como(A.adao).post(`/turmas/${turmaA7}/disciplinas/${mat}/faltas-disciplinares`)
      .send({ matricula: graca.matricula, data: '2026-10-09', ocorrencia: 'Perturbou a aula e saiu sem autorização' });
    expect(r.status).toBe(201);
    falta = r.body;
    expect(falta).toMatchObject({ tipo: 'disciplinar', estado: 'injustificada' });
    const v = (await avisos()).avisos.find((a) => a.tipo === 'falta_disciplinar');
    expect(v.mensagem).toBe('Graça Lukeny teve falta disciplinar a Matemática em 09/10/2026: Perturbou a aula e saiu sem autorização');
    expect(v.lido).toBe(false);
    // Duas vezes na mesma aula → 409
    expect((await ctx.como(A.adao).post(`/turmas/${turmaA7}/disciplinas/${mat}/faltas-disciplinares`)
      .send({ matricula: graca.matricula, data: '2026-10-09', ocorrencia: 'Outra vez' })).status).toBe(409);
  });

  it('o registo das faltas da aula não a anula; não se justifica', async () => {
    await faltas('2026-10-09', [isabel.matricula]); // a Graça não está na lista
    const lista = (await ctx.como(A.adao).get(`/turmas/${turmaA7}/faltas`).query({ aluno: graca.id })).body;
    expect(lista.find((f) => f.id === falta.id).estado).toBe('injustificada');
    expect((await ctx.como(A.adao).post(`/faltas/${falta.id}/justificar`).send({ motivo: 'Doença' })).status).toBe(422);
    const resumo = (await ctx.como(A.adao).get(`/turmas/${turmaA7}/faltas/resumo?trimestre=1`)).body;
    expect(resumo.find((l) => l.aluno.nome === 'Graça Lukeny').porDisciplina.find((d) => d.disciplina === 'MAT')).toMatchObject({ disciplinares: 1 });
  });

  it('só o professor da disciplina marca; só o director anula, com motivo', async () => {
    expect((await ctx.como(A.lurdes).post(`/turmas/${turmaA7}/disciplinas/${mat}/faltas-disciplinares`)
      .send({ matricula: isabel.matricula, data: '2026-10-09', ocorrencia: 'Indisciplina' })).status).toBe(403);
    expect((await ctx.como(A.adao).post(`/faltas/${falta.id}/anular`).send({ motivo: 'Engano' })).status).toBe(403);
    expect((await ctx.como(A.director).post(`/faltas/${falta.id}/anular`).send({ motivo: 'Marcada no aluno errado' })).status).toBe(200);
    const lista = (await ctx.como(A.adao).get(`/turmas/${turmaA7}/faltas`).query({ aluno: graca.id })).body;
    expect(lista.find((f) => f.id === falta.id)).toBeUndefined();
  });

  it('o portal mostra o total de faltas vermelhas', async () => {
    await ctx.como(A.adao).post(`/turmas/${turmaA7}/disciplinas/${mat}/faltas-disciplinares`)
      .send({ matricula: graca.matricula, data: '2026-10-12', ocorrencia: 'Agrediu um colega' });
    const r = await portal().get(`/portal/alunos/${graca.id}`);
    expect(r.body.faltas.find((f) => f.sigla === 'MAT').disciplinares).toBe(1);
  });
});

describe('Propinas e recibos', () => {
  it('propina em atraso e recibo aparecem nos avisos; outra escola não vê', async () => {
    const rub = await ctx.como(A.director).post('/financas/rubricas').send({ nome: 'Propina', tipo: 'propina', valor: 3000, meses: [9, 10] });
    await ctx.como(A.director).post(`/financas/rubricas/${rub.body.id}/gerar`);
    let r = await avisos();
    const atraso = r.avisos.filter((a) => a.tipo === 'propina_atraso');
    expect(atraso.map((a) => a.titulo)).toEqual(expect.arrayContaining(['Em atraso: Propina – Setembro 2026', 'Em atraso: Propina – Outubro 2026']));
    // Abrir outra vez não repete
    expect((await avisos()).avisos.filter((a) => a.tipo === 'propina_atraso')).toHaveLength(atraso.length);

    const ficha = (await ctx.como(A.secretaria).get(`/alunos/${graca.id}/financas`)).body;
    const set = ficha.cobrancas.find((c) => c.descricao.endsWith('Setembro 2026'));
    const p = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/pagamentos`).send({ cobrancas: [set.id], metodo: 'numerario' });
    await ctx.como(A.director).post(`/pagamentos/${p.body.id}/anular`).send({ motivo: 'Valor errado' });
    r = await avisos();
    expect(r.avisos.find((a) => a.titulo === `Pagamento recebido: recibo n.º ${p.body.numeroTexto}`)).toBeDefined();
    expect(r.avisos.find((a) => a.titulo === `Recibo n.º ${p.body.numeroTexto} anulado`).mensagem).toMatch(/Valor errado/);
    // Os avisos da Isabel (outra família) não aparecem
    expect(r.avisos.every((a) => a.aluno === 'Graça Lukeny')).toBe(true);
  });

  it('pessoal da escola não usa os avisos do portal', async () => {
    expect((await ctx.como(A.secretaria).get('/portal/avisos')).status).toBe(403);
    expect((await ctx.como(B.director).get('/portal/avisos')).status).toBe(403);
  });
});
