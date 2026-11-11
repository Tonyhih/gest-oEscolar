import { camel } from '../util/sql.js';
import { conflito, naoEncontrado, regra } from '../middleware/erros.js';
import { gerarHash, gerarPalavraPasseProvisoria } from './autenticacao.js';
import { registar } from './auditoria.js';
import { decidirTransicao } from './avaliacao.js';
import { disciplinasDaTurma } from './turmas.js';
import { SQL_DESIGNACAO_TURMA } from './pessoas.js';
import { horarioDaTurma } from './horarios.js';
import { fichaFinanceira } from './financas.js';

// Portal do encarregado de educação e do aluno (RF50, RF51).
// Só mostra o que já foi publicado pela escola: as notas dos trimestres publicados e,
// com o 3.º trimestre publicado, as notas finais e a situação.

// ======================================================================
// Contas do portal (criadas pela secretaria ou pelo director)
// ======================================================================

async function criarConta(c, u, { nome, email, perfil }) {
  const palavraPasseProvisoria = gerarPalavraPasseProvisoria();
  const { rows } = await c.query(`
    INSERT INTO utilizadores (escola_id, nome, email, perfil, palavra_passe_hash, trocar_palavra_passe)
    VALUES ($1, $2, $3, $4, $5, true) RETURNING id, nome, email, perfil, estado`,
  [u.escolaId, nome, email, perfil, await gerarHash(palavraPasseProvisoria)]);
  return { utilizador: rows[0], palavraPasseProvisoria };
}

/** Dá acesso ao portal a um encarregado de educação da escola. */
export async function acessoEncarregado(bd, u, encarregadoId, { email }) {
  return bd.transaccao(async (c) => {
    const e = (await c.query('SELECT * FROM encarregados WHERE id = $1 AND escola_id = $2 FOR UPDATE', [encarregadoId, u.escolaId])).rows[0];
    if (!e) throw naoEncontrado('Encarregado');
    if (e.utilizador_id) throw conflito('Este encarregado já tem acesso ao portal.');
    const r = await criarConta(c, u, { nome: e.nome, email, perfil: 'encarregado' });
    await c.query('UPDATE encarregados SET utilizador_id = $2, email = coalesce(email, $3) WHERE id = $1', [encarregadoId, r.utilizador.id, email]);
    await registar(c, u, { entidade: 'utilizador', entidadeId: r.utilizador.id, accao: 'acesso_portal_encarregado' });
    return r;
  });
}

/** Dá acesso ao portal ao próprio aluno. */
export async function acessoAluno(bd, u, alunoId, { email }) {
  return bd.transaccao(async (c) => {
    const a = (await c.query('SELECT * FROM alunos WHERE id = $1 AND escola_id = $2 FOR UPDATE', [alunoId, u.escolaId])).rows[0];
    if (!a) throw naoEncontrado('Aluno');
    if (a.utilizador_id) throw conflito('Este aluno já tem acesso ao portal.');
    const r = await criarConta(c, u, { nome: a.nome, email, perfil: 'aluno' });
    await c.query('UPDATE alunos SET utilizador_id = $2 WHERE id = $1', [alunoId, r.utilizador.id]);
    await registar(c, u, { entidade: 'utilizador', entidadeId: r.utilizador.id, accao: 'acesso_portal_aluno' });
    return r;
  });
}

// ======================================================================
// O que o encarregado ou o aluno vê
// ======================================================================

/** Alunos a que a conta tem acesso: os educandos do encarregado, ou o próprio aluno. */
export async function alunosPermitidos(bd, u) {
  const sql = u.perfil === 'encarregado'
    ? `SELECT a.id, a.nome, a.numero_processo FROM alunos a
       JOIN aluno_encarregados ae ON ae.aluno_id = a.id
       JOIN encarregados e ON e.id = ae.encarregado_id
       WHERE e.utilizador_id = $1 AND a.estado = 'activo' ORDER BY a.nome`
    : `SELECT a.id, a.nome, a.numero_processo FROM alunos a WHERE a.utilizador_id = $1`;
  return camel((await bd.query(sql, [u.id])).rows);
}

export async function educandos(bd, u) {
  return alunosPermitidos(bd, u);
}

/** Resumo de um aluno: turma, notas publicadas, faltas e, no fim do ano, a situação. */
export async function resumo(bd, u, alunoId) {
  const permitidos = await alunosPermitidos(bd, u);
  const aluno = permitidos.find((a) => a.id === alunoId);
  if (!aluno) throw naoEncontrado('Aluno'); // 404 também para alunos que não são seus

  const m = (await bd.query(`
    SELECT m.id, m.turma_id, al.designacao AS ano, al.id AS ano_id
    FROM matriculas m JOIN anos_lectivos al ON al.id = m.ano_lectivo_id
    WHERE m.aluno_id = $1 AND m.estado = 'activa' ORDER BY al.activo DESC, al.designacao DESC LIMIT 1`, [alunoId])).rows[0];
  if (!m) return { aluno, matricula: null };
  const r = await resumoMatricula(bd, u, aluno, m);
  // Pagamentos: o que está em dívida e os últimos recibos
  const f = await fichaFinanceira(bd, u, alunoId);
  r.financas = {
    totais: f.totais,
    pendentes: f.cobrancas.filter((c) => c.estado === 'pendente'),
    pagamentos: f.pagamentos.filter((p) => p.estado === 'valido').slice(0, 12)
      .map(({ id, numeroTexto, dataPagamento, valorTotal, itens }) => ({ id, numeroTexto, dataPagamento, valorTotal, itens })),
  };
  return r;
}

