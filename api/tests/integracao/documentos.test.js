import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, disciplinaDe, alunoPorNome } from './contexto.js';
import { criarHistoricoICiclo } from './historico.js';
import { porExtenso } from '../../src/util/extenso.js';

let ctx, t7, mat, fis, manuel, graca;
const ANO = new Date().getFullYear();
const comoPdf = (pedido) => pedido.buffer(true)
  .parse((res, cb) => { const p = []; res.on('data', (c) => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); });
const ehPdf = (r) => r.status === 200 && r.headers['content-type'] === 'application/pdf' && r.body.subarray(0, 5).toString() === '%PDF-';

beforeAll(async () => {
  ctx = await criarContexto();
  t7 = await turmaDe(ctx, 'LDA-101', '7');
  mat = await disciplinaDe(ctx, 'LDA-101', 'MAT');
  fis = await disciplinaDe(ctx, 'LDA-101', 'FIS');
  manuel = await criarHistoricoICiclo(ctx, 'Manuel Chissola'); // 7.ª e 8.ª em anos anteriores, 9.ª agora
  graca = await alunoPorNome(ctx, 'Graça Lukeny');            // só tem a 7.ª
});

describe('Números por extenso', () => {
  it('escreve as classificações como nos certificados', () => {
    expect([0, 9, 12, 14, 16, 19, 20].map(porExtenso)).toEqual(['zero', 'nove', 'doze', 'catorze', 'dezasseis', 'dezanove', 'vinte']);
    expect(porExtenso(9.5)).toBe('nove vírgula cinco');
    expect(porExtenso(null)).toBe('');
  });
});

describe('Mini-pauta e pautas em PDF', () => {
  it('o professor da disciplina descarrega a mini-pauta', async () => {
    expect(ehPdf(await comoPdf(ctx.como(A.adao).get(`/turmas/${t7}/disciplinas/${mat}/mini-pauta?trimestre=1`)))).toBe(true);
  });
  it('outro professor não descarrega a mini-pauta de uma disciplina que não lecciona', async () => {
    expect((await ctx.como(A.lurdes).get(`/turmas/${t7}/disciplinas/${fis}/mini-pauta?trimestre=1`)).status).toBe(403);
  });
  it('pauta trimestral e final em PDF', async () => {
    expect(ehPdf(await comoPdf(ctx.como(A.director).get(`/turmas/${t7}/pautas/trimestres/1?formato=pdf`)))).toBe(true);
    expect(ehPdf(await comoPdf(ctx.como(A.director).get(`/turmas/${t7}/pautas/final?formato=pdf`)))).toBe(true);
  });
});

describe('Termo de frequência e aproveitamento', () => {
  it('a secretaria emite o termo; um professor não', async () => {
    expect(ehPdf(await comoPdf(ctx.como(A.secretaria).get(`/alunos/${manuel}/termo`)))).toBe(true);
    expect((await ctx.como(A.adao).get(`/alunos/${manuel}/termo`)).status).toBe(403);
  });
  it('outra escola não emite o termo de um aluno que não é seu', async () => {
    expect((await ctx.como(B.secretaria).get(`/alunos/${manuel}/termo`)).status).toBe(404);
  });
});

