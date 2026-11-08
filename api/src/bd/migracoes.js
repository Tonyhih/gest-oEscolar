import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PASTA = new URL('../../migrations/', import.meta.url).pathname;

// Executa SQL com vários comandos (pg aceita-o em query; o PGlite usa exec)
const executarScript = (cliente, sql) => (cliente.exec ? cliente.exec(sql) : cliente.query(sql));

/**
 * Aplica, por ordem, as migrações em migrations/ que ainda não foram aplicadas.
 * Cada ficheiro corre numa transacção: ou entra todo, ou nada.
 * @param {{ query: Function, exec?: Function }} cliente  pg.Client / pg.PoolClient ou PGlite
 * @returns {Promise<string[]>} ficheiros aplicados nesta execução
 */
export async function aplicarMigracoes(cliente) {
  await cliente.query(`CREATE TABLE IF NOT EXISTS migracoes (
    ficheiro text PRIMARY KEY,
    aplicada_em timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await cliente.query('SELECT ficheiro FROM migracoes');
  const feitas = new Set(rows.map((r) => r.ficheiro));
  const ficheiros = (await readdir(PASTA)).filter((f) => f.endsWith('.sql')).sort();

  const aplicadas = [];
  for (const ficheiro of ficheiros) {
    if (feitas.has(ficheiro)) continue;
    const sql = await readFile(join(PASTA, ficheiro), 'utf8');
    await cliente.query('BEGIN');
    try {
      await executarScript(cliente, sql);
      await cliente.query('INSERT INTO migracoes (ficheiro) VALUES ($1)', [ficheiro]);
      await cliente.query('COMMIT');
      aplicadas.push(ficheiro);
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw new Error(`Falha na migração ${ficheiro}: ${erro.message}`);
    }
  }
  return aplicadas;
}
