import { actualizar, camel, colunas, inserir, paginar } from '../util/sql.js';
import { conflito, naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';

// Designação curta da turma, ex.: "7.ª A" ou "Iniciação A"
export const SQL_DESIGNACAO_TURMA = `
  (CASE WHEN cc.codigo = 'INI' THEN 'Iniciação' ELSE cc.codigo || '.ª' END) || ' ' || t.nome`;

// ======================================================================
// Alunos (RF15, RF17)
// ======================================================================

/** O professor (director de turma) só vê os alunos das turmas que dirige. */
function filtroProfessor(u, turma) {
  if (u.perfil !== 'professor') return;
  if (!turma || !u.turmasDirigidas.includes(turma)) throw proibido('Só pode consultar os alunos das turmas que dirige.');
}

/** Lei 22/11: um professor não precisa da morada nem do documento do aluno. */
function minimizar(u, aluno) {
  if (u.perfil !== 'professor') return aluno;
  const { documentoTipo, documentoNumero, morada, telefone, naturalidade, ...resto } = aluno;
  return resto;
}

export function listarAlunos(bd, u, { pesquisa, turma, pagina, limite }) {
  filtroProfessor(u, turma);
  const p = [u.escolaId];
  const filtros = ['a.escola_id = $1'];
  if (pesquisa) {
    p.push(`%${pesquisa.toLowerCase()}%`);
    filtros.push(`(lower(a.nome) LIKE $${p.length} OR lower(a.numero_processo) LIKE $${p.length})`);
  }
  if (turma) { p.push(turma); filtros.push(`m.turma_id = $${p.length}`); }
  return paginar(bd, `
    SELECT a.id, a.numero_processo, a.nome, a.estado, ${SQL_DESIGNACAO_TURMA} AS turma
    FROM alunos a
    LEFT JOIN matriculas m ON m.aluno_id = a.id AND m.estado = 'activa'
      AND m.ano_lectivo_id = (SELECT id FROM anos_lectivos WHERE escola_id = a.escola_id AND activo)
    LEFT JOIN turmas t ON t.id = m.turma_id
    LEFT JOIN classes c ON c.id = t.classe_id
    LEFT JOIN classes_catalogo cc ON cc.codigo = c.codigo
    WHERE ${filtros.join(' AND ')}
    ORDER BY a.nome`, p, { pagina, limite });
}

export async function obterAluno(bd, u, id) {
  const { rows } = await bd.query(`
    SELECT a.*,
           coalesce((SELECT json_agg(json_build_object(
                       'encarregado', json_build_object('id', e.id, 'nome', e.nome, 'telefone', e.telefone, 'email', e.email),
                       'parentesco', ae.parentesco, 'principal', ae.principal) ORDER BY ae.principal DESC, e.nome)
                     FROM aluno_encarregados ae JOIN encarregados e ON e.id = ae.encarregado_id
                     WHERE ae.aluno_id = a.id), '[]') AS encarregados,
           coalesce((SELECT array_agg(m.turma_id::text) FROM matriculas m WHERE m.aluno_id = a.id), '{}') AS turmas,
           coalesce((SELECT json_agg(json_build_object(
                       'id', m.id, 'turma', m.turma_id, 'turmaDesignacao', ${SQL_DESIGNACAO_TURMA},
                       'anoLectivo', al.id, 'anoLectivoDesignacao', al.designacao, 'tipo', m.tipo, 'estado', m.estado)
                       ORDER BY al.designacao DESC, m.criado_em DESC)
                     FROM matriculas m
                     JOIN turmas t ON t.id = m.turma_id
                     JOIN classes c ON c.id = t.classe_id
                     JOIN classes_catalogo cc ON cc.codigo = c.codigo
                     JOIN anos_lectivos al ON al.id = m.ano_lectivo_id
                     WHERE m.aluno_id = a.id), '[]') AS matriculas
    FROM alunos a WHERE a.id = $1 AND a.escola_id = $2`, [id, u.escolaId]);
  const aluno = rows[0];
  if (!aluno) throw naoEncontrado('Aluno');
  if (u.perfil === 'professor' && !aluno.turmas.some((t) => u.turmasDirigidas.includes(t))) {
    throw proibido('Só pode consultar os alunos das turmas que dirige.');
  }
  const { turmas, ...resto } = camel(aluno);
  return minimizar(u, resto);
}

const dadosAluno = ({ documento, ...d }) => ({
  ...d,
  documentoTipo: documento === undefined ? undefined : documento?.tipo ?? null,
  documentoNumero: documento === undefined ? undefined : documento?.numero ?? null,
});

/**
 * Insere um aluno dentro de uma transacção já aberta (usado também pelas matrículas).
 * Sem número de processo, gera o seguinte da escola: CODIGO-0001, CODIGO-0002…
 */
export async function inserirAluno(c, u, dados) {
  let { numeroProcesso } = dados;
  if (!numeroProcesso) {
    const { rows } = await c.query(
      `SELECT e.codigo, (SELECT count(*)::int FROM alunos WHERE escola_id = e.id) AS n FROM escolas e WHERE e.id = $1`,
      [u.escolaId]);
    numeroProcesso = `${rows[0].codigo}-${String(rows[0].n + 1).padStart(4, '0')}`;
  }
  const aluno = await inserir(c, 'alunos', colunas({ ...dadosAluno(dados), numeroProcesso, escolaId: u.escolaId }));
  await registar(c, u, { entidade: 'aluno', entidadeId: aluno.id, accao: 'criar' });
  return aluno;
}

/** Insere um encarregado e liga-o ao aluno como principal (dentro de uma transacção). */
export async function inserirEncarregadoPrincipal(c, u, alunoId, { nome, telefone, parentesco = 'Encarregado(a)' }) {
  const ee = await inserir(c, 'encarregados', { escola_id: u.escolaId, nome, telefone });
  await inserir(c, 'aluno_encarregados', {
    escola_id: u.escolaId, aluno_id: alunoId, encarregado_id: ee.id, parentesco, principal: true });
  return ee;
}

export async function criarAluno(bd, u, dados) {
  return bd.transaccao(async (c) => {
    const aluno = await inserirAluno(c, u, dados);
    return obterAluno(c, u, aluno.id);
  });
}

export async function actualizarAluno(bd, u, id, dados) {
  return bd.transaccao(async (c) => {
    const antes = (await c.query('SELECT * FROM alunos WHERE id = $1 AND escola_id = $2', [id, u.escolaId])).rows[0];
    if (!antes) throw naoEncontrado('Aluno');
    const depois = await actualizar(c, 'alunos', { id, escolaId: u.escolaId }, colunas(dadosAluno(dados)));
    await registar(c, u, { entidade: 'aluno', entidadeId: id, accao: 'actualizar', antes, depois });
    return obterAluno(c, u, id);
  });
}

/** RF16: substitui a lista de encarregados do aluno. */
export async function definirEncarregados(bd, u, id, lista) {
  if (lista.filter((e) => e.principal).length > 1) throw regra('Só pode haver um encarregado principal.');
  if (new Set(lista.map((e) => e.encarregado)).size !== lista.length) throw regra('Encarregado repetido.');
  return bd.transaccao(async (c) => {
    const aluno = (await c.query('SELECT id FROM alunos WHERE id = $1 AND escola_id = $2', [id, u.escolaId])).rows[0];
    if (!aluno) throw naoEncontrado('Aluno');
    await c.query('DELETE FROM aluno_encarregados WHERE aluno_id = $1', [id]);
    for (const e of lista) {
      await inserir(c, 'aluno_encarregados', colunas({
        escolaId: u.escolaId, alunoId: id, encarregadoId: e.encarregado, parentesco: e.parentesco, principal: e.principal }));
    }
    await registar(c, u, { entidade: 'aluno', entidadeId: id, accao: 'definir_encarregados', depois: { lista } });
    return obterAluno(c, u, id);
  });
}

// ======================================================================
// Encarregados (RF16)
// ======================================================================

export async function listarEncarregados(bd, u, { pesquisa }) {
  const p = [u.escolaId];
  let filtro = '';
  if (pesquisa) { p.push(`%${pesquisa.toLowerCase()}%`); filtro = 'AND (lower(nome) LIKE $2 OR telefone LIKE $2)'; }
  return camel((await bd.query(`SELECT * FROM encarregados WHERE escola_id = $1 ${filtro} ORDER BY nome LIMIT 50`, p)).rows);
}

export async function criarEncarregado(bd, u, dados) {
  return camel(await inserir(bd, 'encarregados', colunas({ ...dados, escolaId: u.escolaId })));
}

// ======================================================================
// Professores (RF18)
// ======================================================================

const SQL_PROFESSOR = `
  SELECT p.id, p.utilizador_id AS utilizador, u.nome, u.email, u.estado, p.numero_agente, p.habilitacoes,
         coalesce((SELECT array_agg(pd.disciplina_id::text) FROM professor_disciplinas pd WHERE pd.professor_id = p.id), '{}')
           AS disciplinas
  FROM professores p JOIN utilizadores u ON u.id = p.utilizador_id`;

export async function listarProfessores(bd, u) {
  return camel((await bd.query(`${SQL_PROFESSOR} WHERE p.escola_id = $1 ORDER BY u.nome`, [u.escolaId])).rows);
}

async function gravarDisciplinasProfessor(c, u, professorId, disciplinas) {
  if (!disciplinas) return;
  await c.query('DELETE FROM professor_disciplinas WHERE professor_id = $1', [professorId]);
  for (const d of new Set(disciplinas)) {
    await inserir(c, 'professor_disciplinas', { escola_id: u.escolaId, professor_id: professorId, disciplina_id: d });
  }
}

export async function criarProfessor(bd, u, { utilizador, disciplinas, ...dados }) {
  return bd.transaccao(async (c) => {
    const util = (await c.query('SELECT perfil FROM utilizadores WHERE id = $1 AND escola_id = $2', [utilizador, u.escolaId])).rows[0];
    if (!util) throw naoEncontrado('Utilizador');
    if (util.perfil !== 'professor') throw regra('O utilizador tem de ter o perfil de professor.');
    const existe = (await c.query('SELECT 1 FROM professores WHERE utilizador_id = $1', [utilizador])).rows[0];
    if (existe) throw conflito('Este utilizador já tem ficha de professor.');
    const p = await inserir(c, 'professores', colunas({ ...dados, utilizadorId: utilizador, escolaId: u.escolaId }));
    await gravarDisciplinasProfessor(c, u, p.id, disciplinas);
    return camel((await c.query(`${SQL_PROFESSOR} WHERE p.id = $1`, [p.id])).rows[0]);
  });
}

export async function actualizarProfessor(bd, u, id, { disciplinas, utilizador, ...dados }) {
  return bd.transaccao(async (c) => {
    const p = await actualizar(c, 'professores', { id, escolaId: u.escolaId }, colunas(dados));
    if (!p) throw naoEncontrado('Professor');
    await gravarDisciplinasProfessor(c, u, id, disciplinas);
    return camel((await c.query(`${SQL_PROFESSOR} WHERE p.id = $1`, [id])).rows[0]);
  });
}
