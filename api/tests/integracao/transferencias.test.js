import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, alunoPorNome } from './contexto.js';

let ctx, graca, isabel, turmaA7, escolaA, escolaB, turmaB7, guia;
const comoPdf = (pedido) => pedido.buffer(true)
  .parse((res, cb) => { const p = []; res.on('data', (c) => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); });

beforeAll(async () => {
  ctx = await criarContexto();
  graca = await alunoPorNome(ctx, 'Graça Lukeny');   // 7.ª A da escola A (LP, MAT, FIS, GEO, HIS)
  isabel = await alunoPorNome(ctx, 'Isabel Ndala');
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
  escolaA = (await ctx.um(`SELECT id FROM escolas WHERE codigo = 'LDA-101'`)).id;
  escolaB = (await ctx.um(`SELECT id FROM escolas WHERE codigo = 'HBO-201'`)).id;
  // A escola B (técnica) passa a ter uma 7.ª classe para receber o aluno; tem LP e MAT, mas não FIS, GEO nem HIS
  const ano = await ctx.um('SELECT id FROM anos_lectivos WHERE escola_id = $1 AND activo', [escolaB]);
  const classe = await ctx.um(`INSERT INTO classes (escola_id, codigo, escala_maxima, nota_minima_aprovacao, minimo_negativa)
                               VALUES ($1, '7', 20, 10, 7) RETURNING id`, [escolaB]);
  turmaB7 = (await ctx.um(`INSERT INTO turmas (escola_id, ano_lectivo_id, classe_id, nome, turno, capacidade)
                           VALUES ($1, $2, $3, 'B', 'tarde', 30) RETURNING id`, [escolaB, ano.id, classe.id])).id;
  await ctx.como(A.adao).post(`/turmas/${turmaA7}/trimestres/1/publicar`);
});

describe('Guia de transferência (escola de origem)', () => {
  it('lista as escolas de destino (sem a própria)', async () => {
    const r = await ctx.como(A.secretaria).get('/transferencias/escolas');
    expect(r.body.map((e) => e.id)).toEqual([escolaB]);
  });

  it('com propinas em atraso não emite a guia', async () => {
    const rub = await ctx.como(A.director).post('/financas/rubricas').send({ nome: 'Propina', tipo: 'propina', valor: 1000, meses: [9] });
    await ctx.como(A.director).post(`/financas/rubricas/${rub.body.id}/gerar`);
    const r = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/transferencias`).send({ escolaDestino: escolaB, motivo: 'Mudança de residência' });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/em atraso/);
    const set = (await ctx.como(A.secretaria).get(`/alunos/${graca.id}/financas`)).body.cobrancas[0];
    await ctx.como(A.secretaria).post(`/alunos/${graca.id}/pagamentos`).send({ cobrancas: [set.id], metodo: 'numerario' });
  });

  it('emite a guia com código, notas do trimestre publicado e encarregados; uma só pendente', async () => {
    const r = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/transferencias`).send({ escolaDestino: escolaB, motivo: 'Mudança de residência' });
    expect(r.status).toBe(201);
    guia = r.body;
    expect(guia).toMatchObject({ estado: 'pendente', sentido: 'enviada', escolaDestino: 'Instituto Médio Técnico Fictício do Huambo' });
    expect(guia.codigo).toMatch(/^[A-Z0-9]{8}$/);
    const t = await ctx.um('SELECT dados FROM transferencias WHERE id = $1', [guia.id]);
    expect(t.dados.trimestresPublicados).toEqual([1]);
    expect(t.dados.notasAno.find((n) => n.sigla === 'LP')).toMatchObject({ trimestre: 1 });
    expect(t.dados.encarregados[0]).toMatchObject({ nome: 'Joana Lukeny', principal: true });
    expect((await ctx.como(A.secretaria).post(`/alunos/${graca.id}/transferencias`).send({ escolaDestino: escolaB, motivo: 'Outra vez' })).status).toBe(409);
  });

  it('a guia descarrega-se em PDF só na origem', async () => {
    const pdf = await comoPdf(ctx.como(A.secretaria).get(`/transferencias/${guia.id}/guia`));
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await ctx.como(B.secretaria).get(`/transferencias/${guia.id}/guia`)).status).toBe(404);
  });

  it('não transfere para a própria escola; um professor não emite', async () => {
    expect((await ctx.como(A.secretaria).post(`/alunos/${isabel.id}/transferencias`).send({ escolaDestino: escolaA, motivo: 'Teste' })).status).toBe(422);
    expect((await ctx.como(A.adao).post(`/alunos/${isabel.id}/transferencias`).send({ escolaDestino: escolaB, motivo: 'Teste' })).status).toBe(403);
  });
});

