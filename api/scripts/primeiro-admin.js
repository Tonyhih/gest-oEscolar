// Corre no arranque do Render, depois das migrações.
// Se ainda não existir nenhum administrador da plataforma e ADMIN_EMAIL estiver definido,
// cria-o e escreve a palavra-passe provisória nos registos (Logs) do Render, uma única vez.
// Nos arranques seguintes não faz nada. Depois do primeiro acesso, pode apagar ADMIN_EMAIL e ADMIN_NOME.
import pg from 'pg';
import { criarAdministrador } from '../src/bd/admin.js';

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_NOME, NODE_ENV } = process.env;
if (!ADMIN_EMAIL) process.exit(0);

const cliente = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});
await cliente.connect();
try {
  const { rows } = await cliente.query(`SELECT 1 FROM utilizadores WHERE perfil = 'admin_plataforma' LIMIT 1`);
  if (rows.length) {
    console.log('Administrador da plataforma já existe; nada a fazer.');
  } else {
    const { email, palavraPasse } = await criarAdministrador(cliente, { nome: ADMIN_NOME || 'Administração da plataforma', email: ADMIN_EMAIL });
    console.log('=================================================================');
    console.log('Administrador da plataforma criado.');
    console.log(`  Email: ${email}`);
    console.log(`  Palavra-passe provisória: ${palavraPasse}`);
    console.log('Entre na aplicação e troque-a. Esta mensagem não volta a aparecer.');
    console.log('=================================================================');
  }
} finally {
  await cliente.end();
}
