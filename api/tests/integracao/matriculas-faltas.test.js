import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, turmaDe, disciplinaDe, alunoPorNome } from './contexto.js';

let ctx, turmaA7, turmaA9, mat, graca, helder;
beforeAll(async () => {
  ctx = await criarContexto();
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
  turmaA9 = await turmaDe(ctx, 'LDA-101', '9');
  mat = await disciplinaDe(ctx, 'LDA-101', 'MAT');
  graca = await alunoPorNome(ctx, 'Graça Lukeny');
  helder = await alunoPorNome(ctx, 'Hélder Cassoma');
});

describe('Matrículas (RF21–RF23)', () => {
  it('RN06: segunda matrícula activa no mesmo ano → 409 com mensagem clara', async () => {
    const r = await ctx.como(A.secretaria).post('/matriculas').send({ aluno: graca.id, turma: turmaA9 });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toBe('O aluno já tem uma matrícula activa neste ano lectivo.');
  });

  it('RN07: turma cheia → 409; capacidade abaixo dos alunos actuais → 422', async () => {
    expect((await ctx.como(A.secretaria).patch(`/turmas/${turmaA9}`).send({ capacidade: 3 })).status).toBe(422);
    expect((await ctx.como(A.secretaria).patch(`/turmas/${turmaA9}`).send({ capacidade: 4 })).status).toBe(200);
    const novo = await ctx.como(A.secretaria).post('/alunos').send({ nome: 'Aluno Extra', dataNascimento: '2011-01-01', sexo: 'F' });
    const r = await ctx.como(A.secretaria).post('/matriculas').send({ aluno: novo.body.id, turma: turmaA9 });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toMatch(/cheia/);
  });

  it('o número de processo é gerado automaticamente', async () => {
    const r = await ctx.como(A.secretaria).post('/alunos').send({ nome: 'Aluno Número', dataNascimento: '2012-05-05', sexo: 'M' });
    expect(r.body.numeroProcesso).toMatch(/^LDA-101-\d{4}$/);
  });

  it('anular exige motivo e não apaga o registo', async () => {
    const m = graca.matricula;
    expect((await ctx.como(A.secretaria).post(`/matriculas/${m}/anular`).send({})).status).toBe(400);
    const r = await ctx.como(A.secretaria).post(`/matriculas/${m}/anular`).send({ motivo: 'Transferência para outra província' });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('anulada');
    expect(r.body.historico.map((h) => h.accao)).toEqual(['criar', 'anular']);
    expect((await ctx.como(A.secretaria).post(`/matriculas/${m}/anular`).send({ motivo: 'De novo' })).status).toBe(422);
  });

  it('mudar para a mesma turma → 422; para outra turma do mesmo ano → 200 e as notas acompanham', async () => {
    expect((await ctx.como(A.secretaria).post(`/matriculas/${helder.matricula}/mudar-turma`)
      .send({ turma: turmaA7, motivo: 'Teste' })).status).toBe(422);
    await ctx.como(A.secretaria).patch(`/turmas/${turmaA9}`).send({ capacidade: 40 });
    const r = await ctx.como(A.secretaria).post(`/matriculas/${helder.matricula}/mudar-turma`)
      .send({ turma: turmaA9, motivo: 'Pedido do encarregado' });
    expect(r.status).toBe(200);
    expect(r.body.turma).toBe(turmaA9);
    const n = await ctx.um('SELECT count(*)::int AS n FROM notas WHERE matricula_id = $1', [helder.matricula]);
    expect(n.n).toBe(15);
  });
});

describe('Faltas (RF35–RF37)', () => {
  const caminho = (data) => `/turmas/${turmaA7}/disciplinas/${mat}/faltas?data=${data}`;
  let isabel, joaquim;
  beforeAll(async () => {
    isabel = await alunoPorNome(ctx, 'Isabel Ndala');
    joaquim = await alunoPorNome(ctx, 'Joaquim Muteka');
  });

  it('o professor regista as faltas de uma aula; desmarcar anula (não apaga)', async () => {
    const r1 = await ctx.como(A.adao).put(caminho('2026-10-20')).send([isabel.matricula, joaquim.matricula]);
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveLength(2);
    expect(r1.body[0]).toMatchObject({ trimestre: 1, estado: 'injustificada' });

    const r2 = await ctx.como(A.adao).put(caminho('2026-10-20')).send([isabel.matricula]);
    expect(r2.body.map((f) => f.aluno.nome)).toEqual(['Isabel Ndala']);
    const anulada = await ctx.um(`SELECT estado FROM faltas WHERE matricula_id = $1 AND data = '2026-10-20'`, [joaquim.matricula]);
    expect(anulada.estado).toBe('anulada');

    // Voltar a marcar reactiva a mesma linha (sem duplicar)
    const r3 = await ctx.como(A.adao).put(caminho('2026-10-20')).send([isabel.matricula, joaquim.matricula]);
    expect(r3.body).toHaveLength(2);
  });

  it('datas fora dos trimestres ou no futuro → 422', async () => {
    expect((await ctx.como(A.adao).put(caminho('2026-08-15')).send([isabel.matricula])).status).toBe(422);
    expect((await ctx.como(A.adao).put(caminho('2099-10-20')).send([isabel.matricula])).status).toBe(422);
  });

  it('só o director de turma justifica, e o motivo é obrigatório', async () => {
    const f = await ctx.um(`SELECT id FROM faltas WHERE matricula_id = $1 AND data = '2026-10-20'`, [isabel.matricula]);
    expect((await ctx.como(A.lurdes).post(`/faltas/${f.id}/justificar`).send({ motivo: 'Doença' })).status).toBe(403);
    expect((await ctx.como(A.adao).post(`/faltas/${f.id}/justificar`).send({})).status).toBe(400);
    const r = await ctx.como(A.adao).post(`/faltas/${f.id}/justificar`).send({ motivo: 'Doença, com atestado' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'justificada', motivo: 'Doença, com atestado' });
  });

  it('o resumo do trimestre conta justificadas e injustificadas por disciplina', async () => {
    const r = await ctx.como(A.adao).get(`/turmas/${turmaA7}/faltas/resumo?trimestre=1`);
    expect(r.status).toBe(200);
    const isa = r.body.find((l) => l.aluno.nome === 'Isabel Ndala');
    expect(isa.porDisciplina).toEqual([{ disciplina: 'MAT', justificadas: 1, injustificadas: 0 }]);
    // A professora Lurdes lecciona na 7.ª A mas não é directora de turma
    expect((await ctx.como(A.lurdes).get(`/turmas/${turmaA7}/faltas/resumo?trimestre=1`)).status).toBe(403);
  });
});
