import { actualizar, camel, colunas, inserir } from '../util/sql.js';
import { naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { SQL_DESIGNACAO_TURMA } from './pessoas.js';
import { sincronizarAtribuicoes } from './horarios.js';

const TURNOS = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

// Turma com a configuração de avaliação da classe
const SQL_TURMA = `
  SELECT t.*, ${SQL_DESIGNACAO_TURMA} AS designacao_curta, cu.sigla AS curso_sigla,
         c.codigo AS classe_codigo, c.escala_maxima, c.nota_minima_aprovacao, c.minimo_negativa, c.max_negativas,
         c.classe_de_exame, c.avaliacao_qualitativa, c.apenas_estagio, cc.ordem AS classe_ordem,
         (SELECT count(*)::int FROM matriculas m WHERE m.turma_id = t.id AND m.estado = 'activa') AS total_alunos
  FROM turmas t
  JOIN classes c ON c.id = t.classe_id
  JOIN classes_catalogo cc ON cc.codigo = c.codigo
  LEFT JOIN cursos cu ON cu.id = t.curso_id`;

function formatar(t) {
  const {
    designacaoCurta, cursoSigla, escalaMaxima, notaMinimaAprovacao, minimoNegativa, maxNegativas,
    classeDeExame, avaliacaoQualitativa, apenasEstagio, classeOrdem, classeCodigo, escolaId, ...turma
  } = camel(t);
  return {
    ...turma,
    classeCodigo,
    designacao: [designacaoCurta, cursoSigla, TURNOS[t.turno]].filter(Boolean).join(' – '),
    avaliacao: { escalaMaxima, notaMinimaAprovacao, minimoNegativa, maxNegativas, classeDeExame, avaliacaoQualitativa, apenasEstagio },
  };
}

/**
 * Carrega a turma e verifica o acesso:
 *   director, secretaria e coordenador: todas as turmas da escola;
 *   professor: só as turmas onde lecciona ou que dirige.
 * Devolve a linha da turma com { ehDirectorTurma, disciplinasDoProfessor }.
 */
export async function obterTurmaAcessivel(bd, u, turmaId) {
  const t = (await bd.query(`${SQL_TURMA} WHERE t.id = $1 AND t.escola_id = $2`, [turmaId, u.escolaId])).rows[0];
  if (!t) throw naoEncontrado('Turma');
  t.ehDirectorTurma = u.turmasDirigidas.includes(t.id);
  t.disciplinasDoProfessor = [];
  if (u.perfil === 'professor') {
    const { rows } = await bd.query('SELECT disciplina_id FROM atribuicoes WHERE turma_id = $1 AND professor_id = $2',
      [turmaId, u.professorId]);
    t.disciplinasDoProfessor = rows.map((r) => r.disciplina_id);
    if (!t.ehDirectorTurma && t.disciplinasDoProfessor.length === 0) throw naoEncontrado('Turma');
  }
  return t;
}

/** RN08: só o professor atribuído lança notas e faltas nesta disciplina. */
export function exigirProfessorDaDisciplina(u, turma, disciplinaId) {
  if (u.perfil !== 'professor' || !turma.disciplinasDoProfessor.includes(disciplinaId)) {
    throw proibido('Só o professor atribuído a esta disciplina pode lançar notas e faltas.');
  }
}

export async function listar(bd, u, { anoLectivo, classe, turno }) {
  const p = [u.escolaId];
  const filtros = ['t.escola_id = $1'];
  if (anoLectivo) { p.push(anoLectivo); filtros.push(`t.ano_lectivo_id = $${p.length}`); }
  else filtros.push('t.ano_lectivo_id = (SELECT id FROM anos_lectivos WHERE escola_id = $1 AND activo)');
  if (classe) { p.push(classe); filtros.push(`t.classe_id = $${p.length}`); }
  if (turno) { p.push(turno); filtros.push(`t.turno = $${p.length}`); }
  if (u.perfil === 'professor') {
    p.push(u.professorId);
    filtros.push(`(t.director_turma_id = $${p.length}
                   OR EXISTS (SELECT 1 FROM atribuicoes a WHERE a.turma_id = t.id AND a.professor_id = $${p.length}))`);
  }
  const { rows } = await bd.query(`${SQL_TURMA} WHERE ${filtros.join(' AND ')} ORDER BY cc.ordem, t.nome, t.turno`, p);
  return rows.map(formatar);
}

export async function obter(bd, u, id) {
  const t = await obterTurmaAcessivel(bd, u, id);
  const { rows } = await bd.query(`
    SELECT a.id, a.numero_processo, a.nome, m.id AS matricula
    FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
    WHERE m.turma_id = $1 AND m.estado = 'activa' ORDER BY a.nome`, [id]);
  return { ...formatar(t), alunos: camel(rows) };
}

async function validarTurma(bd, u, { classe, curso }) {
  const c = (await bd.query('SELECT * FROM classes WHERE id = $1 AND escola_id = $2', [classe, u.escolaId])).rows[0];
  if (!c) throw naoEncontrado('Classe');
  if (c.ramo === 'tecnico_profissional' && !curso) throw regra('Uma turma do técnico-profissional tem de ter curso.');
  if (curso) {
    const cu = (await bd.query('SELECT * FROM cursos WHERE id = $1 AND escola_id = $2', [curso, u.escolaId])).rows[0];
    if (!cu) throw naoEncontrado('Curso');
    if (cu.ramo !== c.ramo) throw regra('O curso não pertence ao ramo da classe.');
  }
}

export async function criar(bd, u, d) {
  await validarTurma(bd, u, d);
  return bd.transaccao(async (c) => {
    const t = await inserir(c, 'turmas', colunas({
      escolaId: u.escolaId, anoLectivoId: d.anoLectivo, classeId: d.classe, cursoId: d.curso ?? null, nome: d.nome,
      turno: d.turno, sala: d.sala, capacidade: d.capacidade, directorTurmaId: d.directorTurma,
    }));
    await registar(c, u, { entidade: 'turma', entidadeId: t.id, accao: 'criar', depois: t });
    return formatar((await c.query(`${SQL_TURMA} WHERE t.id = $1`, [t.id])).rows[0]);
  });
}

export async function actualizarTurma(bd, u, id, d) {
  return bd.transaccao(async (c) => {
    const antes = (await c.query(`${SQL_TURMA} WHERE t.id = $1 AND t.escola_id = $2 FOR UPDATE OF t`, [id, u.escolaId])).rows[0];
    if (!antes) throw naoEncontrado('Turma');
    if (d.capacidade !== undefined && d.capacidade < antes.total_alunos) {
      throw regra(`A turma já tem ${antes.total_alunos} alunos; a capacidade não pode ser menor.`);
    }
    const depois = await actualizar(c, 'turmas', { id, escolaId: u.escolaId }, colunas({
      nome: d.nome, turno: d.turno, sala: d.sala, capacidade: d.capacidade, directorTurmaId: d.directorTurma, estado: d.estado,
    }));
    await registar(c, u, { entidade: 'turma', entidadeId: id, accao: 'actualizar', antes, depois });
    return formatar((await c.query(`${SQL_TURMA} WHERE t.id = $1`, [id])).rows[0]);
  });
}

// ======================================================================
// Atribuições (RF20)
// ======================================================================

/** Disciplinas do plano curricular da turma (com a marca de disciplina-chave). */
export async function disciplinasDaTurma(bd, turma) {
  const { rows } = await bd.query(`
    SELECT d.id, d.sigla, d.nome, pd.chave
    FROM planos_curriculares p
    JOIN plano_disciplinas pd ON pd.plano_id = p.id
    JOIN disciplinas d ON d.id = pd.disciplina_id
    WHERE p.classe_id = $1 AND p.curso_id IS NOT DISTINCT FROM $2
    ORDER BY pd.chave DESC, d.nome`, [turma.classe_id, turma.curso_id]);
  return rows;
}

export async function listarAtribuicoes(bd, u, turmaId) {
  await obterTurmaAcessivel(bd, u, turmaId);
  const { rows } = await bd.query(`
    SELECT a.disciplina_id AS disciplina, d.sigla, a.professor_id AS professor, us.nome AS professor_nome
    FROM atribuicoes a JOIN disciplinas d ON d.id = a.disciplina_id
    JOIN professores p ON p.id = a.professor_id JOIN utilizadores us ON us.id = p.utilizador_id
    WHERE a.turma_id = $1 ORDER BY d.nome`, [turmaId]);
  return camel(rows);
}

export async function definirAtribuicoes(bd, u, turmaId, lista) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  if (u.perfil === 'coordenador') {
    const { rows } = await bd.query('SELECT 1 FROM cursos WHERE id = $1 AND coordenador_id = $2', [turma.curso_id, u.id]);
    if (!rows[0]) throw proibido('Só pode atribuir professores nas turmas dos cursos que coordena.');
  }
  const doPlano = new Set((await disciplinasDaTurma(bd, turma)).map((d) => d.id));
  for (const a of lista) if (!doPlano.has(a.disciplina)) throw regra('Há disciplinas que não fazem parte do plano curricular da turma.');
  if (new Set(lista.map((a) => a.disciplina)).size !== lista.length) throw regra('Só pode haver um professor por disciplina.');

  await bd.transaccao(async (c) => {
    const antes = (await c.query('SELECT disciplina_id, professor_id FROM atribuicoes WHERE turma_id = $1', [turmaId])).rows;
    await c.query('DELETE FROM atribuicoes WHERE turma_id = $1', [turmaId]);
    for (const a of lista) {
      await inserir(c, 'atribuicoes', { escola_id: u.escolaId, turma_id: turmaId, disciplina_id: a.disciplina, professor_id: a.professor });
    }
    await sincronizarAtribuicoes(c, turmaId); // as aulas do horário seguem o novo professor
    await registar(c, u, { entidade: 'turma', entidadeId: turmaId, accao: 'definir_atribuicoes', antes: { antes }, depois: { lista } });
  });
  return listarAtribuicoes(bd, u, turmaId);
}
