import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, turmaDe, disciplinaDe } from './contexto.js';

// 7.ª A e 9.ª A são ambas da tarde. Lurdes dá LP, HIS e GEO; Adão dá MAT e FIS (nas duas turmas).
let ctx, t7, t9, d;
beforeAll(async () => {
  ctx = await criarContexto();
  t7 = await turmaDe(ctx, 'LDA-101', '7');
  t9 = await turmaDe(ctx, 'LDA-101', '9');
  d = {};
  for (const s of ['LP', 'MAT', 'FIS', 'HIS', 'GEO', 'CN']) d[s] = await disciplinaDe(ctx, 'LDA-101', s);
});

describe('Tempos lectivos', () => {
  it('sem configuração, propõe os tempos típicos do turno', async () => {
    const r = await ctx.como(A.director).get('/tempos?turno=tarde');
    expect(r.body).toMatchObject({ turno: 'tarde', predefinidos: true });
    expect(r.body.tempos[0]).toEqual({ numero: 1, inicio: '12:30', fim: '13:15' });
    expect(r.body.tempos).toHaveLength(6);
  });

  it('o director ajusta os tempos; sobreposições são recusadas', async () => {
    const mal = await ctx.como(A.director).put('/tempos/manha').send([{ inicio: '07:00', fim: '07:50' }, { inicio: '07:45', fim: '08:30' }]);
    expect(mal.status).toBe(422);
    const r = await ctx.como(A.director).put('/tempos/manha').send([{ inicio: '07:30', fim: '08:15' }, { inicio: '08:20', fim: '09:05' }]);
    expect(r.body).toMatchObject({ predefinidos: false, tempos: [{ numero: 1, inicio: '07:30' }, { numero: 2, inicio: '08:20' }] });
    expect((await ctx.como(A.secretaria).put('/tempos/manha').send([{ inicio: '07:00', fim: '07:45' }])).status).toBe(403);
  });
});

describe('Horário da turma', () => {
  it('o director monta o horário; o professor vem da atribuição e a sala da turma', async () => {
    const r = await ctx.como(A.director).put(`/turmas/${t7}/horario`).send([
      { dia: 1, tempo: 1, disciplina: d.MAT }, { dia: 1, tempo: 2, disciplina: d.LP }, { dia: 2, tempo: 1, disciplina: d.HIS },
    ]);
    expect(r.status).toBe(200);
    expect(r.body.aulas).toHaveLength(3);
    expect(r.body.aulas[0]).toMatchObject({ dia: 1, tempo: 1, sala: 'Sala 7', disciplina: { sigla: 'MAT' }, professor: { nome: 'Adão Ngola (fictício)' } });
    // Os tempos da tarde ficaram gravados
    expect((await ctx.como(A.director).get('/tempos?turno=tarde')).body.predefinidos).toBe(false);
  });

  it('conflito de professor: o Adão não pode estar na 7.ª A e na 9.ª A ao mesmo tempo (409)', async () => {
    const r = await ctx.como(A.director).put(`/turmas/${t9}/horario`).send([{ dia: 1, tempo: 1, disciplina: d.MAT }]);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('CONFLITO_HORARIO');
    expect(r.body.detalhes[0]).toEqual({ campo: 'Segunda, 1.º tempo', mensagem: 'Adão Ngola (fictício) já tem aula na 7.ª A.' });
  });

  it('conflito de sala: a Sala 7 já está ocupada (sem distinguir maiúsculas)', async () => {
    const r = await ctx.como(A.director).put(`/turmas/${t9}/horario`).send([{ dia: 2, tempo: 1, disciplina: d.FIS, sala: 'SALA 7' }]);
    expect(r.status).toBe(409);
    expect(r.body.detalhes[0].mensagem).toBe('A sala SALA 7 já está ocupada pela 7.ª A.');
  });

  it('erros do pedido: disciplina fora do plano, tempo repetido, tempo que não existe', async () => {
    const r = await ctx.como(A.director).put(`/turmas/${t9}/horario`).send([
      { dia: 3, tempo: 1, disciplina: d.CN }, { dia: 3, tempo: 2, disciplina: d.LP }, { dia: 3, tempo: 2, disciplina: d.GEO },
    ]);
    expect(r.status).toBe(422);
    expect(r.body.detalhes.map((x) => x.mensagem)).toEqual(['A disciplina não faz parte do plano da turma.', 'Quarta, 2.º tempo repetido.']);
    expect((await ctx.como(A.director).put(`/turmas/${t9}/horario`).send([{ dia: 3, tempo: 7, disciplina: d.LP }])).status).toBe(422);
  });

  it('não se reduzem os tempos se houver aulas nos tempos que desaparecem', async () => {
    const r = await ctx.como(A.director).put('/tempos/tarde').send([{ inicio: '12:30', fim: '13:15' }]);
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/2\.º tempo/);
  });

  it('o professor vê o horário das suas turmas e o seu próprio horário', async () => {
    expect((await ctx.como(A.lurdes).get(`/turmas/${t7}/horario`)).status).toBe(200);
    const r = await ctx.como(A.adao).get('/horario/professor');
    expect(r.body.aulas.map((a) => `${a.turma.designacao} ${a.disciplina.sigla} ${a.dia}/${a.tempo}`)).toEqual(['7.ª A MAT 1/1']);
    expect(r.body.tempos.tarde).toHaveLength(6);
    expect((await ctx.como(A.lurdes).put(`/turmas/${t7}/horario`).send([])).status).toBe(403);
  });

  it('ao mudar as atribuições, as aulas seguem o novo professor e as disciplinas sem professor saem do horário', async () => {
    const lurdes = await ctx.um(`SELECT p.id FROM professores p JOIN utilizadores u ON u.id = p.utilizador_id WHERE u.email = $1`, [A.lurdes]);
    const adao = await ctx.um(`SELECT p.id FROM professores p JOIN utilizadores u ON u.id = p.utilizador_id WHERE u.email = $1`, [A.adao]);
    // MAT passa para a Lurdes; HIS fica sem professor
    const r = await ctx.como(A.director).put(`/turmas/${t7}/atribuicoes`).send([
      { disciplina: d.MAT, professor: lurdes.id }, { disciplina: d.LP, professor: lurdes.id },
      { disciplina: d.FIS, professor: adao.id }, { disciplina: d.GEO, professor: lurdes.id },
    ]);
    expect(r.status).toBe(200);
    const h = await ctx.como(A.director).get(`/turmas/${t7}/horario`);
    expect(h.body.aulas.map((a) => `${a.disciplina.sigla}:${a.professor.nome}`)).toEqual([
      'MAT:Lurdes Cambuta (fictícia)', 'LP:Lurdes Cambuta (fictícia)']);
    expect((await ctx.como(A.adao).get('/horario/professor')).body.aulas).toEqual([]);
  });
});
