import { camel, inserir } from '../util/sql.js';
import { conflito, naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { inserirAluno, inserirEncarregadoPrincipal, SQL_DESIGNACAO_TURMA } from './pessoas.js';

const SQL_MATRICULA = `
  SELECT m.id, m.turma_id AS turma, ${SQL_DESIGNACAO_TURMA} AS turma_designacao, t.turno,
         m.ano_lectivo_id AS ano_lectivo, m.tipo, m.estado, m.matricula_anterior_id, m.criado_em,
         json_build_object('id', a.id, 'numeroProcesso', a.numero_processo, 'nome', a.nome) AS aluno,
         coalesce((SELECT json_agg(json_build_object('data', h.criado_em, 'accao', h.accao, 'motivo', h.motivo)
                                   ORDER BY h.criado_em)
                   FROM matricula_historico h WHERE h.matricula_id = m.id), '[]') AS historico
  FROM matriculas m
  JOIN alunos a ON a.id = m.aluno_id
  JOIN turmas t ON t.id = m.turma_id
  JOIN classes c ON c.id = t.classe_id
  JOIN classes_catalogo cc ON cc.codigo = c.codigo`;

const obter = async (bd, id) => camel((await bd.query(`${SQL_MATRICULA} WHERE m.id = $1`, [id])).rows[0]);

export async function listar(bd, u, { anoLectivo, turma }) {
  if (u.perfil === 'professor' && (!turma || !u.turmasDirigidas.includes(turma))) {
    throw proibido('Só pode consultar as matrículas das turmas que dirige.');
  }
  const p = [u.escolaId];
  const filtros = ['m.escola_id = $1'];
  if (anoLectivo) { p.push(anoLectivo); filtros.push(`m.ano_lectivo_id = $${p.length}`); }
  else if (!turma) filtros.push('m.ano_lectivo_id = (SELECT id FROM anos_lectivos WHERE escola_id = $1 AND activo)');
  if (turma) { p.push(turma); filtros.push(`m.turma_id = $${p.length}`); }
  return camel((await bd.query(`${SQL_MATRICULA} WHERE ${filtros.join(' AND ')} ORDER BY a.nome LIMIT 500`, p)).rows);
}

/**
 * Bloqueia a turma (SELECT … FOR UPDATE) para que dois pedidos em simultâneo não ultrapassem
 * a capacidade (RN07). Tem de ser chamado dentro de uma transacção.
 */
async function reservarLugar(c, u, turmaId, lugares = 1) {
  const t = (await c.query(
    `SELECT t.*, cc.ordem FROM turmas t JOIN classes cl ON cl.id = t.classe_id JOIN classes_catalogo cc ON cc.codigo = cl.codigo
     WHERE t.id = $1 AND t.escola_id = $2 FOR UPDATE OF t`, [turmaId, u.escolaId])).rows[0];
  if (!t) throw naoEncontrado('Turma');
  if (t.estado !== 'activo') throw regra('A turma está inactiva.');
  const { rows } = await c.query(`SELECT count(*)::int AS n FROM matriculas WHERE turma_id = $1 AND estado = 'activa'`, [turmaId]);
  if (rows[0].n + lugares > t.capacidade) {
    const vagas = Math.max(t.capacidade - rows[0].n, 0);
    throw conflito(lugares === 1
      ? `A turma está cheia (${t.capacidade} alunos).`
      : `A turma só tem ${vagas} ${vagas === 1 ? 'vaga' : 'vagas'} e a lista tem ${lugares} alunos.`);
  }
  return t;
}

const historico = (c, u, matriculaId, accao, extra = {}) =>
  inserir(c, 'matricula_historico', { escola_id: u.escolaId, matricula_id: matriculaId, accao, utilizador_id: u.id, ...extra });

/** Traduz a violação do índice "uma matrícula activa por ano" numa mensagem clara (RN06). */
function matriculaDuplicada(erro) {
  if (erro.code === '23505' && String(erro.message).includes('matriculas_uma_activa')) {
    return conflito('O aluno já tem uma matrícula activa neste ano lectivo.');
  }
  return erro;
}

/** RF21 */
export async function matricular(bd, u, { aluno, turma }) {
  try {
    const id = await bd.transaccao(async (c) => {
      const t = await reservarLugar(c, u, turma);
      const a = (await c.query('SELECT estado FROM alunos WHERE id = $1 AND escola_id = $2', [aluno, u.escolaId])).rows[0];
      if (!a) throw naoEncontrado('Aluno');
      if (a.estado !== 'activo') throw regra('O aluno está inactivo.');
      const m = await inserir(c, 'matriculas', {
        escola_id: u.escolaId, aluno_id: aluno, turma_id: turma, ano_lectivo_id: t.ano_lectivo_id, tipo: 'matricula' });
      await historico(c, u, m.id, 'criar');
      await registar(c, u, { entidade: 'matricula', entidadeId: m.id, accao: 'criar', depois: m });
      return m.id;
    });
    return obter(bd, id);
  } catch (erro) {
    throw matriculaDuplicada(erro);
  }
}

/** RF22: confirmação no novo ano lectivo. A matrícula anterior fica concluída. */
export async function confirmar(bd, u, { matriculaAnterior, turma }) {
  try {
    const id = await bd.transaccao(async (c) => {
      const ant = (await c.query(
        `SELECT m.*, cc.ordem FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN classes cl ON cl.id = t.classe_id
         JOIN classes_catalogo cc ON cc.codigo = cl.codigo WHERE m.id = $1 AND m.escola_id = $2 FOR UPDATE OF m`,
        [matriculaAnterior, u.escolaId])).rows[0];
      if (!ant) throw naoEncontrado('Matrícula');
      if (!['activa', 'concluida'].includes(ant.estado)) throw regra('Só se confirma a partir de uma matrícula activa ou concluída.');
      const t = await reservarLugar(c, u, turma);
      if (t.ano_lectivo_id === ant.ano_lectivo_id) throw regra('A confirmação é para outro ano lectivo.');
      if (t.ordem < ant.ordem) throw regra('A nova classe não pode ser inferior à anterior.');

      if (ant.estado === 'activa') {
        await c.query(`UPDATE matriculas SET estado = 'concluida' WHERE id = $1`, [ant.id]);
        await historico(c, u, ant.id, 'concluir');
      }
      const m = await inserir(c, 'matriculas', {
        escola_id: u.escolaId, aluno_id: ant.aluno_id, turma_id: turma, ano_lectivo_id: t.ano_lectivo_id,
        tipo: 'confirmacao', matricula_anterior_id: ant.id });
      await historico(c, u, m.id, 'confirmar');
      await registar(c, u, { entidade: 'matricula', entidadeId: m.id, accao: 'confirmar', depois: m });
      return m.id;
    });
    return obter(bd, id);
  } catch (erro) {
    throw matriculaDuplicada(erro);
  }
}

async function matriculaActiva(c, u, id) {
  const m = (await c.query('SELECT * FROM matriculas WHERE id = $1 AND escola_id = $2 FOR UPDATE', [id, u.escolaId])).rows[0];
  if (!m) throw naoEncontrado('Matrícula');
  if (m.estado !== 'activa') throw regra('A matrícula não está activa.');
  return m;
}

/** RF23: mudar de turma, no mesmo ano lectivo. As notas e faltas seguem a matrícula. */
export async function mudarTurma(bd, u, id, { turma, motivo }) {
  await bd.transaccao(async (c) => {
    const m = await matriculaActiva(c, u, id);
    if (m.turma_id === turma) throw regra('O aluno já está nesta turma.');
    const t = await reservarLugar(c, u, turma);
    if (t.ano_lectivo_id !== m.ano_lectivo_id) throw regra('A nova turma tem de ser do mesmo ano lectivo.');
    await c.query('UPDATE matriculas SET turma_id = $2 WHERE id = $1', [id, turma]);
    await historico(c, u, id, 'mudar_turma', { turma_anterior: m.turma_id, motivo });
    await registar(c, u, { entidade: 'matricula', entidadeId: id, accao: 'mudar_turma',
                           antes: { turma: m.turma_id }, depois: { turma }, justificacao: motivo });
  });
  return obter(bd, id);
}

/** RF23: anular (o registo não é apagado). */
export async function anular(bd, u, id, { motivo }) {
  await bd.transaccao(async (c) => {
    await matriculaActiva(c, u, id);
    await c.query(`UPDATE matriculas SET estado = 'anulada' WHERE id = $1`, [id]);
    await historico(c, u, id, 'anular', { motivo });
    await registar(c, u, { entidade: 'matricula', entidadeId: id, accao: 'anular', justificacao: motivo });
  });
  return obter(bd, id);
}

/** Cria o aluno (e o encarregado, se indicado) e matricula-o, tudo na mesma transacção. */
async function criarEMatricular(c, u, t, { aluno, encarregado }) {
  const a = await inserirAluno(c, u, aluno);
  if (encarregado) await inserirEncarregadoPrincipal(c, u, a.id, encarregado);
  const m = await inserir(c, 'matriculas', {
    escola_id: u.escolaId, aluno_id: a.id, turma_id: t.id, ano_lectivo_id: t.ano_lectivo_id, tipo: 'matricula' });
  await historico(c, u, m.id, 'criar');
  await registar(c, u, { entidade: 'matricula', entidadeId: m.id, accao: 'criar', depois: m });
  return m.id;
}

/**
 * Ficha de matrícula de um aluno novo: aluno, encarregado e matrícula numa só operação.
 * Se alguma parte falhar (turma cheia, número de processo repetido…), nada fica gravado.
 */
export async function matricularNovo(bd, u, { aluno, encarregado, turma }) {
  const id = await bd.transaccao(async (c) => {
    const t = await reservarLugar(c, u, turma);
    return criarEMatricular(c, u, t, { aluno, encarregado });
  });
  return obter(bd, id);
}

/**
 * Importa uma lista de alunos novos para uma turma (até 100). Tudo ou nada:
 * se não houver vagas para todos, ou uma linha falhar, nenhum aluno é criado.
 */
export async function importar(bd, u, { turma, alunos }) {
  const ids = await bd.transaccao(async (c) => {
    const t = await reservarLugar(c, u, turma, alunos.length);
    const criadas = [];
    for (const l of alunos) {
      const encarregado = l.encarregadoNome && l.encarregadoTelefone
        ? { nome: l.encarregadoNome, telefone: l.encarregadoTelefone, parentesco: l.parentesco }
        : undefined;
      criadas.push(await criarEMatricular(c, u, t, {
        aluno: { nome: l.nome, dataNascimento: l.dataNascimento, sexo: l.sexo }, encarregado }));
    }
    return criadas;
  });
  const { rows } = await bd.query(`${SQL_MATRICULA} WHERE m.id = ANY($1::uuid[]) ORDER BY a.nome`, [ids]);
  return { importados: rows.length, matriculas: camel(rows) };
}
