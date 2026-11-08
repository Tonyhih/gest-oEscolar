import { PGlite } from '@electric-sql/pglite';
import { aplicarMigracoes } from '../../src/bd/migracoes.js';
import { semear } from '../../src/bd/seed.js';

// numeric chega como texto do PGlite; convertemos como faz src/config/bd.js
const num = (v) => (v === null ? null : Number(v));

/** Base de dados PostgreSQL em memória, com as migrações aplicadas (e, opcionalmente, o seed). */
export async function criarBd({ comSeed = false } = {}) {
  const bd = new PGlite({ parsers: { 1700: num } });
  await aplicarMigracoes(bd);
  if (comSeed) {
    await bd.query('BEGIN');
    await semear(bd, { palavraPasse: 'Teste#2026' });
    await bd.query('COMMIT');
  }
  return bd;
}

/** Espera que a promessa falhe com uma mensagem do PostgreSQL que contenha `texto`. */
export async function esperarErro(promessa, texto) {
  try {
    await promessa;
  } catch (erro) {
    if (!String(erro.message).includes(texto)) throw new Error(`Erro inesperado: ${erro.message}`);
    return erro;
  }
  throw new Error(`Esperava um erro com "${texto}", mas o comando foi aceite.`);
}
