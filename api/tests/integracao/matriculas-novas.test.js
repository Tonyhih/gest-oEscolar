import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, turmaDe } from './contexto.js';

let ctx, turmaA7, turmaA9;
beforeAll(async () => {
  ctx = await criarContexto();
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
  turmaA9 = await turmaDe(ctx, 'LDA-101', '9');
});

const contar = async (tabela) => (await ctx.um(`SELECT count(*)::int AS n FROM ${tabela}`)).n;

describe('Ficha de matrícula de um aluno novo (POST /matriculas/novas)', () => {
  it('cria o aluno, o encarregado e a matrícula numa só operação', async () => {
    const r = await ctx.como(A.secretaria).post('/matriculas/novas').send({
      aluno: { nome: 'Kiala Novo', dataNascimento: '2013-04-04', sexo: 'M', telefone: '+244 923 111 222' },
      encarregado: { nome: 'Maria Novo', telefone: '+244 923 333 444', parentesco: 'Mãe' },
      turma: turmaA7,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado: 'activa', tipo: 'matricula', turmaDesignacao: '7.ª A', aluno: { nome: 'Kiala Novo' } });
    expect(r.body.aluno.numeroProcesso).toMatch(/^LDA-101-\d{4}$/);
    const ficha = await ctx.como(A.secretaria).get(`/alunos/${r.body.aluno.id}`);
    expect(ficha.body.encarregados[0]).toMatchObject({ parentesco: 'Mãe', principal: true, encarregado: { nome: 'Maria Novo' } });
  });

  it('turma cheia → 409 e nada fica gravado (nem o aluno, nem o encarregado)', async () => {
    await ctx.como(A.secretaria).patch(`/turmas/${turmaA9}`).send({ capacidade: 4 });
    const antes = { alunos: await contar('alunos'), encarregados: await contar('encarregados') };
    const r = await ctx.como(A.secretaria).post('/matriculas/novas').send({
      aluno: { nome: 'Sem Lugar', dataNascimento: '2011-01-01', sexo: 'F' },
      encarregado: { nome: 'Pai Sem Lugar', telefone: '+244 923 000 001' },
      turma: turmaA9,
    });
    expect(r.status).toBe(409);
    expect({ alunos: await contar('alunos'), encarregados: await contar('encarregados') }).toEqual(antes);
    await ctx.como(A.secretaria).patch(`/turmas/${turmaA9}`).send({ capacidade: 40 });
  });

  it('só a secretaria matricula', async () => {
    const r = await ctx.como(A.director).post('/matriculas/novas')
      .send({ aluno: { nome: 'Xx Yy', dataNascimento: '2013-01-01', sexo: 'M' }, turma: turmaA7 });
    expect(r.status).toBe(403);
  });
});

describe('Importar uma lista de alunos (POST /matriculas/importacao)', () => {
  const lista = (n) => Array.from({ length: n }, (_, i) => ({
    nome: `Aluno Importado ${i + 1} (teste)`, dataNascimento: '2012-06-15', sexo: i % 2 ? 'F' : 'M',
    ...(i === 0 ? { encarregadoNome: 'Encarregado Um', encarregadoTelefone: '+244 923 555 666' } : {}),
  }));

  it('importa e matricula todos, com números de processo seguidos', async () => {
    const r = await ctx.como(A.secretaria).post('/matriculas/importacao').send({ turma: turmaA9, alunos: lista(3) });
    expect(r.status).toBe(201);
    expect(r.body.importados).toBe(3);
    const numeros = r.body.matriculas.map((m) => Number(m.aluno.numeroProcesso.split('-').pop())).sort((a, b) => a - b);
    expect(numeros[1] - numeros[0]).toBe(1);
    expect(numeros[2] - numeros[1]).toBe(1);
    const turma = await ctx.como(A.secretaria).get(`/turmas/${turmaA9}`);
    expect(turma.body.alunos.filter((a) => a.nome.startsWith('Aluno Importado'))).toHaveLength(3);
  });

  it('sem vagas para todos → 409 com o número de vagas, e ninguém é importado', async () => {
    await ctx.como(A.secretaria).patch(`/turmas/${turmaA7}`).send({ capacidade: 8 }); // 6 alunos → 2 vagas
    const antes = await contar('alunos');
    const r = await ctx.como(A.secretaria).post('/matriculas/importacao').send({ turma: turmaA7, alunos: lista(3) });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toBe('A turma só tem 2 vagas e a lista tem 3 alunos.');
    expect(await contar('alunos')).toBe(antes);
  });

  it('uma linha inválida → 400 a indicar a linha, e ninguém é importado', async () => {
    const alunos = lista(2);
    alunos[1].dataNascimento = '15/06/2012';
    const r = await ctx.como(A.secretaria).post('/matriculas/importacao').send({ turma: turmaA9, alunos });
    expect(r.status).toBe(400);
    expect(r.body.detalhes[0].campo).toBe('body.alunos.1.dataNascimento');
  });

  it('a lista de matrículas do ano mostra a turma de cada aluno', async () => {
    const r = await ctx.como(A.secretaria).get('/matriculas');
    expect(r.status).toBe(200);
    const m = r.body.find((x) => x.aluno.nome === 'Aluno Importado 1 (teste)');
    expect(m).toMatchObject({ turmaDesignacao: '9.ª A', turno: 'tarde', estado: 'activa' });
  });
});
