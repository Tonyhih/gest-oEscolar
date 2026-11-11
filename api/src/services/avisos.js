// Avisos no portal do encarregado e do aluno: notas publicadas, faltas, faltas vermelhas, propinas e recibos.
// Os avisos são criados dentro da transacção da acção que os origina; a chave evita repetições.
import { camel } from '../util/sql.js';
import { dataCurta, kwanzas } from '../util/extenso.js';
import { alunosPermitidos } from './portal.js';

const hoje = () => new Date().toISOString().slice(0, 10);

async function criar(c, { escolaId, alunoId, tipo, titulo, mensagem, chave }) {
  await c.query(`INSERT INTO avisos (escola_id, aluno_id, tipo, titulo, mensagem, chave) VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (aluno_id, chave) DO NOTHING`, [escolaId, alunoId, tipo, titulo, mensagem, chave]);
}

/** Um aviso para cada aluno activo da turma quando um trimestre é publicado. */
export async function notasPublicadas(c, escolaId, turmaId, trimestre) {
  const alunos = (await c.query(`SELECT aluno_id FROM matriculas WHERE turma_id = $1 AND estado = 'activa'`, [turmaId])).rows;
  for (const a of alunos) {
    await criar(c, {
      escolaId, alunoId: a.aluno_id, tipo: 'notas_publicadas', titulo: `Notas do ${trimestre}.º trimestre publicadas`,
      mensagem: `As notas do ${trimestre}.º trimestre já podem ser consultadas no portal.`, chave: `notas:${turmaId}:${trimestre}`,
    });
  }
}

/** Depois de registar as faltas de uma aula: avisa quando o aluno chega ao limite de injustificadas na disciplina, no trimestre. */
export async function verificarFaltas(c, escolaId, disciplinaId, trimestre, matriculas) {
  if (!matriculas.length) return;
  const { rows } = await c.query(`
    SELECT m.aluno_id, a.nome, d.nome AS disciplina, m.id AS matricula, count(*)::int AS total, e.limite_aviso_faltas AS limite
    FROM faltas f JOIN matriculas m ON m.id = f.matricula_id JOIN alunos a ON a.id = m.aluno_id
    JOIN disciplinas d ON d.id = f.disciplina_id JOIN escolas e ON e.id = f.escola_id
    WHERE f.matricula_id = ANY($1::uuid[]) AND f.disciplina_id = $2 AND f.trimestre = $3 AND f.estado = 'injustificada'
    GROUP BY m.aluno_id, a.nome, d.nome, m.id, e.limite_aviso_faltas
    HAVING count(*) >= e.limite_aviso_faltas`, [matriculas, disciplinaId, trimestre]);
  for (const r of rows) {
    await criar(c, {
      escolaId, alunoId: r.aluno_id, tipo: 'faltas_injustificadas', titulo: `Faltas injustificadas a ${r.disciplina}`,
      mensagem: `${r.nome} já tem ${r.total} faltas injustificadas a ${r.disciplina} no ${trimestre}.º trimestre. `
        + 'Para justificar, fale com o(a) director(a) de turma.',
      chave: `faltas:${r.matricula}:${disciplinaId}:${trimestre}`,
    });
  }
}

/** Falta vermelha: aviso imediato com a ocorrência. */
export async function faltaDisciplinar(c, escolaId, falta) {
  await criar(c, {
    escolaId, alunoId: falta.alunoId, tipo: 'falta_disciplinar', titulo: `Falta vermelha (disciplinar) a ${falta.disciplina}`,
    mensagem: `${falta.aluno} teve falta disciplinar a ${falta.disciplina} em ${dataCurta(falta.data)}: ${falta.ocorrencia}`,
    chave: `disciplinar:${falta.id}`,
  });
}

/** Recibo emitido ou anulado. */
export async function recibo(c, escolaId, { alunoId, pagamentoId, numeroTexto, total, anulado, motivo }) {
  await criar(c, anulado
    ? { escolaId, alunoId, tipo: 'recibo', titulo: `Recibo n.º ${numeroTexto} anulado`,
        mensagem: `O recibo n.º ${numeroTexto} foi anulado pela escola: ${motivo}`, chave: `recibo-anulado:${pagamentoId}` }
    : { escolaId, alunoId, tipo: 'recibo', titulo: `Pagamento recebido: recibo n.º ${numeroTexto}`,
        mensagem: `A escola recebeu ${kwanzas(total)}. O recibo pode ser descarregado na secção de propinas.`, chave: `recibo:${pagamentoId}` });
}

/** As propinas em atraso não têm uma acção que as origine: o aviso cria-se quando o portal é aberto. */
async function propinasEmAtraso(bd, alunos) {
  const { rows } = await bd.query(`
    SELECT c.id, c.escola_id, c.aluno_id, c.descricao, c.valor, c.vencimento, a.nome FROM cobrancas c JOIN alunos a ON a.id = c.aluno_id
    WHERE c.aluno_id = ANY($1::uuid[]) AND c.estado = 'pendente' AND c.vencimento < $2
      AND NOT EXISTS (SELECT 1 FROM avisos v WHERE v.aluno_id = c.aluno_id AND v.chave = 'propina:' || c.id)`, [alunos, hoje()]);
  for (const r of rows) {
    await criar(bd, {
      escolaId: r.escola_id, alunoId: r.aluno_id, tipo: 'propina_atraso', titulo: `Em atraso: ${r.descricao}`,
      mensagem: `${r.descricao} de ${r.nome} (${kwanzas(r.valor)}) venceu a ${dataCurta(r.vencimento)} e ainda não está paga.`,
      chave: `propina:${r.id}`,
    });
  }
}

/** Avisos dos alunos a que a conta tem acesso, do mais recente para o mais antigo. */
export async function listar(bd, u) {
  const alunos = (await alunosPermitidos(bd, u)).map((a) => a.id);
  if (!alunos.length) return { naoLidos: 0, avisos: [] };
  await propinasEmAtraso(bd, alunos);
  const { rows } = await bd.query(`
    SELECT v.id, v.tipo, v.titulo, v.mensagem, v.criado_em, a.id AS aluno_id, a.nome AS aluno, (l.aviso_id IS NOT NULL) AS lido
    FROM avisos v JOIN alunos a ON a.id = v.aluno_id
    LEFT JOIN avisos_lidos l ON l.aviso_id = v.id AND l.utilizador_id = $2
    WHERE v.aluno_id = ANY($1::uuid[]) ORDER BY v.criado_em DESC LIMIT 100`, [alunos, u.id]);
  const avisos = camel(rows);
  return { naoLidos: avisos.filter((a) => !a.lido).length, avisos };
}

/** Marca como lidos os avisos indicados (ou todos). */
export async function marcarLidos(bd, u, { avisos }) {
  const alunos = (await alunosPermitidos(bd, u)).map((a) => a.id);
  await bd.query(`
    INSERT INTO avisos_lidos (aviso_id, utilizador_id)
    SELECT v.id, $2 FROM avisos v WHERE v.aluno_id = ANY($1::uuid[]) AND ($3::uuid[] IS NULL OR v.id = ANY($3::uuid[]))
    ON CONFLICT DO NOTHING`, [alunos, u.id, avisos ?? null]);
  return listar(bd, u);
}
