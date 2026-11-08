import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, ADMIN, turmaDe, disciplinaDe, alunoPorNome } from './contexto.js';

let ctx;
let alunoB, turmaB10, turmaA7, alunoA;
beforeAll(async () => {
  ctx = await criarContexto();
  alunoB = await alunoPorNome(ctx, 'Quintino Lussati');
  alunoA = await alunoPorNome(ctx, 'Graça Lukeny');
  turmaB10 = await turmaDe(ctx, 'HBO-201', '10');
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
});

describe('Isolamento entre escolas (RNF01, RN09)', () => {
  it('um aluno de outra escola responde 404 (não 403)', async () => {
    const r = await ctx.como(A.director).get(`/alunos/${alunoB.id}`);
    expect(r.status).toBe(404);
  });

  it('a secretaria da Escola A não altera alunos da Escola B', async () => {
    expect((await ctx.como(A.secretaria).patch(`/alunos/${alunoB.id}`).send({ nome: 'Alterado' })).status).toBe(404);
  });

  it('as listagens só mostram dados da própria escola', async () => {
    const r = await ctx.como(A.secretaria).get('/alunos?limite=100');
    expect(r.status).toBe(200);
    expect(r.body.dados.map((a) => a.nome)).not.toContain('Quintino Lussati');
    expect(r.body.dados.every((a) => a.numeroProcesso.startsWith('LDA-101'))).toBe(true);
  });

  it('turmas, pautas e notas de outra escola respondem 404', async () => {
    expect((await ctx.como(A.director).get(`/turmas/${turmaB10}`)).status).toBe(404);
    expect((await ctx.como(A.director).get(`/turmas/${turmaB10}/pautas/final`)).status).toBe(404);
  });

  it('não se matricula um aluno numa turma de outra escola', async () => {
    const r = await ctx.como(A.secretaria).post('/matriculas').send({ aluno: alunoA.id, turma: turmaB10 });
    expect(r.status).toBe(404);
  });

  it('o administrador da plataforma não acede aos dados das escolas', async () => {
    expect((await ctx.como(ADMIN).get('/alunos')).status).toBe(403);
    expect((await ctx.como(ADMIN).get('/turmas')).status).toBe(403);
  });

  it('as escolas da plataforma só mostram totais agregados', async () => {
    const r = await ctx.como(ADMIN).get('/plataforma/escolas');
    expect(r.status).toBe(200);
    expect(r.body.dados.find((e) => e.codigo === 'LDA-101')).toMatchObject({ totalAlunos: 15, totalTurmas: 4 });
  });
});

describe('Permissões por perfil', () => {
  it('a secretaria não cria utilizadores', async () => {
    const r = await ctx.como(A.secretaria).post('/utilizadores').send({ nome: 'X Y Z', email: 'x@lda101.test', perfil: 'professor' });
    expect(r.status).toBe(403);
  });

  it('um professor não regista alunos', async () => {
    const r = await ctx.como(A.adao).post('/alunos').send({ nome: 'Aluno Novo', dataNascimento: '2013-01-01', sexo: 'M' });
    expect(r.status).toBe(403);
  });

  it('RN08: o professor não lança notas numa disciplina que não lecciona', async () => {
    const lp = await disciplinaDe(ctx, 'LDA-101', 'LP'); // LP da 7.ª A é da professora Lurdes
    const r = await ctx.como(A.adao).put(`/turmas/${turmaA7}/disciplinas/${lp}/notas?trimestre=1`)
      .send([{ matricula: alunoA.matricula, mac: 12 }]);
    expect(r.status).toBe(403);
  });

  it('o professor só vê as turmas onde lecciona ou que dirige', async () => {
    const r = await ctx.como(B.rui).get('/turmas');
    expect(r.status).toBe(200);
    // O Rui lecciona LP, ING e EF na 10.ª e na 12.ª, mas não tem disciplinas na 13.ª
    expect(r.body.map((t) => t.designacao).sort()).toEqual(['10.ª A – TI – Manhã', '12.ª A – TI – Manhã']);
  });

  it('o director de turma só consulta os alunos das turmas que dirige; a morada não lhe é mostrada', async () => {
    const turmaA6 = await turmaDe(ctx, 'LDA-101', '6');
    expect((await ctx.como(A.lurdes).get('/alunos')).status).toBe(403);
    const r = await ctx.como(A.lurdes).get(`/alunos?turma=${turmaA6}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(4);
    const celeste = await alunoPorNome(ctx, 'Celeste Tchipa');
    const ficha = await ctx.como(A.lurdes).get(`/alunos/${celeste.id}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body).not.toHaveProperty('morada');
    expect((await ctx.como(A.lurdes).get(`/alunos/${alunoA.id}`)).status).toBe(403); // 7.ª A não é dela
  });

  it('o coordenador só altera os cursos que coordena', async () => {
    const curso = await ctx.um(`SELECT id FROM cursos WHERE sigla = 'TI'`);
    expect((await ctx.como(B.coordenador).patch(`/cursos/${curso.id}`).send({ nome: 'Técnico de Informática e Redes' })).status).toBe(200);
    const outro = await ctx.como(B.director).post('/cursos').send({ nome: 'Técnico de Contabilidade', sigla: 'TC', ramo: 'tecnico_profissional' });
    expect(outro.status).toBe(201);
    expect((await ctx.como(B.coordenador).patch(`/cursos/${outro.body.id}`).send({ nome: 'Outro' })).status).toBe(403);
  });

  it('rota inexistente → 404 em JSON', async () => {
    const r = await ctx.como(A.director).get('/nao-existe');
    expect(r.status).toBe(404);
    expect(r.body.codigo).toBe('NAO_ENCONTRADO');
  });
});
