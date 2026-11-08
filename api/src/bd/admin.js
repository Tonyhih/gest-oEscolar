import { gerarHash, gerarPalavraPasseProvisoria } from '../services/autenticacao.js';

/**
 * Cria o administrador da plataforma (o primeiro utilizador em produção, onde não há seed).
 * A palavra-passe é provisória: tem de ser trocada no primeiro acesso.
 * @returns {{ email: string, palavraPasse: string }}
 */
export async function criarAdministrador(cliente, { nome, email }) {
  const existe = await cliente.query('SELECT 1 FROM utilizadores WHERE lower(email) = lower($1)', [email]);
  if (existe.rows.length) throw new Error(`Já existe um utilizador com o email ${email}.`);
  const palavraPasse = gerarPalavraPasseProvisoria();
  await cliente.query(
    `INSERT INTO utilizadores (nome, email, perfil, palavra_passe_hash, trocar_palavra_passe)
     VALUES ($1, $2, 'admin_plataforma', $3, true)`, [nome, email.toLowerCase(), await gerarHash(palavraPasse)]);
  return { email: email.toLowerCase(), palavraPasse };
}
