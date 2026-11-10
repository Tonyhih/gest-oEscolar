import { camel } from '../util/sql.js';
import { ErroAplicacao, conflito, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { obterAluno } from './pessoas.js';

// Histórico escolar: notas finais de classes anteriores ao uso do sistema (RF49).

const PRIMARIO = ['1', '2', '3', '4', '5', '6'];
const escalaDe = (codigo) => (PRIMARIO.includes(codigo) ? 10 : 20);

/** Histórico do aluno agrupado por classe, com o nome das disciplinas. */
export async function listar(bd, u, alunoId) {
  await obterAluno(bd, u, alunoId);
  const { rows } = await bd.query(`
    SELECT h.classe_codigo, h.ano_lectivo, h.escola_origem, h.disciplina_id, d.nome AS disciplina, d.sigla, h.nota_final,
           cc.ordem
    FROM historico_escolar h
    JOIN disciplinas d ON d.id = h.disciplina_id
    JOIN classes_catalogo cc ON cc.codigo = h.classe_codigo
    WHERE h.aluno_id = $1 AND h.escola_id = $2
    ORDER BY cc.ordem, d.nome`, [alunoId, u.escolaId]);
  const porClasse = new Map();
  for (const r of rows) {
    if (!porClasse.has(r.classe_codigo)) {
      porClasse.set(r.classe_codigo, {
        classe: r.classe_codigo, anoLectivo: r.ano_lectivo, escolaOrigem: r.escola_origem, escala: escalaDe(r.classe_codigo), notas: [] });
    }
    porClasse.get(r.classe_codigo).notas.push({ disciplina: r.disciplina_id, nome: r.disciplina, sigla: r.sigla, notaFinal: r.nota_final });
  }
  return [...porClasse.values()];
}

/**
 * Substitui as notas de uma classe do histórico. Recusa uma classe que o aluno já tem registada no sistema
 * (nesse caso as notas vêm das pautas, não do histórico). Fica na auditoria, com os valores anteriores.
 */
export async function definirClasse(bd, u, alunoId, classe, { anoLectivo, escolaOrigem, notas }) {
  await obterAluno(bd, u, alunoId);
  const noSistema = await bd.query(`
    SELECT 1 FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN classes c ON c.id = t.classe_id
    WHERE m.aluno_id = $1 AND m.estado <> 'anulada' AND c.codigo = $2`, [alunoId, classe]);
  if (noSistema.rows[0]) throw conflito(`O aluno já tem a ${classe}.ª classe registada no sistema; as notas vêm das pautas.`);

  const escala = escalaDe(classe);
  const detalhes = notas.flatMap((n, i) => (n.notaFinal > escala
    ? [{ campo: `body.notas.${i}.notaFinal`, mensagem: `Máximo ${escala} na ${classe}.ª classe.` }] : []));
  if (detalhes.length) throw new ErroAplicacao(`Há notas acima da escala da ${classe}.ª classe (0–${escala}).`, 422, 'ESCALA', detalhes);
  if (new Set(notas.map((n) => n.disciplina)).size !== notas.length) throw regra('Há disciplinas repetidas.');

  await bd.transaccao(async (c) => {
    const antes = (await c.query('SELECT disciplina_id, nota_final FROM historico_escolar WHERE aluno_id = $1 AND classe_codigo = $2',
      [alunoId, classe])).rows;
    // Substituição completa da classe (o histórico não tem regras de "nunca apagar": não é um registo das pautas)
    await c.query('DELETE FROM historico_escolar WHERE aluno_id = $1 AND classe_codigo = $2', [alunoId, classe]);
    for (const n of notas) {
      await c.query(`
        INSERT INTO historico_escolar (escola_id, aluno_id, classe_codigo, ano_lectivo, escola_origem, disciplina_id, nota_final, lancado_por)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [u.escolaId, alunoId, classe, anoLectivo, escolaOrigem ?? null, n.disciplina, n.notaFinal, u.id]);
    }
    await registar(c, u, { entidade: 'aluno', entidadeId: alunoId, accao: 'historico_escolar',
                           antes: { classe, notas: camel(antes) }, depois: { classe, anoLectivo, escolaOrigem, notas } });
  });
  return listar(bd, u, alunoId);
}

/** Notas do histórico de uma classe, para o certificado: Map(disciplinaId → { nome, notaFinal }) e o ano lectivo. */
export async function notasDaClasse(bd, alunoId, classe) {
  const { rows } = await bd.query(`
    SELECT h.disciplina_id, d.nome, h.nota_final, h.ano_lectivo FROM historico_escolar h JOIN disciplinas d ON d.id = h.disciplina_id
    WHERE h.aluno_id = $1 AND h.classe_codigo = $2 ORDER BY d.nome`, [alunoId, classe]);
  return { ano: rows[0]?.ano_lectivo ?? null, notas: rows };
}
