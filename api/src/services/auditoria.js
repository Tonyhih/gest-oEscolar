import { camel, paginar } from '../util/sql.js';

/**
 * Regista uma alteração na tabela auditoria (RNF04, RF39).
 * Deve ser chamado com o mesmo cliente da transacção da alteração.
 */
export async function registar(bd, utilizador, { entidade, entidadeId = null, accao, antes = null, depois = null, justificacao = null }) {
  await bd.query(
    `INSERT INTO auditoria (escola_id, utilizador_id, entidade, entidade_id, accao, antes, depois, justificacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [utilizador.escolaId ?? null, utilizador.id, entidade, entidadeId, accao,
     antes && JSON.stringify(camel(antes)), depois && JSON.stringify(camel(depois)), justificacao],
  );
}

/** RF39: consulta do registo de auditoria da escola. */
export function listar(bd, u, { utilizador, entidade, de, ate, pagina, limite }) {
  const p = [u.escolaId];
  const filtros = ['a.escola_id = $1'];
  if (utilizador) { p.push(utilizador); filtros.push(`a.utilizador_id = $${p.length}`); }
  if (entidade) { p.push(entidade); filtros.push(`a.entidade = $${p.length}`); }
  if (de) { p.push(de); filtros.push(`a.criado_em >= $${p.length}::date`); }
  if (ate) { p.push(ate); filtros.push(`a.criado_em < $${p.length}::date + 1`); }
  return paginar(bd, `
    SELECT a.id::text, a.criado_em AS data, u.nome AS utilizador, a.entidade, a.entidade_id, a.accao,
           a.antes, a.depois, a.justificacao
    FROM auditoria a JOIN utilizadores u ON u.id = a.utilizador_id
    WHERE ${filtros.join(' AND ')}
    ORDER BY a.criado_em DESC, a.id DESC`, p, { pagina, limite });
}
