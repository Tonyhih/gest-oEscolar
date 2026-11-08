// Cria o administrador da plataforma na base de dados indicada em DATABASE_URL.
// Uso (uma única vez, a partir do seu computador):
//   DATABASE_URL='postgresql://...neon.tech/gestao_escolar?sslmode=require' NODE_ENV=production \
//   ADMIN_NOME='Nome Apelido' ADMIN_EMAIL='admin@exemplo.ao' node scripts/criar-admin.js
import pg from 'pg';
import { criarAdministrador } from '../src/bd/admin.js';

const { DATABASE_URL, ADMIN_NOME, ADMIN_EMAIL, NODE_ENV } = process.env;
if (!DATABASE_URL || !ADMIN_NOME || !ADMIN_EMAIL) {
  console.error('Defina DATABASE_URL, ADMIN_NOME e ADMIN_EMAIL.');
  process.exit(1);
}

const cliente = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});
await cliente.connect();
try {
  const { email, palavraPasse } = await criarAdministrador(cliente, { nome: ADMIN_NOME, email: ADMIN_EMAIL });
  console.log('Administrador da plataforma criado.');
  console.log(`  Email: ${email}`);
  console.log(`  Palavra-passe provisória: ${palavraPasse}`);
  console.log('Anote-a agora: não volta a ser mostrada e tem de ser trocada no primeiro acesso.');
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
