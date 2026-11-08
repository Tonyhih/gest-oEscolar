// Utilitários para SQL parametrizado. Os VALORES vão sempre como parâmetros ($1, $2…).
// Os NOMES das colunas vêm de esquemas Zod (nunca do cliente directamente) e são ainda
// verificados por uma expressão regular.

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (nome) => {
  if (!IDENT.test(nome)) throw new Error(`Identificador SQL inválido: ${nome}`);
  return nome;
};

export const paraSnake = (s) => s.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
export const paraCamel = (s) => s.replace(/_([a-z0-9])/g, (_, l) => l.toUpperCase());

/** Converte as chaves de uma linha (ou lista) de snake_case para camelCase. */
export function camel(valor) {
  if (Array.isArray(valor)) return valor.map(camel);
  if (!valor || typeof valor !== 'object' || valor instanceof Date) return valor;
  return Object.fromEntries(Object.entries(valor).map(([k, v]) => [paraCamel(k), v]));
}

/** Converte um objecto camelCase em colunas snake_case, ignorando valores undefined. */
export function colunas(dados) {
  return Object.fromEntries(
    Object.entries(dados).filter(([, v]) => v !== undefined).map(([k, v]) => [ident(paraSnake(k)), v]),
  );
}

/** INSERT … RETURNING *. `dados` em snake_case (use colunas()). */
export async function inserir(bd, tabela, dados) {
  const nomes = Object.keys(dados).map(ident);
  const sql = `INSERT INTO ${ident(tabela)} (${nomes.join(', ')})
               VALUES (${nomes.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
  return (await bd.query(sql, Object.values(dados))).rows[0];
}

/** UPDATE … WHERE id = $1 AND escola_id = $2 RETURNING *. Devolve undefined se não existir. */
export async function actualizar(bd, tabela, { id, escolaId }, dados) {
  const nomes = Object.keys(dados).map(ident);
  if (nomes.length === 0) {
    return (await bd.query(`SELECT * FROM ${ident(tabela)} WHERE id = $1 AND escola_id = $2`, [id, escolaId])).rows[0];
  }
  const sets = nomes.map((n, i) => `${n} = $${i + 3}`).join(', ');
  const sql = `UPDATE ${ident(tabela)} SET ${sets} WHERE id = $1 AND escola_id = $2 RETURNING *`;
  return (await bd.query(sql, [id, escolaId, ...Object.values(dados)])).rows[0];
}

/** Paginação: devolve { dados, pagina, limite, total }. A consulta não deve ter LIMIT. */
export async function paginar(bd, sql, parametros, { pagina = 1, limite = 20 }) {
  const total = (await bd.query(`SELECT count(*)::int AS n FROM (${sql}) AS sub`, parametros)).rows[0].n;
  const n = parametros.length;
  const { rows } = await bd.query(`${sql} LIMIT $${n + 1} OFFSET $${n + 2}`, [...parametros, limite, (pagina - 1) * limite]);
  return { dados: camel(rows), pagina, limite, total };
}
