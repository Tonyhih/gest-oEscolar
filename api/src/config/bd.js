import pg from 'pg';

const { Pool, types } = pg;

// numeric (OID 1700) chega como texto; convertemos para número só na leitura.
// Os cálculos de notas são feitos em numeric na base de dados, sem erros de vírgula flutuante.
types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));
// date (OID 1082) fica como texto 'aaaa-mm-dd', sem conversões de fuso horário
types.setTypeParser(1082, (valor) => valor);

/**
 * Cria o acesso à base de dados usado pela aplicação:
 *   bd.query(sql, parametros)               → { rows }
 *   bd.transaccao(async (cliente) => ...)   → BEGIN / COMMIT / ROLLBACK
 */
export function criarBdPostgres({ databaseUrl, producao }) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: producao ? { rejectUnauthorized: true } : false,
    max: 10,
  });
  return {
    query: (sql, parametros) => pool.query(sql, parametros),
    async transaccao(fn) {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const resultado = await fn(cliente);
        await cliente.query('COMMIT');
        return resultado;
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
      } finally {
        cliente.release();
      }
    },
    fechar: () => pool.end(),
  };
}
