import { camel } from '../util/sql.js';
import { conflito, naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { anoActivo } from './estrutura.js';
import { SQL_DESIGNACAO_TURMA } from './pessoas.js';

// Pagamentos e propinas (RF57–RF62). Valores em Kwanzas; cobranças e pagamentos nunca se apagam.

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const hoje = () => new Date().toISOString().slice(0, 10);
const centimos = (v) => Math.round(Number(v) * 100);
const kz = (c) => c / 100;
const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ======================================================================
// Preçário (rubricas)
// ======================================================================

const SQL_RUBRICA = `
  SELECT r.*, al.designacao AS ano_lectivo,
         CASE WHEN r.classe_id IS NULL THEN 'Todas as classes'
              ELSE (SELECT cc.designacao FROM classes c JOIN classes_catalogo cc ON cc.codigo = c.codigo WHERE c.id = r.classe_id) END AS classe
  FROM rubricas r JOIN anos_lectivos al ON al.id = r.ano_lectivo_id`;

export async function listarRubricas(bd, u, { anoLectivo }) {
  const ano = anoLectivo ?? (await anoActivo(bd, u.escolaId)).id;
  const { rows } = await bd.query(`${SQL_RUBRICA} WHERE r.escola_id = $1 AND r.ano_lectivo_id = $2 ORDER BY r.tipo DESC, r.nome`, [u.escolaId, ano]);
  return camel(rows);
}

export async function criarRubrica(bd, u, d) {
  const ano = d.anoLectivo ?? (await anoActivo(bd, u.escolaId)).id;
  if (d.tipo === 'propina' && !d.meses?.length) throw regra('Indique os meses da propina.');
  const { rows } = await bd.query(`
    INSERT INTO rubricas (escola_id, ano_lectivo_id, nome, tipo, valor, classe_id, meses, dia_vencimento, multa_percentagem)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
  [u.escolaId, ano, d.nome, d.tipo, d.valor, d.classe ?? null, d.tipo === 'propina' ? d.meses : null,
    d.diaVencimento ?? 10, d.multaPercentagem ?? 0]);
  await registar(bd, u, { entidade: 'escola', entidadeId: u.escolaId, accao: 'criar_rubrica', depois: d });
  return camel((await bd.query(`${SQL_RUBRICA} WHERE r.id = $1`, [rows[0].id])).rows[0]);
}

/** Muda a rubrica para as cobranças futuras; as já geradas mantêm o valor. */
export async function actualizarRubrica(bd, u, id, d) {
  const antes = (await bd.query('SELECT * FROM rubricas WHERE id = $1 AND escola_id = $2', [id, u.escolaId])).rows[0];
  if (!antes) throw naoEncontrado('Rubrica');
  await bd.query(`
    UPDATE rubricas SET nome = coalesce($3, nome), valor = coalesce($4, valor), dia_vencimento = coalesce($5, dia_vencimento),
           multa_percentagem = coalesce($6, multa_percentagem), activa = coalesce($7, activa)
    WHERE id = $1 AND escola_id = $2`,
  [id, u.escolaId, d.nome ?? null, d.valor ?? null, d.diaVencimento ?? null, d.multaPercentagem ?? null, d.activa ?? null]);
  await registar(bd, u, { entidade: 'escola', entidadeId: u.escolaId, accao: 'actualizar_rubrica', antes: camel(antes), depois: d });
  return camel((await bd.query(`${SQL_RUBRICA} WHERE r.id = $1`, [id])).rows[0]);
}

/**
 * Gera as propinas de uma rubrica para todos os alunos com matrícula activa no ano (e na classe, se indicada).
 * Pode ser repetida sem duplicar (por exemplo, depois de novas matrículas).
 */
export async function gerarPropinas(bd, u, rubricaId) {
  const r = (await bd.query(`SELECT r.*, al.designacao FROM rubricas r JOIN anos_lectivos al ON al.id = r.ano_lectivo_id
                             WHERE r.id = $1 AND r.escola_id = $2`, [rubricaId, u.escolaId])).rows[0];
  if (!r) throw naoEncontrado('Rubrica');
  if (r.tipo !== 'propina') throw regra('Só as propinas se geram por mês; os emolumentos cobram-se a cada aluno.');
  if (!r.activa) throw regra('A rubrica está inactiva.');
  // O ano lectivo começa no mês do 1.º trimestre: os meses a partir dele são do 1.º ano civil, os outros do 2.º
  const [a1, a2] = r.designacao.split('/').map(Number);
  const inicio = (await bd.query('SELECT inicio FROM trimestres WHERE ano_lectivo_id = $1 AND numero = 1', [r.ano_lectivo_id])).rows[0];
  const mesInicio = inicio ? Number(String(inicio.inicio).slice(5, 7)) : 9;

  return bd.transaccao(async (c) => {
    const matriculas = (await c.query(`
      SELECT m.id, m.aluno_id FROM matriculas m JOIN turmas t ON t.id = m.turma_id
      WHERE m.escola_id = $1 AND m.ano_lectivo_id = $2 AND m.estado = 'activa' AND ($3::uuid IS NULL OR t.classe_id = $3)`,
    [u.escolaId, r.ano_lectivo_id, r.classe_id])).rows;
    let criadas = 0;
    for (const m of matriculas) {
      for (const mes of r.meses) {
        const ano = mes >= mesInicio ? a1 : a2;
        const { rows } = await c.query(`
          INSERT INTO cobrancas (escola_id, aluno_id, matricula_id, rubrica_id, descricao, mes_referencia, valor, vencimento, criado_por)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (matricula_id, rubrica_id, mes_referencia) WHERE mes_referencia IS NOT NULL DO NOTHING RETURNING id`,
        [u.escolaId, m.aluno_id, m.id, r.id, `${r.nome} – ${MESES[mes - 1]} ${ano}`, iso(ano, mes, 1), r.valor,
          iso(ano, mes, r.dia_vencimento), u.id]);
        criadas += rows.length;
      }
    }
    await registar(c, u, { entidade: 'escola', entidadeId: u.escolaId, accao: 'gerar_propinas', depois: { rubrica: r.nome, criadas } });
    return { alunos: matriculas.length, criadas, jaExistiam: matriculas.length * r.meses.length - criadas };
  });
}

// ======================================================================
// Cobranças e ficha financeira do aluno
// ======================================================================

async function exigirAluno(bd, u, alunoId) {
  const a = (await bd.query('SELECT id, nome, numero_processo FROM alunos WHERE id = $1 AND escola_id = $2', [alunoId, u.escolaId])).rows[0];
  if (!a) throw naoEncontrado('Aluno');
  return a;
}

/** Cobra um emolumento (declaração, certificado…) ou outra rubrica a um aluno. */
export async function criarCobranca(bd, u, alunoId, { rubrica, descricao, vencimento }) {
  await exigirAluno(bd, u, alunoId);
  const r = (await bd.query('SELECT * FROM rubricas WHERE id = $1 AND escola_id = $2', [rubrica, u.escolaId])).rows[0];
  if (!r) throw naoEncontrado('Rubrica');
  if (r.tipo === 'propina') throw regra('As propinas geram-se no preçário (Gerar propinas).');
  if (!r.activa) throw regra('A rubrica está inactiva.');
  const m = (await bd.query(`SELECT id FROM matriculas WHERE aluno_id = $1 AND estado = 'activa' ORDER BY criado_em DESC LIMIT 1`, [alunoId])).rows[0];
  const { rows } = await bd.query(`
    INSERT INTO cobrancas (escola_id, aluno_id, matricula_id, rubrica_id, descricao, valor, vencimento, criado_por)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
  [u.escolaId, alunoId, m?.id ?? null, r.id, descricao ?? r.nome, r.valor, vencimento ?? hoje(), u.id]);
  await registar(bd, u, { entidade: 'aluno', entidadeId: alunoId, accao: 'criar_cobranca', depois: { cobranca: rows[0].id, rubrica: r.nome } });
  return rows[0];
}

/** Multa de uma cobrança paga (ou a pagar) numa data: percentagem da rubrica se passou o vencimento. */
const multaDe = (c, data) => (data > String(c.vencimento).slice(0, 10)
  ? Math.round(centimos(c.valor) * Number(c.multa_percentagem) / 100) : 0);

export async function fichaFinanceira(bd, u, alunoId) {
  const aluno = camel(await exigirAluno(bd, u, alunoId));
  const dia = hoje();
  const cobrancas = (await bd.query(`
    SELECT c.id, c.descricao, c.valor, c.vencimento, c.estado, c.anulada_motivo, c.mes_referencia, r.tipo, r.multa_percentagem
    FROM cobrancas c JOIN rubricas r ON r.id = c.rubrica_id
    WHERE c.aluno_id = $1 AND c.escola_id = $2 ORDER BY c.vencimento, c.descricao`, [alunoId, u.escolaId])).rows
    .map((c) => ({
      id: c.id, descricao: c.descricao, tipo: c.tipo, valor: Number(c.valor), vencimento: c.vencimento, estado: c.estado,
      anuladaMotivo: c.anulada_motivo, emAtraso: c.estado === 'pendente' && c.vencimento < dia,
      multaPrevista: c.estado === 'pendente' ? kz(multaDe(c, dia)) : 0,
    }));
  const pagamentos = await listarPagamentos(bd, u, alunoId);
  const soma = (l) => kz(l.reduce((s, c) => s + centimos(c.valor) + centimos(c.multaPrevista ?? 0), 0));
  const pendentes = cobrancas.filter((c) => c.estado === 'pendente');
  return {
    aluno, cobrancas, pagamentos,
    totais: {
      pendente: soma(pendentes),
      emAtraso: soma(pendentes.filter((c) => c.emAtraso)),
      pago: kz(pagamentos.filter((p) => p.estado === 'valido').reduce((s, p) => s + centimos(p.valorTotal), 0)),
    },
  };
}

async function listarPagamentos(bd, u, alunoId) {
  const { rows } = await bd.query(`
    SELECT p.id, p.numero, p.ano, p.valor_total, p.metodo, p.referencia, p.data_pagamento, p.estado, p.anulado_motivo,
           us.nome AS registado_por,
           coalesce((SELECT json_agg(json_build_object('descricao', c.descricao, 'valor', i.valor, 'multa', i.multa) ORDER BY c.vencimento)
                     FROM pagamento_itens i JOIN cobrancas c ON c.id = i.cobranca_id WHERE i.pagamento_id = p.id), '[]') AS itens
    FROM pagamentos p JOIN utilizadores us ON us.id = p.registado_por
    WHERE p.aluno_id = $1 AND p.escola_id = $2 ORDER BY p.data_pagamento DESC, p.numero DESC`, [alunoId, u.escolaId]);
  return rows.map((p) => ({
    ...camel(p), valorTotal: Number(p.valor_total), numeroTexto: `${p.numero}/${p.ano}`,
    itens: p.itens.map((i) => ({ ...i, valor: Number(i.valor), multa: Number(i.multa) })),
  }));
}

/**
 * Regista o pagamento de uma ou mais cobranças pendentes do aluno (pagas por inteiro), com a multa de atraso
 * se houver, e atribui o número de recibo seguinte da escola no ano.
 */
export async function registarPagamento(bd, u, alunoId, { cobrancas, metodo, referencia, dataPagamento }) {
  await exigirAluno(bd, u, alunoId);
  const data = dataPagamento ?? hoje();
  if (data > hoje()) throw regra('A data do pagamento não pode ser futura.');
  const ids = [...new Set(cobrancas)];
  const id = await bd.transaccao(async (c) => {
    const linhas = (await c.query(`
      SELECT c.*, r.multa_percentagem FROM cobrancas c JOIN rubricas r ON r.id = c.rubrica_id
      WHERE c.id = ANY($1::uuid[]) AND c.aluno_id = $2 AND c.escola_id = $3 FOR UPDATE OF c`, [ids, alunoId, u.escolaId])).rows;
    if (linhas.length !== ids.length) throw naoEncontrado('Cobrança');
    const naoPendentes = linhas.filter((l) => l.estado !== 'pendente');
    if (naoPendentes.length) throw conflito(`Já não está pendente: ${naoPendentes.map((l) => l.descricao).join(', ')}.`);

    const itens = linhas.map((l) => ({ id: l.id, valor: centimos(l.valor), multa: multaDe(l, data) }));
    const total = itens.reduce((s, i) => s + i.valor + i.multa, 0);
    const ano = Number(data.slice(0, 4));
    await c.query('SELECT id FROM escolas WHERE id = $1 FOR UPDATE', [u.escolaId]); // numeração sem repetições
    const numero = (await c.query('SELECT coalesce(max(numero), 0) + 1 AS n FROM pagamentos WHERE escola_id = $1 AND ano = $2',
      [u.escolaId, ano])).rows[0].n;
    const p = (await c.query(`
      INSERT INTO pagamentos (escola_id, aluno_id, numero, ano, valor_total, metodo, referencia, data_pagamento, registado_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [u.escolaId, alunoId, numero, ano, kz(total), metodo, referencia ?? null, data, u.id])).rows[0];
    for (const i of itens) {
      await c.query('INSERT INTO pagamento_itens (escola_id, pagamento_id, cobranca_id, valor, multa) VALUES ($1, $2, $3, $4, $5)',
        [u.escolaId, p.id, i.id, kz(i.valor), kz(i.multa)]);
      await c.query(`UPDATE cobrancas SET estado = 'paga' WHERE id = $1`, [i.id]);
    }
    await registar(c, u, { entidade: 'aluno', entidadeId: alunoId, accao: 'registar_pagamento',
                           depois: { recibo: `${numero}/${ano}`, total: kz(total), metodo } });
    return p.id;
  });
  return (await listarPagamentos(bd, u, alunoId)).find((p) => p.id === id);
}

/** Anula um pagamento (só o director): as cobranças voltam a pendentes; o recibo fica marcado como anulado. */
export async function anularPagamento(bd, u, id, { motivo }) {
  return bd.transaccao(async (c) => {
    const p = (await c.query('SELECT * FROM pagamentos WHERE id = $1 AND escola_id = $2 FOR UPDATE', [id, u.escolaId])).rows[0];
    if (!p) throw naoEncontrado('Pagamento');
    if (p.estado === 'anulado') throw conflito('O pagamento já está anulado.');
    await c.query(`UPDATE pagamentos SET estado = 'anulado', anulado_motivo = $2, anulado_por = $3 WHERE id = $1`, [id, motivo, u.id]);
    await c.query(`UPDATE cobrancas SET estado = 'pendente' WHERE id IN (SELECT cobranca_id FROM pagamento_itens WHERE pagamento_id = $1)`, [id]);
    await registar(c, u, { entidade: 'aluno', entidadeId: p.aluno_id, accao: 'anular_pagamento',
                           antes: { recibo: `${p.numero}/${p.ano}`, total: Number(p.valor_total) }, justificacao: motivo });
    return { id, estado: 'anulado' };
  });
}

/** Anula uma cobrança pendente (isenção, erro…), só o director. */
export async function anularCobranca(bd, u, id, { motivo }) {
  return bd.transaccao(async (c) => {
    const x = (await c.query('SELECT * FROM cobrancas WHERE id = $1 AND escola_id = $2 FOR UPDATE', [id, u.escolaId])).rows[0];
    if (!x) throw naoEncontrado('Cobrança');
    if (x.estado !== 'pendente') throw conflito('Só se anulam cobranças pendentes (anule primeiro o pagamento).');
    await c.query(`UPDATE cobrancas SET estado = 'anulada', anulada_motivo = $2 WHERE id = $1`, [id, motivo]);
    await registar(c, u, { entidade: 'aluno', entidadeId: x.aluno_id, accao: 'anular_cobranca',
                           antes: { descricao: x.descricao, valor: Number(x.valor) }, justificacao: motivo });
    return { id, estado: 'anulada' };
  });
}

// ======================================================================
// Dívidas e resumo
// ======================================================================

/** Alunos com cobranças vencidas e por pagar, do maior valor para o menor. */
export async function dividas(bd, u, { turma }) {
  const { rows } = await bd.query(`
    SELECT a.id, a.nome, a.numero_processo, ${SQL_DESIGNACAO_TURMA} AS turma, t.id AS turma_id,
           count(*)::int AS cobrancas, sum(x.valor) AS total, min(x.vencimento) AS mais_antiga
    FROM cobrancas x
    JOIN alunos a ON a.id = x.aluno_id
    LEFT JOIN matriculas m ON m.aluno_id = a.id AND m.estado = 'activa'
    LEFT JOIN turmas t ON t.id = m.turma_id
    LEFT JOIN classes c ON c.id = t.classe_id LEFT JOIN classes_catalogo cc ON cc.codigo = c.codigo
    WHERE x.escola_id = $1 AND x.estado = 'pendente' AND x.vencimento < $2 AND ($3::uuid IS NULL OR t.id = $3)
    GROUP BY a.id, a.nome, a.numero_processo, cc.codigo, t.nome, t.id
    ORDER BY sum(x.valor) DESC, a.nome`, [u.escolaId, hoje(), turma ?? null]);
  return rows.map((r) => ({ ...camel(r), total: Number(r.total) }));
}

/** Recebido num mês (por método) e totais em dívida. */
export async function resumo(bd, u, { mes }) {
  const m = mes ?? hoje().slice(0, 7);
  const recebido = (await bd.query(`
    SELECT metodo, count(*)::int AS pagamentos, sum(valor_total) AS total FROM pagamentos
    WHERE escola_id = $1 AND estado = 'valido' AND to_char(data_pagamento, 'YYYY-MM') = $2 GROUP BY metodo ORDER BY metodo`,
  [u.escolaId, m])).rows.map((r) => ({ ...r, total: Number(r.total) }));
  const divida = (await bd.query(`
    SELECT coalesce(sum(valor) FILTER (WHERE vencimento < $2), 0) AS em_atraso, coalesce(sum(valor), 0) AS pendente
    FROM cobrancas WHERE escola_id = $1 AND estado = 'pendente'`, [u.escolaId, hoje()])).rows[0];
  return {
    mes: m, recebido, totalRecebido: kz(recebido.reduce((s, r) => s + centimos(r.total), 0)),
    emAtraso: Number(divida.em_atraso), pendente: Number(divida.pendente),
  };
}

// ======================================================================
// Recibo
// ======================================================================

/** Dados do recibo. O encarregado e o aluno só vêem os recibos dos seus alunos. */
export async function dadosRecibo(bd, u, pagamentoId, alunosPermitidos) {
  const p = (await bd.query(`
    SELECT p.*, us.nome AS registado_por_nome, a.nome AS aluno_nome, a.numero_processo
    FROM pagamentos p JOIN utilizadores us ON us.id = p.registado_por JOIN alunos a ON a.id = p.aluno_id
    WHERE p.id = $1 AND p.escola_id = $2`, [pagamentoId, u.escolaId])).rows[0];
  if (!p) throw naoEncontrado('Pagamento');
  if (alunosPermitidos && !alunosPermitidos.includes(p.aluno_id)) throw naoEncontrado('Pagamento');
  if (u.perfil === 'professor' || u.perfil === 'coordenador') throw proibido();
  const itens = (await bd.query(`
    SELECT c.descricao, i.valor, i.multa FROM pagamento_itens i JOIN cobrancas c ON c.id = i.cobranca_id
    WHERE i.pagamento_id = $1 ORDER BY c.vencimento`, [pagamentoId])).rows.map((i) => ({ ...i, valor: Number(i.valor), multa: Number(i.multa) }));
  const turma = (await bd.query(`
    SELECT ${SQL_DESIGNACAO_TURMA} AS turma FROM matriculas m JOIN turmas t ON t.id = m.turma_id
    JOIN classes c ON c.id = t.classe_id JOIN classes_catalogo cc ON cc.codigo = c.codigo
    WHERE m.aluno_id = $1 AND m.estado <> 'anulada' ORDER BY m.criado_em DESC LIMIT 1`, [p.aluno_id])).rows[0];
  const ee = (await bd.query(`
    SELECT e.nome FROM aluno_encarregados ae JOIN encarregados e ON e.id = ae.encarregado_id
    WHERE ae.aluno_id = $1 ORDER BY ae.principal DESC LIMIT 1`, [p.aluno_id])).rows[0];
  return {
    numeroTexto: `${p.numero}/${p.ano}`, data: String(p.data_pagamento).slice(0, 10), metodo: p.metodo, referencia: p.referencia,
    valorTotal: Number(p.valor_total), anulado: p.estado === 'anulado', anuladoMotivo: p.anulado_motivo,
    registadoPor: p.registado_por_nome, aluno: { nome: p.aluno_nome, numeroProcesso: p.numero_processo, turma: turma?.turma ?? null },
    pagador: ee?.nome ?? p.aluno_nome, itens,
  };
}
