import pg from 'pg';
import { semear } from '../src/bd/seed.js';

if (process.env.NODE_ENV === 'production') {
  console.error('O seed tem dados fictícios e não corre em produção.');
  process.exit(1);
}
const palavraPasse = process.env.SEED_PALAVRA_PASSE ?? 'Teste#2026';

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  const resumo = await semear(cliente, { palavraPasse });
  await cliente.query('COMMIT');
  console.log(JSON.stringify(resumo, null, 2));
  console.log(`\nTodos os utilizadores de teste usam a palavra-passe: ${palavraPasse}`);
} catch (erro) {
  await cliente.query('ROLLBACK');
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
