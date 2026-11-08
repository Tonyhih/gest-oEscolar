// API com PostgreSQL em memória (PGlite), migrada e com os dados fictícios do seed.
// Para demonstrações e para desenvolver o front-end sem instalar o PostgreSQL.
// Os dados perdem-se quando o processo termina.
import { PGlite } from '@electric-sql/pglite';
import { aplicarMigracoes } from '../src/bd/migracoes.js';
import { semear } from '../src/bd/seed.js';
import { criarApp } from '../src/app.js';

const porta = Number(process.env.PORT ?? 3000);
const palavraPasse = process.env.SEED_PALAVRA_PASSE ?? 'Teste#2026';

const pglite = new PGlite({ parsers: { 1700: (v) => (v === null ? null : Number(v)), 1082: (v) => v } });
await aplicarMigracoes(pglite);
await pglite.query('BEGIN');
const resumo = await semear(pglite, { palavraPasse });
await pglite.query('COMMIT');

const bd = { query: (sql, p) => pglite.query(sql, p), transaccao: (fn) => pglite.transaction((tx) => fn(tx)) };
const config = {
  producao: false,
  jwt: { segredo: 'segredo-so-para-desenvolvimento-em-memoria-0000', expira: '8h' },
  corsOrigens: (process.env.CORS_ORIGENS ?? 'http://localhost:5173,http://localhost:4173').split(','),
  limiteLogin: 50,
};

criarApp({ bd, config }).listen(porta, () => {
  console.log(`API (PostgreSQL em memória) em http://localhost:${porta}/api/v1`);
  console.log(`Utilizadores de teste (palavra-passe ${palavraPasse}):`);
  console.log(`  ${resumo.admin}`);
  for (const e of resumo.escolas) console.log(`  ${e.escola}: ${e.utilizadores.join(', ')}`);
});