describe('Certificados (modelos do MED)', () => {
  it('prévia: aluno sem o ciclo completo → indica o que falta', async () => {
    const r = await ctx.como(A.secretaria).get(`/alunos/${graca.id}/certificados/previa?ciclo=i_ciclo`);
    expect(r.status).toBe(200);
    expect(r.body.completo).toBe(false);
    expect(r.body.emFalta).toEqual([
      'notas da 8.ª classe (matrícula no sistema ou histórico escolar)',
      'notas da 9.ª classe (matrícula no sistema ou histórico escolar)',
    ]);
    expect(r.body.dadosEmFalta).toContain('nome do pai');
  });

  it('sem dados completos não emite (422), mas permite um rascunho sem número', async () => {
    const r = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/certificados`).send({ ciclo: 'i_ciclo' });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('CERTIFICADO_INCOMPLETO');
    const rascunho = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/certificados`).send({ ciclo: 'i_ciclo', rascunho: true });
    expect(rascunho.status).toBe(201);
    expect(rascunho.body).toMatchObject({ rascunho: true, numero: null, numeroTexto: 'RASCUNHO' });
  });

  it('prévia completa: notas da 7.ª, 8.ª e 9.ª e médias arredondadas', async () => {
    const r = await ctx.como(A.secretaria).get(`/alunos/${manuel}/certificados/previa?ciclo=i_ciclo`);
    expect(r.body).toMatchObject({ completo: true, mediaGeral: 12, anoConclusao: '2026/2027', emFalta: [], dadosEmFalta: [] });
    // 7.ª: 12 · 8.ª: 13 · 9.ª: CF 10 (MFD 12 e exame 9) → (12 + 13 + 10) / 3 = 11,67 → 12
    expect(r.body.disciplinas[0]).toMatchObject({ notas: [12, 13, 10], media: 12 });
    expect(r.body.classes.map((c) => c.ano)).toEqual(['2024/2025', '2025/2026', '2026/2027']);
  });

  it('emite com numeração seguida por ano, e reimprime o mesmo documento', async () => {
    const um = await ctx.como(A.secretaria).post(`/alunos/${manuel}/certificados`).send({ ciclo: 'i_ciclo', livroRegisto: '7' });
    const dois = await ctx.como(A.director).post(`/alunos/${manuel}/certificados`).send({ ciclo: 'i_ciclo', livroRegisto: '7' });
    expect([um.status, dois.status]).toEqual([201, 201]);
    expect([um.body.numeroTexto, dois.body.numeroTexto]).toEqual([`1/${ANO}`, `2/${ANO}`]);
    expect(ehPdf(await comoPdf(ctx.como(A.secretaria).get(`/documentos/${um.body.id}/pdf`)))).toBe(true);
    const lista = await ctx.como(A.secretaria).get(`/alunos/${manuel}/documentos`);
    expect(lista.body.map((d) => d.numeroTexto)).toEqual([`2/${ANO}`, `1/${ANO}`]);
    // Ficou na auditoria e não se pode alterar nem apagar
    const aud = await ctx.como(A.director).get('/auditoria?entidade=aluno');
    expect(aud.body.dados.some((x) => x.accao === 'emitir_certificado')).toBe(true);
    await expect(ctx.bd.query('DELETE FROM documentos')).rejects.toThrow(/só aceita inserções/);
  });

  it('só a secretaria e a direcção emitem certificados; outra escola não vê os documentos', async () => {
    expect((await ctx.como(A.adao).post(`/alunos/${manuel}/certificados`).send({ ciclo: 'i_ciclo' })).status).toBe(403);
    const doc = (await ctx.como(A.secretaria).get(`/alunos/${manuel}/documentos`)).body[0];
    expect((await ctx.como(B.secretaria).get(`/documentos/${doc.id}/pdf`)).status).toBe(404);
  });
});

describe('Dados novos do aluno e da escola', () => {
  it('a secretaria grava a filiação e o B.I.; o director de turma não vê esses dados', async () => {
    const celeste = await alunoPorNome(ctx, 'Celeste Tchipa');
    const r = await ctx.como(A.secretaria).patch(`/alunos/${celeste.id}`)
      .send({ nomePai: 'João Tchipa', nomeMae: 'Marta Tchipa', documentoEmissaoLocal: 'Luanda', documentoEmissaoData: '2022-01-15' });
    expect(r.body).toMatchObject({ nomePai: 'João Tchipa', documentoEmissaoData: '2022-01-15' });
    const dt = await ctx.como(A.lurdes).get(`/alunos/${celeste.id}`); // directora da 6.ª A
    expect(dt.status).toBe(200);
    expect(dt.body).not.toHaveProperty('nomePai');
  });

  it('o director grava o decreto de criação; a secretaria não', async () => {
    expect((await ctx.como(A.director).patch('/escola').send({ decretoCriacao: '45/2010, de 3 de Junho' })).body.decretoCriacao)
      .toBe('45/2010, de 3 de Junho');
    expect((await ctx.como(A.secretaria).patch('/escola').send({ decretoCriacao: 'x x x' })).status).toBe(403);
  });
});
