import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, alunoPorNome } from './contexto.js';

// Osvaldo Tchinguali está na 9.ª classe (MFD 8, exame 12 → CF 10 em todas as disciplinas);
// a 7.ª e a 8.ª não estão no sistema: vêm do histórico escolar.
let ctx, osvaldo, disciplinas;
const notasDe = (valor) => disciplinas.map((d) => ({ disciplina: d.id, notaFinal: valor }));

beforeAll(async () => {
  ctx = await criarContexto();
  osvaldo = await alunoPorNome(ctx, 'Osvaldo Tchinguali');
  disciplinas = await ctx.todos(`
    SELECT d.id, d.sigla FROM disciplinas d JOIN escolas e ON e.id = d.escola_id
    WHERE e.codigo = 'LDA-101' AND d.sigla IN ('LP', 'MAT', 'FIS', 'GEO', 'HIS') ORDER BY d.sigla`);
});

describe('Histórico escolar (notas de anos anteriores)', () => {
  it('a secretaria lança as notas finais da 7.ª e da 8.ª classes', async () => {
    const r7 = await ctx.como(A.secretaria).put(`/alunos/${osvaldo.id}/historico/7`)
      .send({ anoLectivo: '2024/2025', escolaOrigem: 'Escola n.º 55 do Cazenga', notas: notasDe(13) });
    expect(r7.status).toBe(200);
    const r8 = await ctx.como(A.secretaria).put(`/alunos/${osvaldo.id}/historico/8`).send({ anoLectivo: '2025/2026', notas: notasDe(14) });
    expect(r8.body.map((c) => [c.classe, c.anoLectivo, c.notas.length])).toEqual([['7', '2024/2025', 5], ['8', '2025/2026', 5]]);
    expect(r8.body[0].escolaOrigem).toBe('Escola n.º 55 do Cazenga');
  });

  it('voltar a gravar uma classe substitui as notas, e a alteração fica na auditoria', async () => {
    const r = await ctx.como(A.secretaria).put(`/alunos/${osvaldo.id}/historico/8`).send({ anoLectivo: '2025/2026', notas: notasDe(15) });
    expect(r.body[1].notas.every((n) => n.notaFinal === 15)).toBe(true);
    const aud = await ctx.como(A.director).get('/auditoria?entidade=aluno');
    expect(aud.body.dados.filter((x) => x.accao === 'historico_escolar')).toHaveLength(3);
  });

  it('o certificado usa o histórico nas classes que não estão no sistema', async () => {
    const r = await ctx.como(A.secretaria).get(`/alunos/${osvaldo.id}/certificados/previa?ciclo=i_ciclo`);
    expect(r.body.classes).toEqual([
      { codigo: '7', ano: '2024/2025', origem: 'historico' },
      { codigo: '8', ano: '2025/2026', origem: 'historico' },
      { codigo: '9', ano: '2026/2027', origem: 'sistema' },
    ]);
    // (13 + 15 + 10) / 3 = 12,67 → 13
    expect(r.body.disciplinas.every((d) => d.notas.join() === '13,15,10' && d.media === 13)).toBe(true);
    expect(r.body).toMatchObject({ mediaGeral: 13, emFalta: [] });
  });

  it('com os dados pessoais preenchidos, o certificado é emitido', async () => {
    await ctx.como(A.secretaria).patch(`/alunos/${osvaldo.id}`).send({
      nomePai: 'José Tchinguali', nomeMae: 'Ana Tchinguali', naturalidade: 'Luanda', municipioNaturalidade: 'Cazenga',
      provinciaNaturalidade: 'Luanda', documento: { tipo: 'bi', numero: '009876543LA042' },
      documentoEmissaoLocal: 'Luanda', documentoEmissaoData: '2023-02-02' });
    const r = await ctx.como(A.secretaria).post(`/alunos/${osvaldo.id}/certificados`).send({ ciclo: 'i_ciclo', livroRegisto: '3' });
    expect(r.status).toBe(201);
    expect(r.body.rascunho).toBe(false);
  });

  it('recusa uma classe que o aluno já tem no sistema (409) e notas acima da escala (422)', async () => {
    const r9 = await ctx.como(A.secretaria).put(`/alunos/${osvaldo.id}/historico/9`).send({ anoLectivo: '2023/2024', notas: notasDe(12) });
    expect(r9.status).toBe(409);
    const r4 = await ctx.como(A.secretaria).put(`/alunos/${osvaldo.id}/historico/4`).send({ anoLectivo: '2021/2022', notas: notasDe(15) });
    expect(r4.status).toBe(422);
    expect(r4.body.codigo).toBe('ESCALA');
    const dec = await ctx.como(A.secretaria).put(`/alunos/${osvaldo.id}/historico/7`)
      .send({ anoLectivo: '2024/2025', notas: [{ disciplina: disciplinas[0].id, notaFinal: 12.5 }] });
    expect(dec.status).toBe(400); // a nota final é inteira
  });

  it('só a secretaria e a direcção; outra escola não vê nem altera', async () => {
    expect((await ctx.como(A.adao).put(`/alunos/${osvaldo.id}/historico/7`).send({ anoLectivo: '2024/2025', notas: notasDe(20) })).status).toBe(403);
    expect((await ctx.como(B.secretaria).get(`/alunos/${osvaldo.id}/historico`)).status).toBe(404);
    expect((await ctx.como(B.secretaria).put(`/alunos/${osvaldo.id}/historico/7`).send({ anoLectivo: '2024/2025', notas: notasDe(20) })).status).toBe(404);
  });
});
