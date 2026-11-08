import { camel } from '../util/sql.js';
import { regra } from '../middleware/erros.js';
import { decidirTransicao } from './avaliacao.js';

const DESIGNACAO = `cc.designacao || CASE WHEN c.ramo = 'tecnico_profissional' THEN ' (técnico)' ELSE '' END`;

/**
 * RF38: indicadores do ano lectivo para o director. Só números agregados, sem nomes de alunos.
 * A transição usa as mesmas regras da pauta final (decidirTransicao).
 */
export async function obter(bd, u, { anoLectivo }) {
  const ano = anoLectivo
    ? (await bd.query('SELECT * FROM anos_lectivos WHERE id = $1 AND escola_id = $2', [anoLectivo, u.escolaId])).rows[0]
    : (await bd.query('SELECT * FROM anos_lectivos WHERE escola_id = $1 AND activo', [u.escolaId])).rows[0];
  if (!ano) throw regra('Não há ano lectivo activo.');

  const totais = (await bd.query(`
    SELECT (SELECT count(*)::int FROM matriculas WHERE ano_lectivo_id = $1 AND estado = 'activa') AS alunos,
           (SELECT count(*)::int FROM turmas WHERE ano_lectivo_id = $1 AND estado = 'activo') AS turmas,
           (SELECT count(*)::int FROM professores p JOIN utilizadores us ON us.id = p.utilizador_id
             WHERE p.escola_id = $2 AND us.estado = 'activo') AS professores,
           (SELECT count(*)::int FROM faltas f JOIN matriculas m ON m.id = f.matricula_id
             WHERE m.ano_lectivo_id = $1 AND f.estado = 'injustificada') AS faltas_injustificadas`,
  [ano.id, u.escolaId])).rows[0];

  const alunosPorClasse = (await bd.query(`
    SELECT ${DESIGNACAO} AS classe, t.turno, count(m.id)::int AS total
    FROM turmas t
    JOIN classes c ON c.id = t.classe_id JOIN classes_catalogo cc ON cc.codigo = c.codigo
    LEFT JOIN matriculas m ON m.turma_id = t.id AND m.estado = 'activa'
    WHERE t.ano_lectivo_id = $1
    GROUP BY cc.ordem, c.ramo, cc.designacao, t.turno
    ORDER BY cc.ordem, c.ramo, t.turno`, [ano.id])).rows;

  // Transição por classe: uma linha por aluno e disciplina, agrupada por aluno
  const { rows } = await bd.query(`
    SELECT ${DESIGNACAO} AS classe, cc.ordem, m.id AS matricula,
           c.nota_minima_aprovacao, c.minimo_negativa, c.max_negativas, c.classe_de_exame,
           c.avaliacao_qualitativa, c.apenas_estagio, v.nota_final, coalesce(pd.chave, false) AS chave, e.curso_concluido
    FROM matriculas m
    JOIN turmas t ON t.id = m.turma_id
    JOIN classes c ON c.id = t.classe_id JOIN classes_catalogo cc ON cc.codigo = c.codigo
    LEFT JOIN planos_curriculares p ON p.classe_id = t.classe_id AND p.curso_id IS NOT DISTINCT FROM t.curso_id
    LEFT JOIN plano_disciplinas pd ON pd.plano_id = p.id
    LEFT JOIN v_resultados_disciplina v ON v.matricula_id = m.id AND v.disciplina_id = pd.disciplina_id
    LEFT JOIN estagios e ON e.matricula_id = m.id
    WHERE m.ano_lectivo_id = $1 AND m.estado = 'activa'`, [ano.id]);

  const porAluno = new Map();
  for (const r of rows) {
    if (!porAluno.has(r.matricula)) porAluno.set(r.matricula, { r, resultados: [] });
    if (!r.avaliacao_qualitativa && !r.apenas_estagio) porAluno.get(r.matricula).resultados.push({ notaFinal: r.nota_final, chave: r.chave });
  }
  const porClasse = new Map();
  for (const { r, resultados } of porAluno.values()) {
    if (r.avaliacao_qualitativa) continue; // a Iniciação não tem transição por notas
    let situacao;
    if (r.apenas_estagio) situacao = r.curso_concluido ? 'transita' : 'pendente';
    else situacao = decidirTransicao({ notaMinimaAprovacao: r.nota_minima_aprovacao, minimoNegativa: r.minimo_negativa,
                                       maxNegativas: r.max_negativas, classeDeExame: r.classe_de_exame }, resultados).situacao;
    if (!porClasse.has(r.classe)) porClasse.set(r.classe, { classe: r.classe, ordem: r.ordem, total: 0, transitam: 0, naoTransitam: 0, pendentes: 0 });
    const c = porClasse.get(r.classe);
    c.total += 1;
    if (situacao === 'transita') c.transitam += 1;
    else if (situacao === 'nao_transita') c.naoTransitam += 1;
    else c.pendentes += 1;
  }
  const aprovacaoPorClasse = [...porClasse.values()].sort((a, b) => a.ordem - b.ordem).map(({ ordem, ...c }) => ({
    ...c,
    // Percentagem sobre os alunos já decididos; os pendentes aparecem à parte
    percentagem: c.total - c.pendentes > 0 ? Math.round((1000 * c.transitam) / (c.total - c.pendentes)) / 10 : null,
  }));

  return {
    anoLectivo: { id: ano.id, designacao: ano.designacao },
    totais: camel(totais),
    alunosPorClasse: camel(alunosPorClasse),
    aprovacaoPorClasse,
  };
}
