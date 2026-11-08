import pg from 'pg';

const { Pool, types } = pg;

// numeric (OID 1700) chega como texto; convertemos para número só na leitura.
// Os cálculos de notas são feitos em numeric na base de dados, sem erros de vírgula flutuante.
types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max: 10,
});

/** Executa fn(cliente) dentro de uma transacção. */
export async function emTransaccao(fn) {
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
}
