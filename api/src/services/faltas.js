import { camel } from '../util/sql.js';
import { conflito, naoEncontrado, proibido, regra } from '../middleware/erros.js';
import * as avisos from './avisos.js';
import { registar } from './auditoria.js';
import { exigirProfessorDaDisciplina, obterTurmaAcessivel } from './turmas.js';

const hoje = () => new Date().toISOString().slice(0, 10);

/** Trimestre a que pertence a data, no ano lectivo da turma. */
async function trimestreDaData(bd, turma, data) {
  const { rows } = await bd.query(
    'SELECT numero FROM trimestres WHERE ano_lectivo_id = $1 AND $2::date BETWEEN inicio AND fim', [turma.ano_lectivo_id, data]);
  if (!rows[0]) throw regra('A data não pertence a nenhum trimestre do ano lectivo.');
  return rows[0].numero;
}

const SQL_FALTA = `
  SELECT f.id, f.matricula_id AS matricula, f.disciplina_id AS disciplina, d.sigla, f.data, f.trimestre, f.estado, f.motivo,
         f.tipo, f.ocorrencia,
         json_build_object('id', a.id, 'numeroProcesso', a.numero_processo, 'nome', a.nome) AS aluno
  FROM faltas f
  JOIN matriculas m ON m.id = f.matricula_id
  JOIN alunos a ON a.id = m.aluno_id
  JOIN disciplinas d ON d.id = f.disciplina_id`;

/**
 * RF35: regista as faltas de uma aula. `matriculas` são os alunos que faltaram;
 * as faltas injustificadas de outros alunos nessa aula passam a "anulada" (nunca se apagam).
 */
export async function marcar(bd, u, turmaId, disciplinaId, data, matriculas) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  exigirProfessorDaDisciplina(u, turma, disciplinaId);
  if (turma.apenas_estagio) throw regra('A 13.ª classe é só de estágio.');
  if (data > hoje()) throw regra('Não pode registar faltas numa data futura.');
  const trimestre = await trimestreDaData(bd, turma, data);
  const unicas = [...new Set(matriculas)];
  const { rows } = await bd.query(
    `SELECT id FROM matriculas WHERE turma_id = $1 AND estado = 'activa' AND id = ANY($2::uuid[])`, [turmaId, unicas]);
  if (rows.length !== unicas.length) throw regra('Há matrículas que não pertencem a esta turma ou não estão activas.');

  await bd.transaccao(async (c) => {
    await c.query(`
      UPDATE faltas SET estado = 'anulada'
      WHERE disciplina_id = $2 AND data = $3 AND estado = 'injustificada' AND tipo = 'presenca'
        AND matricula_id IN (SELECT id FROM matriculas WHERE turma_id = $1)
        AND NOT (matricula_id = ANY($4::uuid[]))`, [turmaId, disciplinaId, data, unicas]);
    for (const m of unicas) {
      await c.query(`
        INSERT INTO faltas (escola_id, matricula_id, disciplina_id, data, trimestre, registada_por)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (matricula_id, disciplina_id, data)
        DO UPDATE SET estado = CASE WHEN faltas.estado = 'anulada' THEN 'injustificada' ELSE faltas.estado END`,
        [u.escolaId, m, disciplinaId, data, trimestre, u.id]);
    }
    await registar(c, u, { entidade: 'falta', entidadeId: turmaId, accao: 'marcar',
                           depois: { disciplina: disciplinaId, data, matriculas: unicas } });
    await avisos.verificarFaltas(c, u.escolaId, disciplinaId, trimestre, unicas);
  });
  const r = await bd.query(`${SQL_FALTA} WHERE m.turma_id = $1 AND f.disciplina_id = $2 AND f.data = $3 AND f.estado <> 'anulada'
                            ORDER BY a.nome`, [turmaId, disciplinaId, data]);
  return camel(r.rows);
}

/** RF37 */
export async function listar(bd, u, turmaId, { aluno, trimestre }) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  const p = [turmaId];
  const filtros = [`m.turma_id = $1`, `f.estado <> 'anulada'`];
  if (u.perfil === 'professor' && !turma.ehDirectorTurma) {
    p.push(turma.disciplinasDoProfessor); filtros.push(`f.disciplina_id = ANY($${p.length}::uuid[])`);
  }
  if (aluno) { p.push(aluno); filtros.push(`a.id = $${p.length}`); }
  if (trimestre) { p.push(trimestre); filtros.push(`f.trimestre = $${p.length}`); }
  return camel((await bd.query(`${SQL_FALTA} WHERE ${filtros.join(' AND ')} ORDER BY f.data DESC, a.nome`, p)).rows);
}

/** RF36: só o director de turma justifica. */
export async function justificar(bd, u, faltaId, { motivo }) {
  const f = (await bd.query(`SELECT f.*, m.turma_id FROM faltas f JOIN matriculas m ON m.id = f.matricula_id
                             WHERE f.id = $1 AND f.escola_id = $2`, [faltaId, u.escolaId])).rows[0];
  if (!f) throw naoEncontrado('Falta');
  if (!u.turmasDirigidas.includes(f.turma_id)) throw proibido('Só o director de turma pode justificar faltas.');
  if (f.tipo === 'disciplinar') throw regra('As faltas vermelhas (disciplinares) não se justificam; só o director as anula.');
  if (f.estado !== 'injustificada') throw regra('Só se justificam faltas injustificadas.');
  await bd.transaccao(async (c) => {
    await c.query(`UPDATE faltas SET estado = 'justificada', motivo = $2, justificada_por = $3 WHERE id = $1`, [faltaId, motivo, u.id]);
    await registar(c, u, { entidade: 'falta', entidadeId: faltaId, accao: 'justificar', justificacao: motivo });
  });
  return camel((await bd.query(`${SQL_FALTA} WHERE f.id = $1`, [faltaId])).rows[0]);
}

