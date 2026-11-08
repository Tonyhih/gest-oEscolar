import { camel } from '../util/sql.js';
import { naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { SQL_DESIGNACAO_TURMA } from './pessoas.js';

// Estágio e Trabalho de Fim de Curso da 13.ª classe (RF40–RF43)

const SQL_ESTAGIO = `
  SELECT e.id, e.matricula_id AS matricula, m.turma_id AS turma, ${SQL_DESIGNACAO_TURMA} AS turma_designacao,
         json_build_object('id', a.id, 'numeroProcesso', a.numero_processo, 'nome', a.nome) AS aluno,
         e.entidade, e.orientador_entidade, e.orientador_escola_id AS orientador_escola, ue.nome AS orientador_escola_nome,
         e.inicio, e.fim, e.estado, e.nota, e.curso_concluido,
         json_build_object('tema', e.tfc_tema, 'orientador', e.tfc_orientador_id, 'orientadorNome', ut.nome,
                           'dataDefesa', e.tfc_data_defesa, 'juri', e.tfc_juri, 'nota', e.tfc_nota) AS tfc
  FROM estagios e
  JOIN matriculas m ON m.id = e.matricula_id
  JOIN alunos a ON a.id = m.aluno_id
  JOIN turmas t ON t.id = m.turma_id
  JOIN classes c ON c.id = t.classe_id
  JOIN classes_catalogo cc ON cc.codigo = c.codigo
  LEFT JOIN professores pe ON pe.id = e.orientador_escola_id LEFT JOIN utilizadores ue ON ue.id = pe.utilizador_id
  LEFT JOIN professores pt ON pt.id = e.tfc_orientador_id LEFT JOIN utilizadores ut ON ut.id = pt.utilizador_id`;

/** As datas da vista json_build_object vêm como texto; as colunas date vêm já como 'aaaa-mm-dd'. */
const obter = async (bd, id) => camel((await bd.query(`${SQL_ESTAGIO} WHERE e.id = $1`, [id])).rows[0]);

/** O coordenador só gere os estágios dos cursos que coordena. */
async function exigirCoordenacao(bd, u, turmaId) {
  if (u.perfil !== 'coordenador') return;
  const { rows } = await bd.query(
    'SELECT 1 FROM turmas t JOIN cursos cu ON cu.id = t.curso_id WHERE t.id = $1 AND cu.coordenador_id = $2', [turmaId, u.id]);
  if (!rows[0]) throw proibido('Só pode gerir os estágios dos cursos que coordena.');
}

export async function listar(bd, u, { anoLectivo }) {
  const p = [u.escolaId];
  let filtro = 'e.escola_id = $1';
  if (anoLectivo) { p.push(anoLectivo); filtro += ' AND m.ano_lectivo_id = $2'; }
  else filtro += ' AND m.ano_lectivo_id = (SELECT id FROM anos_lectivos WHERE escola_id = $1 AND activo)';
  if (u.perfil === 'coordenador') {
    p.push(u.id);
    filtro += ` AND t.curso_id IN (SELECT id FROM cursos WHERE coordenador_id = $${p.length})`;
  }
  return camel((await bd.query(`${SQL_ESTAGIO} WHERE ${filtro} ORDER BY a.nome`, p)).rows);
}

/** RF40: só alunos com matrícula activa numa turma da 13.ª classe (apenas estágio). */
export async function criar(bd, u, d) {
  const m = (await bd.query(`
    SELECT m.id, m.turma_id, m.estado, c.apenas_estagio FROM matriculas m
    JOIN turmas t ON t.id = m.turma_id JOIN classes c ON c.id = t.classe_id
    WHERE m.id = $1 AND m.escola_id = $2`, [d.matricula, u.escolaId])).rows[0];
  if (!m) throw naoEncontrado('Matrícula');
  if (!m.apenas_estagio) throw regra('O estágio só existe na 13.ª classe do ensino técnico-profissional.');
  if (m.estado !== 'activa') throw regra('A matrícula não está activa.');
  await exigirCoordenacao(bd, u, m.turma_id);
  if (d.fim && d.fim < d.inicio) throw regra('O estágio não pode terminar antes de começar.');
  const id = await bd.transaccao(async (c) => {
    const { rows } = await c.query(`
      INSERT INTO estagios (escola_id, matricula_id, entidade, orientador_entidade, orientador_escola_id, inicio, fim)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [u.escolaId, d.matricula, d.entidade, d.orientadorEntidade ?? null, d.orientadorEscola ?? null, d.inicio, d.fim ?? null]);
    await registar(c, u, { entidade: 'estagio', entidadeId: rows[0].id, accao: 'criar', depois: d });
    return rows[0].id;
  });
  return obter(bd, id);
}

async function carregar(bd, u, id) {
  const e = (await bd.query(
    'SELECT e.*, m.turma_id FROM estagios e JOIN matriculas m ON m.id = e.matricula_id WHERE e.id = $1 AND e.escola_id = $2',
    [id, u.escolaId])).rows[0];
  if (!e) throw naoEncontrado('Estágio');
  await exigirCoordenacao(bd, u, e.turma_id);
  return e;
}

/** RF40, RF41: dados do estágio e a nota (0–20, aprovação ≥ 10). A nota só a coordenação ou a direcção lançam. */
export async function actualizar(bd, u, id, d) {
  const e = await carregar(bd, u, id);
  if (d.nota !== undefined && u.perfil === 'secretaria') throw proibido('A nota do estágio é lançada pela coordenação.');
  const inicio = d.inicio ?? e.inicio;
  const fim = d.fim === undefined ? e.fim : d.fim;
  if (fim && fim < inicio) throw regra('O estágio não pode terminar antes de começar.');
  await bd.transaccao(async (c) => {
    await c.query(`
      UPDATE estagios SET entidade = coalesce($2, entidade), orientador_entidade = coalesce($3, orientador_entidade),
             orientador_escola_id = coalesce($4, orientador_escola_id), inicio = $5, fim = $6,
             estado = coalesce($7, estado), nota = CASE WHEN $8::boolean THEN $9 ELSE nota END
      WHERE id = $1`,
      [id, d.entidade ?? null, d.orientadorEntidade ?? null, d.orientadorEscola ?? null, inicio, fim,
       d.estado ?? null, d.nota !== undefined, d.nota ?? null]);
    await registar(c, u, { entidade: 'estagio', entidadeId: id, accao: d.nota !== undefined ? 'lancar_nota_estagio' : 'actualizar',
                           antes: { nota: e.nota, estado: e.estado }, depois: d });
  });
  return obter(bd, id);
}

/** RF42, RF43: TFC. A nota da defesa exige a data da defesa. */
export async function definirTfc(bd, u, id, d) {
  if (u.perfil === 'secretaria') throw proibido('O TFC é gerido pela coordenação.');
  const e = await carregar(bd, u, id);
  const dataDefesa = d.dataDefesa ?? e.tfc_data_defesa;
  if (d.nota !== undefined && d.nota !== null && !dataDefesa) throw regra('Indique a data da defesa antes de lançar a nota do TFC.');
  await bd.transaccao(async (c) => {
    await c.query(`
      UPDATE estagios SET tfc_tema = coalesce($2, tfc_tema), tfc_orientador_id = coalesce($3, tfc_orientador_id),
             tfc_data_defesa = $4, tfc_juri = coalesce($5, tfc_juri),
             tfc_nota = CASE WHEN $6::boolean THEN $7 ELSE tfc_nota END
      WHERE id = $1`,
      [id, d.tema ?? null, d.orientador ?? null, dataDefesa ?? null, d.juri ?? null, d.nota !== undefined, d.nota ?? null]);
    await registar(c, u, { entidade: 'estagio', entidadeId: id, accao: 'tfc', antes: { nota: e.tfc_nota }, depois: d });
  });
  return obter(bd, id);
}
