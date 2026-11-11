import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, alunoPorNome } from './contexto.js';

let ctx, graca, ana, turmaA7;
const ANO = new Date().getFullYear();
const comoPdf = (pedido) => pedido.buffer(true)
  .parse((res, cb) => { const p = []; res.on('data', (c) => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); });

beforeAll(async () => {
  ctx = await criarContexto();
  graca = await alunoPorNome(ctx, 'Graça Lukeny'); // 7.ª A
  ana = await alunoPorNome(ctx, 'Ana Domingos');   // Iniciação
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
});

describe('Declaração de frequência', () => {
  it('a secretaria emite, com número seguido por ano, e descarrega o PDF', async () => {
    const r1 = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/declaracoes`)
      .send({ tipo: 'frequencia', finalidade: 'efeitos de abono de família' });
    const r2 = await ctx.como(A.director).post(`/alunos/${graca.id}/declaracoes`).send({ tipo: 'frequencia' });
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect([r1.body.numeroTexto, r2.body.numeroTexto]).toEqual([`1/${ANO}`, `2/${ANO}`]);
    expect(r1.body.tipo).toBe('declaracao_frequencia');
    const pdf = await comoPdf(ctx.como(A.secretaria).get(`/documentos/${r1.body.id}/pdf`));
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('sem matrícula activa no ano lectivo activo → 422', async () => {
    const novo = await ctx.como(A.secretaria).post('/alunos').send({ nome: 'Sem Matrícula', dataNascimento: '2012-01-01', sexo: 'M' });
    const r = await ctx.como(A.secretaria).post(`/alunos/${novo.body.id}/declaracoes`).send({ tipo: 'frequencia' });
    expect(r.status).toBe(422);
  });
});

describe('Declaração com notas', () => {
  it('antes de haver trimestres publicados → 422', async () => {
    const r = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/declaracoes`).send({ tipo: 'notas' });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/publicadas/);
  });

  it('com o 1.º trimestre publicado, emite com numeração própria (separada da de frequência)', async () => {
    await ctx.como(A.adao).post(`/turmas/${turmaA7}/trimestres/1/publicar`);
    const r = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/declaracoes`).send({ tipo: 'notas', finalidade: 'transferência de escola' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tipo: 'declaracao_notas', numeroTexto: `1/${ANO}` });
    const guardado = await ctx.um('SELECT dados FROM documentos WHERE id = $1', [r.body.id]);
    expect(guardado.dados.trimestresPublicados).toEqual([1]);
    expect(guardado.dados.disciplinas.find((d) => d.sigla === 'LP').trimestres).toEqual([14, null, null]);
  });

  it('na Iniciação não há notas: só a declaração de frequência', async () => {
    const r = await ctx.como(A.secretaria).post(`/alunos/${ana.id}/declaracoes`).send({ tipo: 'notas' });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/frequência/);
  });
});

describe('Permissões e lista de documentos', () => {
  it('só a secretaria e a direcção; outra escola não vê o aluno', async () => {
    expect((await ctx.como(A.adao).post(`/alunos/${graca.id}/declaracoes`).send({ tipo: 'frequencia' })).status).toBe(403);
    expect((await ctx.como(B.secretaria).post(`/alunos/${graca.id}/declaracoes`).send({ tipo: 'frequencia' })).status).toBe(404);
  });

  it('a ficha do aluno lista as declarações com o tipo, e a emissão fica na auditoria', async () => {
    const lista = await ctx.como(A.secretaria).get(`/alunos/${graca.id}/documentos`);
    expect(lista.body.map((d) => d.tipo).sort()).toEqual(['declaracao_frequencia', 'declaracao_frequencia', 'declaracao_notas']);
    const aud = await ctx.como(A.director).get('/auditoria?entidade=aluno');
    expect(aud.body.dados.some((x) => x.accao === 'emitir_declaracao_notas')).toBe(true);
  });
});
