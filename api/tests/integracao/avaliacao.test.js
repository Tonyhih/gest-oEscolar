import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, disciplinaDe, alunoPorNome } from './contexto.js';

let ctx, turmaA7, turmaA6, turmaA9, turmaINI, lp, mat, graca;
beforeAll(async () => {
  ctx = await criarContexto();
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
  turmaA6 = await turmaDe(ctx, 'LDA-101', '6');
  turmaA9 = await turmaDe(ctx, 'LDA-101', '9');
  turmaINI = await turmaDe(ctx, 'LDA-101', 'INI');
  lp = await disciplinaDe(ctx, 'LDA-101', 'LP');
  mat = await disciplinaDe(ctx, 'LDA-101', 'MAT');
  graca = await alunoPorNome(ctx, 'Graça Lukeny');
});

const notas = (turma, disciplina, t) => `/turmas/${turma}/disciplinas/${disciplina}/notas?trimestre=${t}`;

describe('Lançamento de notas (RF24, RF25)', () => {
  it('o professor da disciplina lança as notas e a MT vem calculada', async () => {
    const r = await ctx.como(A.lurdes).put(notas(turmaA7, lp, 1)).send([{ matricula: graca.matricula, mac: 12, npp: 14, npt: 10 }]);
    expect(r.status).toBe(200);
    expect(r.body.find((l) => l.matricula === graca.matricula)).toMatchObject({ mac: 12, npp: 14, npt: 10, mt: 12, publicada: false });
    expect(r.body).toHaveLength(5); // a grelha devolve a turma inteira
  });

  it('RN05: nota acima de 20 → 400; acima da escala 0–10 da 6.ª classe → 422', async () => {
    expect((await ctx.como(A.lurdes).put(notas(turmaA7, lp, 1)).send([{ matricula: graca.matricula, npt: 21 }])).status).toBe(400);
    const celeste = await alunoPorNome(ctx, 'Celeste Tchipa');
    const r = await ctx.como(A.lurdes).put(notas(turmaA6, lp, 1)).send([{ matricula: celeste.matricula, npt: 11 }]);
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('ESCALA');
  });

  it('não lança num trimestre fechado', async () => {
    const r = await ctx.como(A.lurdes).put(notas(turmaA7, lp, 2)).send([{ matricula: graca.matricula, mac: 12 }]);
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/fechado/);
  });

  it('não aceita matrículas de outra turma', async () => {
    const celeste = await alunoPorNome(ctx, 'Celeste Tchipa');
    expect((await ctx.como(A.lurdes).put(notas(turmaA7, lp, 1)).send([{ matricula: celeste.matricula, mac: 12 }])).status).toBe(422);
  });

  it('o director de turma vê todas as disciplinas; outro professor só as suas', async () => {
    expect((await ctx.como(A.adao).get(notas(turmaA7, lp, 1))).status).toBe(200);   // DT da 7.ª A
    const fis = await disciplinaDe(ctx, 'LDA-101', 'FIS');
    expect((await ctx.como(A.lurdes).get(notas(turmaA7, fis, 1))).status).toBe(403); // FIS não é dela
  });
});

describe('Publicação (RF30) e correcção (RF31)', () => {
  it('só o director de turma (ou o director) publica; depois disso, o professor já não edita', async () => {
    expect((await ctx.como(A.lurdes).post(`/turmas/${turmaA7}/trimestres/1/publicar`)).status).toBe(403);
    const r = await ctx.como(A.adao).post(`/turmas/${turmaA7}/trimestres/1/publicar`);
    expect(r.status).toBe(200);
    expect((await ctx.como(A.adao).post(`/turmas/${turmaA7}/trimestres/1/publicar`)).status).toBe(409);

    const editar = await ctx.como(A.lurdes).put(notas(turmaA7, lp, 1)).send([{ matricula: graca.matricula, mac: 15 }]);
    expect(editar.status).toBe(422);
    expect(editar.body.mensagem).toMatch(/publicadas/);
  });

  it('não publica com notas em falta', async () => {
    const nova = await ctx.como(A.secretaria).post('/alunos').send({ nome: 'Aluno Sem Notas', dataNascimento: '2011-02-02', sexo: 'M' });
    expect(nova.status).toBe(201);
    expect((await ctx.como(A.secretaria).post('/matriculas').send({ aluno: nova.body.id, turma: turmaA9 })).status).toBe(201);
    const r = await ctx.como(A.adao).post(`/turmas/${turmaA9}/trimestres/1/publicar`);
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/Faltam 5 notas/);
  });

  it('o director corrige uma nota publicada com justificação, e a correcção fica na auditoria', async () => {
    const nota = await ctx.um(`SELECT id FROM notas WHERE matricula_id = $1 AND disciplina_id = $2 AND trimestre = 1`,
      [graca.matricula, lp]);
    const curta = await ctx.como(A.director).post(`/notas/${nota.id}/correccoes`).send({ campo: 'npt', valor: 11, justificacao: 'erro' });
    expect(curta.status).toBe(400);
    expect((await ctx.como(A.lurdes).post(`/notas/${nota.id}/correccoes`)
      .send({ campo: 'npt', valor: 11, justificacao: 'Erro de transcrição da prova' })).status).toBe(403);

    const r = await ctx.como(A.director).post(`/notas/${nota.id}/correccoes`)
      .send({ campo: 'npt', valor: 13, justificacao: 'Erro de transcrição da prova' });
    expect(r.status).toBe(200);
    expect(r.body.mts[0]).toBe(13); // (12 + 14 + 13) / 3

    const aud = await ctx.como(A.director).get('/auditoria?entidade=nota');
    const registo = aud.body.dados.find((x) => x.accao === 'corrigir_nota');
    expect(registo).toMatchObject({ justificacao: 'Erro de transcrição da prova', antes: { trimestre: 1, npt: 10 }, depois: { npt: 13 } });
  });
});