describe('Escola de destino', () => {
  it('vê a guia recebida sem o código; a prévia exige o código', async () => {
    const lista = (await ctx.como(B.secretaria).get('/transferencias')).body;
    const recebida = lista.find((t) => t.id === guia.id);
    expect(recebida).toMatchObject({ sentido: 'recebida', escolaOrigem: 'Complexo Escolar Fictício n.º 101' });
    expect(recebida.codigo).toBeUndefined();
    expect((await ctx.como(B.secretaria).get('/transferencias/codigo/ZZZZZZZZ')).status).toBe(404);
    const p = await ctx.como(B.secretaria).get(`/transferencias/codigo/${guia.codigo.toLowerCase()}`);
    expect(p.status).toBe(200);
    expect(p.body.semCorrespondencia).toEqual(expect.arrayContaining(['Física (FIS)', 'Geografia (GEO)', 'História (HIS)']));
    // Outra escola (a de origem) não usa o código como destino
    expect((await ctx.como(A.secretaria).get(`/transferencias/codigo/${guia.codigo}`)).status).toBe(404);
  });

  it('código errado ou turma de outra classe → 422', async () => {
    expect((await ctx.como(B.secretaria).post(`/transferencias/${guia.id}/aceitar`).send({ codigo: 'ABCDEFGH', turma: turmaB7 })).status).toBe(422);
    const t10 = await turmaDe(ctx, 'HBO-201', '10');
    const r = await ctx.como(B.secretaria).post(`/transferencias/${guia.id}/aceitar`).send({ codigo: guia.codigo, turma: t10 });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/7\.ª classe/);
  });

  it('aceita: cria o aluno com novo processo, encarregados e notas; a origem fica transferida', async () => {
    const r = await ctx.como(B.secretaria).post(`/transferencias/${guia.id}/aceitar`).send({ codigo: guia.codigo, turma: turmaB7 });
    expect(r.status).toBe(200);
    expect(r.body.aluno.numeroProcesso).toMatch(/^HBO-201-/);
    expect(r.body.notas).toBe(2); // LP e MAT do 1.º trimestre
    expect(r.body.semCorrespondencia).toEqual(expect.arrayContaining(['Física (FIS)']));
    const novo = (await ctx.como(B.secretaria).get(`/alunos/${r.body.aluno.id}`)).body;
    expect(novo).toMatchObject({ nome: 'Graça Lukeny' });
    expect(novo.encarregados[0].encarregado.nome).toBe('Joana Lukeny');
    const notas = await ctx.todos(`SELECT d.sigla, n.mt FROM notas n JOIN disciplinas d ON d.id = n.disciplina_id
                                   JOIN matriculas m ON m.id = n.matricula_id WHERE m.aluno_id = $1`, [r.body.aluno.id]);
    expect(notas.map((n) => n.sigla).sort()).toEqual(['LP', 'MAT']);
    const origem = await ctx.um(`SELECT estado FROM matriculas WHERE aluno_id = $1`, [graca.id]);
    expect(origem.estado).toBe('transferida');
    expect((await ctx.como(A.secretaria).get('/transferencias')).body.find((t) => t.id === guia.id).estado).toBe('aceite');
    // Não se aceita duas vezes
    expect((await ctx.como(B.secretaria).post(`/transferencias/${guia.id}/aceitar`).send({ codigo: guia.codigo, turma: turmaB7 })).status).toBe(409);
  });
});

describe('Recusar e cancelar', () => {
  it('o destino recusa com motivo; a origem cancela; cada um só o seu lado', async () => {
    const divida = (await ctx.como(A.secretaria).get(`/alunos/${isabel.id}/financas`)).body.cobrancas.filter((c) => c.estado === 'pendente');
    await ctx.como(A.secretaria).post(`/alunos/${isabel.id}/pagamentos`).send({ cobrancas: divida.map((c) => c.id), metodo: 'numerario' });
    const g1 = (await ctx.como(A.secretaria).post(`/alunos/${isabel.id}/transferencias`).send({ escolaDestino: escolaB, motivo: 'Pedido da família' })).body;
    expect((await ctx.como(A.secretaria).post(`/transferencias/${g1.id}/recusar`).send({ motivo: 'Sem vagas' })).status).toBe(403);
    const r = await ctx.como(B.director).post(`/transferencias/${g1.id}/recusar`).send({ motivo: 'Sem vagas na 7.ª classe' });
    expect(r.body).toMatchObject({ estado: 'recusada', resposta: 'Sem vagas na 7.ª classe' });
    expect((await ctx.um('SELECT estado FROM matriculas WHERE aluno_id = $1', [isabel.id])).estado).toBe('activa');

    const g2 = (await ctx.como(A.secretaria).post(`/alunos/${isabel.id}/transferencias`).send({ escolaDestino: escolaB, motivo: 'Pedido da família' })).body;
    expect((await ctx.como(B.secretaria).post(`/transferencias/${g2.id}/cancelar`).send({ motivo: 'Engano' })).status).toBe(403);
    expect((await ctx.como(A.secretaria).post(`/transferencias/${g2.id}/cancelar`).send({ motivo: 'A família desistiu' })).body.estado).toBe('cancelada');
    await expect(ctx.um('DELETE FROM transferencias WHERE id = $1', [g2.id])).rejects.toThrow();
  });
});
