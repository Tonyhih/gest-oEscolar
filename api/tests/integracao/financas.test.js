import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, alunoPorNome } from './contexto.js';

let ctx, graca, isabel, turmaA7, classe7, propina, emolumento;
const comoPdf = (pedido) => pedido.buffer(true)
  .parse((res, cb) => { const p = []; res.on('data', (c) => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); });
const ficha = async (aluno) => (await ctx.como(A.secretaria).get(`/alunos/${aluno.id}/financas`)).body;
const pendentes = async (aluno) => (await ficha(aluno)).cobrancas.filter((c) => c.estado === 'pendente');

beforeAll(async () => {
  ctx = await criarContexto();
  graca = await alunoPorNome(ctx, 'Graça Lukeny');   // 7.ª A
  isabel = await alunoPorNome(ctx, 'Isabel Ndala');  // 7.ª A
  turmaA7 = await turmaDe(ctx, 'LDA-101', '7');
  classe7 = (await ctx.um('SELECT classe_id FROM turmas WHERE id = $1', [turmaA7])).classe_id;
});

describe('Preçário', () => {
  it('o director cria a propina da 7.ª classe e um emolumento; a secretaria só consulta', async () => {
    const r = await ctx.como(A.director).post('/financas/rubricas').send({
      nome: 'Propina 7.ª classe', tipo: 'propina', valor: 5000, classe: classe7, meses: [9, 10, 11, 12, 1], diaVencimento: 10, multaPercentagem: 10,
    });
    expect(r.status).toBe(201);
    propina = r.body;
    const e = await ctx.como(A.director).post('/financas/rubricas').send({ nome: 'Declaração', tipo: 'emolumento', valor: 1500.5 });
    expect(e.status).toBe(201);
    emolumento = e.body;
    expect((await ctx.como(A.secretaria).post('/financas/rubricas').send({ nome: 'Outra', tipo: 'outro', valor: 10 })).status).toBe(403);
    const lista = await ctx.como(A.secretaria).get('/financas/rubricas');
    expect(lista.body.map((x) => x.nome)).toEqual(expect.arrayContaining(['Propina 7.ª classe', 'Declaração']));
  });

  it('propina sem meses ou valor com 3 casas decimais → erro de validação', async () => {
    expect((await ctx.como(A.director).post('/financas/rubricas').send({ nome: 'Propina X', tipo: 'propina', valor: 100 })).status).toBe(422);
    expect((await ctx.como(A.director).post('/financas/rubricas').send({ nome: 'Taxa', tipo: 'outro', valor: 1.234 })).status).toBe(400);
  });
});

