import { actualizar, camel, colunas, inserir } from '../util/sql.js';
import { naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';

// ======================================================================
// Anos lectivos e trimestres (RF10)
// ======================================================================

const SQL_ANO = `
  SELECT a.id, a.designacao, a.activo,
         coalesce((SELECT json_agg(json_build_object('numero', t.numero, 'inicio', t.inicio, 'fim', t.fim, 'aberto', t.aberto)
                                    ORDER BY t.numero)
                   FROM trimestres t WHERE t.ano_lectivo_id = a.id), '[]') AS trimestres
  FROM anos_lectivos a`;

export async function listarAnos(bd, u) {
  return camel((await bd.query(`${SQL_ANO} WHERE a.escola_id = $1 ORDER BY a.designacao DESC`, [u.escolaId])).rows);
}

async function obterAno(bd, u, id) {
  const ano = (await bd.query(`${SQL_ANO} WHERE a.id = $1 AND a.escola_id = $2`, [id, u.escolaId])).rows[0];
  if (!ano) throw naoEncontrado('Ano lectivo');
  return camel(ano);
}

/** Os trimestres são 1, 2 e 3, por ordem e sem sobreposição. */
function validarTrimestres(trimestres) {
  const ordenados = [...trimestres].sort((a, b) => a.numero - b.numero);
  if (ordenados.map((t) => t.numero).join() !== '1,2,3') throw regra('Indique os trimestres 1, 2 e 3.');
  for (const t of ordenados) if (t.fim <= t.inicio) throw regra(`O ${t.numero}.º trimestre termina antes de começar.`);
  for (let i = 1; i < 3; i += 1) {
    if (ordenados[i].inicio <= ordenados[i - 1].fim) throw regra('Os trimestres não se podem sobrepor.');
  }
  return ordenados;
}

export async function criarAno(bd, u, { designacao, trimestres }) {
  const ts = validarTrimestres(trimestres);
  const id = await bd.transaccao(async (c) => {
    const ano = await inserir(c, 'anos_lectivos', { escola_id: u.escolaId, designacao });
    for (const t of ts) {
      await inserir(c, 'trimestres', { escola_id: u.escolaId, ano_lectivo_id: ano.id, numero: t.numero,
                                       inicio: t.inicio, fim: t.fim, aberto: t.aberto });
    }
    await registar(c, u, { entidade: 'ano_lectivo', entidadeId: ano.id, accao: 'criar' });
    return ano.id;
  });
  return obterAno(bd, u, id);
}

export async function actualizarAno(bd, u, id, { designacao, trimestres }) {
  const ano = await obterAno(bd, u, id);
  const ts = trimestres ? validarTrimestres(trimestres) : null;
  await bd.transaccao(async (c) => {
    if (designacao) await c.query('UPDATE anos_lectivos SET designacao = $2 WHERE id = $1', [id, designacao]);
    for (const t of ts ?? []) {
      await c.query('UPDATE trimestres SET inicio = $3, fim = $4, aberto = $5 WHERE ano_lectivo_id = $1 AND numero = $2',
        [id, t.numero, t.inicio, t.fim, t.aberto]);
    }
    await registar(c, u, { entidade: 'ano_lectivo', entidadeId: id, accao: 'actualizar', antes: ano, depois: { designacao, trimestres: ts } });
  });
  return obterAno(bd, u, id);
}

/** Só um ano lectivo activo por escola (o índice único parcial garante-o também na BD). */
export async function activarAno(bd, u, id) {
  await obterAno(bd, u, id);
  await bd.transaccao(async (c) => {
    await c.query('UPDATE anos_lectivos SET activo = false WHERE escola_id = $1 AND activo AND id <> $2', [u.escolaId, id]);
    await c.query('UPDATE anos_lectivos SET activo = true WHERE id = $1', [id]);
    await registar(c, u, { entidade: 'ano_lectivo', entidadeId: id, accao: 'activar' });
  });
  return obterAno(bd, u, id);
}

/** Ano lectivo activo da escola (ou erro 422). */
export async function anoActivo(bd, escolaId) {
  const { rows } = await bd.query('SELECT * FROM anos_lectivos WHERE escola_id = $1 AND activo', [escolaId]);
  if (!rows[0]) throw regra('A escola não tem um ano lectivo activo.');
  return rows[0];
}

// ======================================================================
// Classes (RF11, RF14)
// ======================================================================

export async function catalogo(bd) {
  return camel((await bd.query('SELECT codigo, designacao, ciclo FROM classes_catalogo ORDER BY ordem')).rows);
}

const SQL_CLASSE = `
  SELECT c.*, cc.designacao || CASE WHEN c.ramo = 'tecnico_profissional' THEN ' – Técnico-Profissional' ELSE '' END AS designacao,
         cc.ciclo, cc.ordem
  FROM classes c JOIN classes_catalogo cc ON cc.codigo = c.codigo`;

export async function listarClasses(bd, u) {
  return camel((await bd.query(`${SQL_CLASSE} WHERE c.escola_id = $1 ORDER BY cc.ordem, c.ramo`, [u.escolaId])).rows);
}

/** Valores por omissão segundo as regras confirmadas (00-enquadramento.md). */
function configPorOmissao(codigo, ciclo) {
  const primario = ciclo === 'primario';
  return {
    escalaMaxima: primario ? 10 : 20,
    notaMinimaAprovacao: primario ? 5 : 10,
    minimoNegativa: primario ? 3.5 : 7,
    maxNegativas: 2,
    classeDeExame: ['6', '9', '12'].includes(codigo),
    avaliacaoQualitativa: codigo === 'INI',
    apenasEstagio: codigo === '13',
  };
}

export async function criarClasse(bd, u, { codigo, ramo = 'geral', ...config }) {
  const cat = (await bd.query('SELECT * FROM classes_catalogo WHERE codigo = $1', [codigo])).rows[0];
  if (!cat) throw regra('Classe inexistente no catálogo nacional.');
  if (codigo === '13' && ramo !== 'tecnico_profissional') throw regra('A 13.ª classe só existe no ensino técnico-profissional.');
  if (cat.ciclo !== 'ii_ciclo' && ramo !== 'geral') throw regra('O Primário e o I Ciclo só têm o ramo geral.');
  const dados = { ...configPorOmissao(codigo, cat.ciclo), ...config };
  return bd.transaccao(async (c) => {
    const classe = await inserir(c, 'classes', colunas({ escolaId: u.escolaId, codigo, ramo, ...dados }));
    await registar(c, u, { entidade: 'classe', entidadeId: classe.id, accao: 'criar', depois: classe });
    return camel((await c.query(`${SQL_CLASSE} WHERE c.id = $1`, [classe.id])).rows[0]);
  });
}

export async function actualizarClasse(bd, u, id, config) {
  return bd.transaccao(async (c) => {
    const antes = (await c.query('SELECT * FROM classes WHERE id = $1 AND escola_id = $2', [id, u.escolaId])).rows[0];
    if (!antes) throw naoEncontrado('Classe');
    const depois = await actualizar(c, 'classes', { id, escolaId: u.escolaId }, colunas(config));
    await registar(c, u, { entidade: 'classe', entidadeId: id, accao: 'actualizar_avaliacao', antes, depois });
    return camel((await c.query(`${SQL_CLASSE} WHERE c.id = $1`, [id])).rows[0]);
  });
}

// ======================================================================
// Cursos (RF12) e disciplinas (RF13)
// ======================================================================

export async function listarCursos(bd, u) {
  return camel((await bd.query('SELECT * FROM cursos WHERE escola_id = $1 ORDER BY nome', [u.escolaId])).rows);
}

async function validarCoordenador(bd, u, coordenadorId) {
  if (!coordenadorId) return;
  const { rows } = await bd.query(
    `SELECT 1 FROM utilizadores WHERE id = $1 AND escola_id = $2 AND perfil = 'coordenador'`, [coordenadorId, u.escolaId]);
  if (!rows[0]) throw regra('O coordenador indicado não é um coordenador desta escola.');
}

export async function criarCurso(bd, u, dados) {
  // Um coordenador que cria um curso fica como seu coordenador
  const coordenador = u.perfil === 'coordenador' ? u.id : dados.coordenador;
  await validarCoordenador(bd, u, coordenador);
  const curso = await inserir(bd, 'cursos', colunas({
    escolaId: u.escolaId, nome: dados.nome, sigla: dados.sigla, ramo: dados.ramo, coordenadorId: coordenador }));
  return camel(curso);
}

export async function actualizarCurso(bd, u, id, dados) {
  const curso = (await bd.query('SELECT * FROM cursos WHERE id = $1 AND escola_id = $2', [id, u.escolaId])).rows[0];
  if (!curso) throw naoEncontrado('Curso');
  if (u.perfil === 'coordenador' && curso.coordenador_id !== u.id) throw proibido('Só pode alterar os cursos que coordena.');
  if (u.perfil === 'coordenador' && dados.coordenador && dados.coordenador !== u.id) throw proibido('Só o director muda o coordenador.');
  await validarCoordenador(bd, u, dados.coordenador);
  const { coordenador, ...resto } = dados;
  return camel(await actualizar(bd, 'cursos', { id, escolaId: u.escolaId }, colunas({ ...resto, coordenadorId: coordenador })));
}

export async function listarDisciplinas(bd, u) {
  return camel((await bd.query('SELECT * FROM disciplinas WHERE escola_id = $1 ORDER BY nome', [u.escolaId])).rows);
}

export async function criarDisciplina(bd, u, dados) {
  return camel(await inserir(bd, 'disciplinas', colunas({ escolaId: u.escolaId, ...dados })));
}

export async function actualizarDisciplina(bd, u, id, dados) {
  const d = await actualizar(bd, 'disciplinas', { id, escolaId: u.escolaId }, colunas(dados));
  if (!d) throw naoEncontrado('Disciplina');
  return camel(d);
}

// ======================================================================
// Planos curriculares (RF13), com as disciplinas-chave
// ======================================================================

const SQL_PLANO = `
  SELECT p.id, p.classe_id AS classe, p.curso_id AS curso,
         coalesce((SELECT json_agg(json_build_object('disciplina', d.id, 'sigla', d.sigla, 'nome', d.nome,
                                                     'cargaHorariaSemanal', pd.carga_horaria_semanal, 'chave', pd.chave)
                                   ORDER BY d.nome)
                   FROM plano_disciplinas pd JOIN disciplinas d ON d.id = pd.disciplina_id
                   WHERE pd.plano_id = p.id), '[]') AS disciplinas
  FROM planos_curriculares p`;

export async function listarPlanos(bd, u, { classe, curso }) {
  const p = [u.escolaId, classe];
  let filtro = 'p.escola_id = $1 AND p.classe_id = $2';
  if (curso) { p.push(curso); filtro += ' AND p.curso_id = $3'; }
  return camel((await bd.query(`${SQL_PLANO} WHERE ${filtro}`, p)).rows);
}

async function verificarCoordenacao(bd, u, cursoId) {
  if (u.perfil !== 'coordenador') return;
  const { rows } = await bd.query('SELECT 1 FROM cursos WHERE id = $1 AND coordenador_id = $2', [cursoId ?? null, u.id]);
  if (!rows[0]) throw proibido('Só pode gerir os planos dos cursos que coordena.');
}

async function gravarDisciplinas(c, u, planoId, disciplinas) {
  const siglas = new Set(disciplinas.map((d) => d.disciplina));
  if (siglas.size !== disciplinas.length) throw regra('Uma disciplina não se pode repetir no mesmo plano.');
  await c.query('DELETE FROM plano_disciplinas WHERE plano_id = $1', [planoId]);
  for (const d of disciplinas) {
    await inserir(c, 'plano_disciplinas', colunas({
      escolaId: u.escolaId, planoId, disciplinaId: d.disciplina, cargaHorariaSemanal: d.cargaHorariaSemanal, chave: d.chave }));
  }
}

export async function criarPlano(bd, u, { classe, curso, disciplinas }) {
  await verificarCoordenacao(bd, u, curso);
  const id = await bd.transaccao(async (c) => {
    const plano = await inserir(c, 'planos_curriculares', colunas({ escolaId: u.escolaId, classeId: classe, cursoId: curso ?? null }));
    await gravarDisciplinas(c, u, plano.id, disciplinas);
    await registar(c, u, { entidade: 'plano_curricular', entidadeId: plano.id, accao: 'criar', depois: { disciplinas } });
    return plano.id;
  });
  return camel((await bd.query(`${SQL_PLANO} WHERE p.id = $1`, [id])).rows[0]);
}

export async function substituirPlano(bd, u, id, { disciplinas }) {
  const plano = (await bd.query(`${SQL_PLANO} WHERE p.id = $1 AND p.escola_id = $2`, [id, u.escolaId])).rows[0];
  if (!plano) throw naoEncontrado('Plano curricular');
  await verificarCoordenacao(bd, u, plano.curso);
  await bd.transaccao(async (c) => {
    await gravarDisciplinas(c, u, id, disciplinas);
    await registar(c, u, { entidade: 'plano_curricular', entidadeId: id, accao: 'substituir',
                           antes: { disciplinas: plano.disciplinas }, depois: { disciplinas } });
  });
  return camel((await bd.query(`${SQL_PLANO} WHERE p.id = $1`, [id])).rows[0]);
}