/**
 * Dados académicos de uma matrícula, só com o que já foi publicado: turma, MT dos trimestres publicados,
 * notas finais e situação com o 3.º trimestre publicado, faltas e horário. Usado pelo portal e pelas declarações.
 * @param {{ id: string, turma_id: string, ano: string }} m
 */
export async function resumoMatricula(bd, u, aluno, m) {
  const turma = (await bd.query(`
    SELECT t.*, ${SQL_DESIGNACAO_TURMA} AS designacao_curta, c.nota_minima_aprovacao, c.minimo_negativa, c.max_negativas,
           c.classe_de_exame, c.avaliacao_qualitativa, c.apenas_estagio, c.escala_maxima, us.nome AS director_turma
    FROM turmas t JOIN classes c ON c.id = t.classe_id JOIN classes_catalogo cc ON cc.codigo = c.codigo
    LEFT JOIN professores p ON p.id = t.director_turma_id LEFT JOIN utilizadores us ON us.id = p.utilizador_id
    WHERE t.id = $1`, [m.turma_id])).rows[0];
  if (!turma) throw regra('Turma não encontrada.');

  const publicados = (await bd.query('SELECT trimestre FROM publicacoes WHERE turma_id = $1 ORDER BY trimestre', [turma.id]))
    .rows.map((r) => r.trimestre);
  const base = {
    aluno,
    matricula: {
      anoLectivo: m.ano, turma: turma.designacao_curta, turno: turma.turno, directorTurma: turma.director_turma,
      escalaMaxima: turma.escala_maxima, notaMinimaAprovacao: Number(turma.nota_minima_aprovacao),
    },
    trimestresPublicados: publicados,
    horario: await horarioDaTurma(bd, u, turma.id, { verificarAcesso: false }),
  };

  // Faltas registadas (não dependem da publicação)
  const faltas = (await bd.query(`
    SELECT d.sigla, d.nome, f.trimestre,
           count(*) FILTER (WHERE f.estado = 'justificada')::int AS justificadas,
           count(*) FILTER (WHERE f.estado = 'injustificada')::int AS injustificadas
    FROM faltas f JOIN disciplinas d ON d.id = f.disciplina_id
    WHERE f.matricula_id = $1 AND f.estado <> 'anulada'
    GROUP BY d.sigla, d.nome, f.trimestre ORDER BY d.nome, f.trimestre`, [m.id])).rows;

  if (turma.avaliacao_qualitativa) {
    const descritivas = (await bd.query(`SELECT trimestre, texto FROM avaliacoes_descritivas
      WHERE matricula_id = $1 AND trimestre = ANY($2::int[]) ORDER BY trimestre`, [m.id, publicados])).rows;
    return { ...base, tipo: 'descritiva', descritivas, faltas };
  }
  if (turma.apenas_estagio) {
    const e = (await bd.query('SELECT entidade, estado, nota, tfc_tema, tfc_nota, curso_concluido FROM estagios WHERE matricula_id = $1', [m.id])).rows[0];
    return { ...base, tipo: 'estagio', estagio: e ? camel(e) : null, faltas };
  }

  // Notas: só as MT dos trimestres publicados
  const disciplinas = await disciplinasDaTurma(bd, turma);
  const mts = (await bd.query('SELECT disciplina_id, trimestre, mt FROM notas WHERE matricula_id = $1 AND trimestre = ANY($2::int[])',
    [m.id, publicados])).rows;
  const mt = new Map(mts.map((n) => [`${n.disciplina_id}|${n.trimestre}`, n.mt]));
  const anoFechado = publicados.includes(3);
  const finais = anoFechado
    ? new Map((await bd.query('SELECT disciplina_id, nota_final, exame FROM v_resultados_disciplina WHERE matricula_id = $1', [m.id]))
      .rows.map((r) => [r.disciplina_id, r]))
    : new Map();

  const linhas = disciplinas.map((d) => ({
    sigla: d.sigla, nome: d.nome, chave: d.chave,
    trimestres: [1, 2, 3].map((t) => (publicados.includes(t) ? mt.get(`${d.id}|${t}`) ?? null : null)),
    exame: anoFechado ? finais.get(d.id)?.exame ?? null : null,
    notaFinal: anoFechado ? finais.get(d.id)?.nota_final ?? null : null,
  }));
  const situacao = anoFechado ? decidirTransicao({
    notaMinimaAprovacao: Number(turma.nota_minima_aprovacao), minimoNegativa: Number(turma.minimo_negativa),
    maxNegativas: turma.max_negativas, classeDeExame: turma.classe_de_exame,
  }, linhas.map((l) => ({ notaFinal: l.notaFinal, chave: l.chave }))) : null;

  return { ...base, tipo: 'notas', classeDeExame: turma.classe_de_exame, disciplinas: linhas, situacao, faltas };
}
