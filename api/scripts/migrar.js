import pg from 'pg';
import { aplicarMigracoes } from '../src/bd/migracoes.js';

const cliente = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});
await cliente.connect();
try {
  const aplicadas = await aplicarMigracoes(cliente);
  console.log(aplicadas.length ? `Migrações aplicadas: ${aplicadas.join(', ')}` : 'Base de dados actualizada.');
} finally {
  await cliente.end();
}