describe('Gerar propinas', () => {
  it('gera um mês por aluno da classe, sem duplicar quando se repete', async () => {
    const r1 = await ctx.como(A.director).post(`/financas/rubricas/${propina.id}/gerar`);
    expect(r1.status).toBe(200);
    expect(r1.body.alunos).toBeGreaterThan(1);
    expect(r1.body.criadas).toBe(r1.body.alunos * 5);
    const r2 = await ctx.como(A.director).post(`/financas/rubricas/${propina.id}/gerar`);
    expect(r2.body).toMatchObject({ criadas: 0, jaExistiam: r1.body.criadas });
    const p = await pendentes(graca);
    expect(p.map((c) => c.descricao)).toEqual(expect.arrayContaining(['Propina 7.ª classe – Setembro 2026', 'Propina 7.ª classe – Janeiro 2027']));
    expect(p.find((c) => c.descricao.endsWith('Janeiro 2027')).vencimento).toBe('2027-01-10');
  });

  it('os emolumentos não se geram por mês; cobram-se a cada aluno', async () => {
    expect((await ctx.como(A.director).post(`/financas/rubricas/${emolumento.id}/gerar`)).status).toBe(422);
    const c = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/cobrancas`).send({ rubrica: emolumento.id });
    expect(c.status).toBe(201);
    expect((await ctx.como(A.secretaria).post(`/alunos/${graca.id}/cobrancas`).send({ rubrica: propina.id })).status).toBe(422);
  });
});

describe('Pagamentos e recibos', () => {
  let pagamento;
  it('paga Setembro (atrasado, com multa de 10%) e a declaração; recibo n.º 1/ano', async () => {
    const p = await pendentes(graca);
    const set = p.find((c) => c.descricao.endsWith('Setembro 2026'));
    const dec = p.find((c) => c.descricao === 'Declaração');
    expect(set.emAtraso).toBe(true);
    const r = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/pagamentos`)
      .send({ cobrancas: [set.id, dec.id], metodo: 'multicaixa', referencia: 'MCX-123' });
    expect(r.status).toBe(201);
    pagamento = r.body;
    const ano = new Date().getFullYear();
    expect(pagamento.numeroTexto).toBe(`1/${ano}`);
    expect(pagamento.valorTotal).toBe(5000 + 500 + 1500.5);
    const f = await ficha(graca);
    expect(f.cobrancas.find((c) => c.id === set.id).estado).toBe('paga');
    expect(f.totais.pago).toBe(7000.5);
  });

  it('pagar outra vez a mesma cobrança → 409; o recibo seguinte tem o número 2', async () => {
    const set = (await ficha(graca)).cobrancas.find((c) => c.descricao.endsWith('Setembro 2026'));
    expect((await ctx.como(A.secretaria).post(`/alunos/${graca.id}/pagamentos`).send({ cobrancas: [set.id], metodo: 'numerario' })).status).toBe(409);
    const out = (await pendentes(isabel)).find((c) => c.descricao.endsWith('Outubro 2026'));
    const r = await ctx.como(A.secretaria).post(`/alunos/${isabel.id}/pagamentos`).send({ cobrancas: [out.id], metodo: 'numerario', dataPagamento: '2026-10-05' });
    expect(r.status).toBe(201);
    expect(r.body.valorTotal).toBe(5000); // pago antes do vencimento: sem multa
    expect(r.body.numeroTexto.startsWith('2/')).toBe(true);
    // A cobrança de outro aluno não serve
    const daGraca = (await pendentes(graca))[0];
    expect((await ctx.como(A.secretaria).post(`/alunos/${isabel.id}/pagamentos`).send({ cobrancas: [daGraca.id], metodo: 'numerario' })).status).toBe(404);
  });

  it('o recibo descarrega-se em PDF', async () => {
    const pdf = await comoPdf(ctx.como(A.secretaria).get(`/pagamentos/${pagamento.id}/recibo`));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('dívidas e resumo do mês', async () => {
    const d = await ctx.como(A.secretaria).get('/financas/dividas').query({ turma: turmaA7 });
    expect(d.status).toBe(200);
    const hoje = new Date().toISOString().slice(0, 10);
    const vencidas = (await pendentes(graca)).filter((c) => c.vencimento < hoje);
    expect(d.body.find((x) => x.id === graca.id).total).toBe(vencidas.reduce((s, c) => s + c.valor, 0));
    const r = await ctx.como(A.secretaria).get('/financas/resumo').query({ mes: '2026-10' });
    expect(r.body.totalRecebido).toBe(5000);
  });

  it('só o director anula, com motivo; as cobranças voltam a pendentes', async () => {
    expect((await ctx.como(A.secretaria).post(`/pagamentos/${pagamento.id}/anular`).send({ motivo: 'Engano' })).status).toBe(403);
    const r = await ctx.como(A.director).post(`/pagamentos/${pagamento.id}/anular`).send({ motivo: 'Valor registado no aluno errado' });
    expect(r.status).toBe(200);
    expect((await ctx.como(A.director).post(`/pagamentos/${pagamento.id}/anular`).send({ motivo: 'Outra vez' })).status).toBe(409);
    const f = await ficha(graca);
    expect(f.pagamentos.find((p) => p.id === pagamento.id).estado).toBe('anulado');
    expect(f.cobrancas.find((c) => c.descricao === 'Declaração').estado).toBe('pendente');
    // O recibo anulado continua a poder imprimir-se (com a marca ANULADO)
    expect((await comoPdf(ctx.como(A.secretaria).get(`/pagamentos/${pagamento.id}/recibo`))).status).toBe(200);
    // Nunca se apaga
    await expect(ctx.um('DELETE FROM pagamentos WHERE id = $1', [pagamento.id])).rejects.toThrow();
  });

  it('o director anula uma cobrança pendente (isenção)', async () => {
    const dec = (await pendentes(graca)).find((c) => c.descricao === 'Declaração');
    const r = await ctx.como(A.director).post(`/cobrancas/${dec.id}/anular`).send({ motivo: 'Isenção por bolsa' });
    expect(r.status).toBe(200);
    expect((await ficha(graca)).cobrancas.find((c) => c.id === dec.id)).toMatchObject({ estado: 'anulada', anuladaMotivo: 'Isenção por bolsa' });
  });
});

describe('Permissões e isolamento', () => {
  it('professor não vê finanças; outra escola não vê o aluno nem o recibo', async () => {
    expect((await ctx.como(A.adao).get(`/alunos/${graca.id}/financas`)).status).toBe(403);
    expect((await ctx.como(B.secretaria).get(`/alunos/${graca.id}/financas`)).status).toBe(404);
    const p = (await ficha(graca)).pagamentos[0];
    expect((await ctx.como(B.secretaria).get(`/pagamentos/${p.id}/recibo`)).status).toBe(404);
    expect((await ctx.como(B.director).post(`/financas/rubricas/${propina.id}/gerar`)).status).toBe(404);
  });
});

describe('Portal', () => {
  it('a encarregada vê o que está em dívida e descarrega só os recibos da educanda', async () => {
    const joana = await ctx.um(`SELECT id FROM encarregados WHERE nome = 'Joana Lukeny'`);
    const conta = await ctx.como(A.secretaria).post(`/encarregados/${joana.id}/acesso-portal`).send({ email: 'joana.fin@familia.test' });
    const token = await ctx.token('joana.fin@familia.test', conta.body.palavraPasseProvisoria);
    await ctx.anonimo().post('/api/v1/auth/palavra-passe').set('Authorization', `Bearer ${token}`)
      .send({ actual: conta.body.palavraPasseProvisoria, nova: 'PortalNovo#1' });
    const entrar = await ctx.anonimo().post('/api/v1/auth/login').send({ email: 'joana.fin@familia.test', palavraPasse: 'PortalNovo#1' });
    const auth = { Authorization: `Bearer ${entrar.body.token}` };

    // Graça paga Novembro para haver um recibo válido
    const nov = (await pendentes(graca)).find((c) => c.descricao.endsWith('Novembro 2026'));
    const pago = await ctx.como(A.secretaria).post(`/alunos/${graca.id}/pagamentos`).send({ cobrancas: [nov.id], metodo: 'numerario' });

    const r = await ctx.anonimo().get(`/api/v1/portal/alunos/${graca.id}`).set(auth);
    expect(r.status).toBe(200);
    expect(r.body.financas.pendentes.length).toBeGreaterThan(0);
    expect(r.body.financas.pagamentos.map((p) => p.id)).toContain(pago.body.id);
    expect((await ctx.anonimo().get(`/api/v1/portal/pagamentos/${pago.body.id}/recibo`).set(auth)).status).toBe(200);
    const deIsabel = (await ficha(isabel)).pagamentos[0];
    expect((await ctx.anonimo().get(`/api/v1/portal/pagamentos/${deIsabel.id}/recibo`).set(auth)).status).toBe(404);
    expect((await ctx.anonimo().get(`/api/v1/pagamentos/${pago.body.id}/recibo`).set(auth)).status).toBe(403);
  });
});
