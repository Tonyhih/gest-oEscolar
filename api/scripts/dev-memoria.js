// API com PostgreSQL em memória (PGlite), migrada e com os dados fictícios do seed.
// Para demonstrações e para desenvolver o front-end sem instalar o PostgreSQL.
// Os dados perdem-se quando o processo termina.
import { PGlite } from '@electric-sql/pglite';
import { aplicarMigracoes } from '../src/bd/migracoes.js';
import { semear } from '../src/bd/seed.js';
import { criarApp } from '../src/app.js';
import { criarHistoricoICiclo } from '../src/bd/historico-demo.js';
import { criarEnvioEmail } from '../src/services/email.js';

const porta = Number(process.env.PORT ?? 3000);
const palavraPasse = process.env.SEED_PALAVRA_PASSE ?? 'Teste#2026';

const pglite = new PGlite({ parsers: { 1700: (v) => (v === null ? null : Number(v)), 1082: (v) => v } });
await aplicarMigracoes(pglite);
await pglite.query('BEGIN');
const resumo = await semear(pglite, { palavraPasse });
await pglite.query('COMMIT');
// Um aluno com o I Ciclo completo (7.ª, 8.ª e 9.ª), para experimentar o termo e o certificado
await criarHistoricoICiclo({
  um: async (sql, p) => (await pglite.query(sql, p)).rows[0],
  todos: async (sql, p) => (await pglite.query(sql, p)).rows,
}, 'Manuel Chissola');
await pglite.query(`UPDATE escolas SET decreto_criacao = '123/2015, de 10 de Março' WHERE codigo = 'LDA-101'`);

const bd = { query: (sql, p) => pglite.query(sql, p), transaccao: (fn) => pglite.transaction((tx) => fn(tx)) };
const config = {
  producao: false,
  jwt: { segredo: 'segredo-so-para-desenvolvimento-em-memoria-0000', expira: '8h' },
  corsOrigens: (process.env.CORS_ORIGENS ?? 'http://localhost:5173,http://localhost:4173').split(','),
  limiteLogin: 50,
  // Segundo factor do director: desligado na demonstração (SEGUNDO_FACTOR=ligado para o experimentar; o código aparece aqui)
  segundoFactor: process.env.SEGUNDO_FACTOR === 'ligado' ? { perfis: ['director'] } : null,
  email: { enviar: criarEnvioEmail({}) },
};

criarApp({ bd, config }).listen(porta, () => {
  console.log(`API (PostgreSQL em memória) em http://localhost:${porta}/api/v1`);
  console.log(`Utilizadores de teste (palavra-passe ${palavraPasse}):`);
  console.log(`  ${resumo.admin}`);
  for (const e of resumo.escolas) console.log(`  ${e.escola}: ${e.utilizadores.join(', ')}`);
});
