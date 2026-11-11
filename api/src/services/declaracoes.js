import { regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { obterAluno } from './pessoas.js';
import { resumoMatricula } from './portal.js';
import { dadosEscola, obterDocumento } from './documentos.js';

// Declarações numeradas (RF55, RF56): de frequência e com as notas publicadas.

const TIPOS = { frequencia: 'declaracao_frequencia', notas: 'declaracao_notas' };
const hoje = () => new Date().toISOString().slice(0, 10);

/** Matrícula do aluno no ano pedido (ou a activa do ano lectivo activo). */
async function matriculaDoAno(bd, alunoId, anoLectivo) {
  const { rows } = await bd.query(`
    SELECT m.id, m.turma_id, m.estado, al.designacao AS ano, al.activo
    FROM matriculas m JOIN anos_lectivos al ON al.id = m.ano_lectivo_id
    WHERE m.aluno_id = $1 AND m.estado <> 'anulada' AND ($2::uuid IS NULL OR al.id = $2)
    ORDER BY al.activo DESC, al.designacao DESC LIMIT 1`, [alunoId, anoLectivo ?? null]);
  return rows[0];
}

export async function emitir(bd, u, alunoId, { tipo, finalidade, anoLectivo }) {
  const aluno = await obterAluno(bd, u, alunoId);
  const m = await matriculaDoAno(bd, alunoId, tipo === 'frequencia' ? null : anoLectivo);

  let academico;
  if (tipo === 'frequencia') {
    if (!m || m.estado !== 'activa' || !m.activo) throw regra('O aluno não tem matrícula activa no ano lectivo activo.');
    academico = await resumoMatricula(bd, u, aluno, m);
  } else {
    if (!m) throw regra('O aluno não tem matrícula nesse ano lectivo.');
    academico = await resumoMatricula(bd, u, aluno, m);
    if (academico.tipo !== 'notas') throw regra('Nesta classe não há notas numéricas; emita uma declaração de frequência.');
    if (!academico.trimestresPublicados.length) throw regra('Ainda não há notas publicadas nesse ano lectivo.');
  }

  const escola = await dadosEscola(bd, u.escolaId);
  const dataEmissao = hoje();
  const ano = Number(dataEmissao.slice(0, 4));
  const id = await bd.transaccao(async (c) => {
    await c.query('SELECT id FROM escolas WHERE id = $1 FOR UPDATE', [u.escolaId]); // numeração sem repetições
    const numero = (await c.query(`SELECT coalesce(max(numero), 0) + 1 AS n FROM documentos
                                   WHERE escola_id = $1 AND tipo = $2 AND ano = $3`, [u.escolaId, TIPOS[tipo], ano])).rows[0].n;
    const dados = {
      tipo, escola, aluno, finalidade: finalidade ?? null, dataEmissao, numeroTexto: `${numero}/${ano}`,
      matricula: { ...academico.matricula, curso: null },
      trimestresPublicados: academico.trimestresPublicados ?? [],
      disciplinas: academico.disciplinas ?? [], situacao: academico.situacao ?? null, classeDeExame: academico.classeDeExame ?? false,
    };
    const { rows } = await c.query(`
      INSERT INTO documentos (escola_id, tipo, numero, ano, aluno_id, rascunho, dados, emitido_por)
      VALUES ($1, $2, $3, $4, $5, false, $6, $7) RETURNING id`,
    [u.escolaId, TIPOS[tipo], numero, ano, alunoId, JSON.stringify(dados), u.id]);
    await registar(c, u, { entidade: 'aluno', entidadeId: alunoId, accao: `emitir_${TIPOS[tipo]}`,
                           depois: { documento: rows[0].id, numero: dados.numeroTexto, finalidade: dados.finalidade } });
    return rows[0].id;
  });
  return obterDocumento(bd, u, id);
}