/** RF37: totais por aluno e disciplina no trimestre. */
export async function resumo(bd, u, turmaId, trimestre) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  if (u.perfil === 'professor' && !turma.ehDirectorTurma) throw proibido('Só o director de turma vê o resumo de faltas.');
  const { rows } = await bd.query(`
    SELECT json_build_object('id', a.id, 'numeroProcesso', a.numero_processo, 'nome', a.nome) AS aluno,
           coalesce(json_agg(json_build_object('disciplina', d.sigla, 'justificadas', x.j, 'injustificadas', x.i, 'disciplinares', x.v)
                             ORDER BY d.sigla) FILTER (WHERE d.id IS NOT NULL), '[]') AS por_disciplina
    FROM matriculas m
    JOIN alunos a ON a.id = m.aluno_id
    LEFT JOIN (SELECT matricula_id, disciplina_id,
                      count(*) FILTER (WHERE estado = 'justificada')::int AS j,
                      count(*) FILTER (WHERE estado = 'injustificada')::int AS i,
                      count(*) FILTER (WHERE tipo = 'disciplinar')::int AS v
               FROM faltas WHERE trimestre = $2 AND estado <> 'anulada'
               GROUP BY matricula_id, disciplina_id) x ON x.matricula_id = m.id
    LEFT JOIN disciplinas d ON d.id = x.disciplina_id
    WHERE m.turma_id = $1 AND m.estado = 'activa'
    GROUP BY a.id, a.numero_processo, a.nome
    ORDER BY a.nome`, [turmaId, trimestre]);
  return camel(rows);
}

/**
 * Falta vermelha (disciplinar): o professor da disciplina marca-a por indisciplina na aula, com a ocorrência.
 * Se o aluno já tinha falta de presença nessa aula, passa a disciplinar. O encarregado é avisado no portal.
 */
export async function marcarDisciplinar(bd, u, turmaId, disciplinaId, { matricula, data, ocorrencia }) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  exigirProfessorDaDisciplina(u, turma, disciplinaId);
  if (turma.apenas_estagio) throw regra('A 13.ª classe é só de estágio.');
  if (data > hoje()) throw regra('Não pode registar faltas numa data futura.');
  const trimestre = await trimestreDaData(bd, turma, data);
  const m = (await bd.query(`SELECT m.id, a.id AS aluno_id, a.nome FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
                             WHERE m.id = $1 AND m.turma_id = $2 AND m.estado = 'activa'`, [matricula, turmaId])).rows[0];
  if (!m) throw regra('O aluno não pertence a esta turma ou a matrícula não está activa.');
  const id = await bd.transaccao(async (c) => {
    const existente = (await c.query('SELECT id, tipo, estado FROM faltas WHERE matricula_id = $1 AND disciplina_id = $2 AND data = $3 FOR UPDATE',
      [matricula, disciplinaId, data])).rows[0];
    if (existente?.tipo === 'disciplinar' && existente.estado !== 'anulada') throw conflito('O aluno já tem falta vermelha nesta aula.');
    const { rows } = await c.query(`
      INSERT INTO faltas (escola_id, matricula_id, disciplina_id, data, trimestre, registada_por, tipo, ocorrencia)
      VALUES ($1, $2, $3, $4, $5, $6, 'disciplinar', $7)
      ON CONFLICT (matricula_id, disciplina_id, data)
      DO UPDATE SET tipo = 'disciplinar', ocorrencia = $7, estado = 'injustificada', motivo = NULL, justificada_por = NULL, registada_por = $6
      RETURNING id`, [u.escolaId, matricula, disciplinaId, data, trimestre, u.id, ocorrencia]);
    const disc = (await c.query('SELECT nome FROM disciplinas WHERE id = $1', [disciplinaId])).rows[0];
    await registar(c, u, { entidade: 'falta', entidadeId: rows[0].id, accao: 'falta_disciplinar', depois: { data, ocorrencia } });
    await avisos.faltaDisciplinar(c, u.escolaId, { id: rows[0].id, alunoId: m.aluno_id, aluno: m.nome, disciplina: disc.nome, data, ocorrencia });
    await avisos.verificarFaltas(c, u.escolaId, disciplinaId, trimestre, [matricula]);
    return rows[0].id;
  });
  return camel((await bd.query(`${SQL_FALTA} WHERE f.id = $1`, [id])).rows[0]);
}

/** Só o director anula uma falta vermelha (marcada por engano), com motivo. */
export async function anularDisciplinar(bd, u, faltaId, { motivo }) {
  const f = (await bd.query('SELECT * FROM faltas WHERE id = $1 AND escola_id = $2', [faltaId, u.escolaId])).rows[0];
  if (!f) throw naoEncontrado('Falta');
  if (f.tipo !== 'disciplinar' || f.estado === 'anulada') throw regra('Só se anulam aqui faltas vermelhas activas.');
  await bd.transaccao(async (c) => {
    await c.query(`UPDATE faltas SET estado = 'anulada', motivo = $2 WHERE id = $1`, [faltaId, motivo]);
    await registar(c, u, { entidade: 'falta', entidadeId: faltaId, accao: 'anular_falta_disciplinar', justificacao: motivo });
  });
  return { id: faltaId, estado: 'anulada' };
}