describe('Exames (RF27, RF28) e avaliação descritiva (RF33)', () => {
  it('RN18: só as classes de exame aceitam nota de exame', async () => {
    const r = await ctx.como(A.secretaria).put(`/turmas/${turmaA7}/disciplinas/${mat}/exame`).send([{ matricula: graca.matricula, exame: 12 }]);
    expect(r.status).toBe(422);
  });

  it('a secretaria lança o exame da 9.ª classe e a CF é calculada (MFD 13, exame 7 → CF 9,4 → 9)', async () => {
    const paula = await alunoPorNome(ctx, 'Paula Samakuva'); // MFD 13 em todas, sem exame
    const r = await ctx.como(A.secretaria).put(`/turmas/${turmaA9}/disciplinas/${mat}/exame`).send([{ matricula: paula.matricula, exame: 7 }]);
    expect(r.status).toBe(200);
    expect(r.body[0]).toMatchObject({ mfd: 13, exame: 7, cf: 9.4, notaFinal: 9, aprovado: false });
  });

  it('RN12: a Iniciação só aceita avaliação descritiva', async () => {
    const ana = await alunoPorNome(ctx, 'Ana Domingos');
    const r = await ctx.como(A.lurdes).put(`/turmas/${turmaINI}/avaliacoes-descritivas?trimestre=1`)
      .send([{ matricula: ana.matricula, texto: 'Progressos claros na leitura.' }]);
    expect(r.status).toBe(200);
    const pauta = await ctx.como(A.lurdes).get(`/turmas/${turmaINI}/pautas/trimestres/1`);
    expect(pauta.body.linhas.find((l) => l.aluno.nome === 'Ana Domingos').descritiva).toBe('Progressos claros na leitura.');
    expect((await ctx.como(A.lurdes).put(`/turmas/${turmaA7}/avaliacoes-descritivas?trimestre=1`)
      .send([{ matricula: graca.matricula, texto: 'x' }])).status).toBe(422);
  });
});

describe('Pautas (RF32, RF29, RF34)', () => {
  it('a pauta final da 7.ª A tem a situação de transição de cada aluno', async () => {
    const r = await ctx.como(A.director).get(`/turmas/${turmaA7}/pautas/final`);
    expect(r.status).toBe(200);
    const situacao = Object.fromEntries(r.body.linhas.map((l) => [l.aluno.nome, l.situacao]));
    expect(situacao).toMatchObject({
      'Hélder Cassoma': 'transita',      // negativas 9 e 8
      'Isabel Ndala': 'nao_transita',    // negativa de 7
      'Joaquim Muteka': 'nao_transita',  // negativa na disciplina-chave
      'Luzia Kapinga': 'transita',       // 9,5 → 10
    });
    expect(r.body.disciplinas.filter((d) => d.chave).map((d) => d.sigla).sort()).toEqual(['LP', 'MAT']);
  });

  it('a pauta da 13.ª classe mostra o estágio e o TFC', async () => {
    const t13 = await turmaDe(ctx, 'HBO-201', '13');
    const r = await ctx.como(B.director).get(`/turmas/${t13}/pautas/final`);
    expect(r.body.linhas.map((l) => [l.aluno.nome, l.situacao])).toEqual([
      ['Albertina Sakaita', 'pendente'], ['Zacarias Mbumba', 'concluido'],
    ]);
  });

  it('exporta a pauta final em CSV e regista a exportação', async () => {
    const r = await ctx.como(A.director).get(`/turmas/${turmaA7}/pautas/final?formato=csv`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text.split('\r\n')[0]).toBe('﻿N.º processo;Nome;LP;MAT;FIS;GEO;HIS;Negativas;Situação');
    expect(r.text).toContain('Isabel Ndala;12;12;7;12;12;1;Não transita');
    const aud = await ctx.como(A.director).get('/auditoria?entidade=turma');
    expect(aud.body.dados.some((x) => x.accao === 'exportar_pauta')).toBe(true);
  });
});
