import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { ErroAplicacao, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';

const CUSTO_BCRYPT = 12;
const EMISSOR = 'gestao-escolar-api';
const AUDIENCIA = 'gestao-escolar-web';

// Hash fictício: quando o email não existe, comparamos na mesma para o tempo de resposta
// não revelar se a conta existe (OWASP A07).
let hashFicticio;
const obterHashFicticio = async () => (hashFicticio ??= await bcrypt.hash('conta-inexistente', CUSTO_BCRYPT));

export const gerarHash = (palavraPasse) => bcrypt.hash(palavraPasse, CUSTO_BCRYPT);

/** Palavra-passe provisória legível (12 caracteres, sem 0/O/1/l). */
export function gerarPalavraPasseProvisoria() {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(12)].map((b) => alfabeto[b % alfabeto.length]).join('');
}

const CREDENCIAIS_ERRADAS = () => new ErroAplicacao('Email ou palavra-passe incorrectos.', 401);

/** RF05: login. Devolve o token e os dados da sessão. */
export async function entrar(bd, config, { email, palavraPasse }) {
  const { rows } = await bd.query(
    `SELECT u.id, u.palavra_passe_hash, u.estado, e.estado AS escola_estado
     FROM utilizadores u LEFT JOIN escolas e ON e.id = u.escola_id
     WHERE lower(u.email) = lower($1)`, [email]);
  const u = rows[0];
  const valida = await bcrypt.compare(palavraPasse, u?.palavra_passe_hash ?? (await obterHashFicticio()));
  // A mesma mensagem para email inexistente, palavra-passe errada, conta ou escola inactiva
  if (!u || !valida || u.estado !== 'activo' || (u.escola_estado && u.escola_estado !== 'activo')) {
    throw CREDENCIAIS_ERRADAS();
  }
  const token = jwt.sign({}, config.jwt.segredo, {
    algorithm: 'HS256', subject: u.id, issuer: EMISSOR, audience: AUDIENCIA, expiresIn: config.jwt.expira,
  });
  return { token, utilizador: sessao(await carregarUtilizador(bd, u.id)) };
}

/** Verifica o token: algoritmo fixo, emissor e audiência (RFC 8725). Devolve o id do utilizador. */
export function verificarToken(config, token) {
  try {
    const dados = jwt.verify(token, config.jwt.segredo, { algorithms: ['HS256'], issuer: EMISSOR, audience: AUDIENCIA });
    return dados.sub;
  } catch {
    throw new ErroAplicacao('Sessão inválida ou expirada.', 401);
  }
}

/**
 * Lê o utilizador da base de dados em cada pedido: perfil, escola e estado nunca vêm do token.
 * Devolve undefined se não existir.
 */
export async function carregarUtilizador(bd, id) {
  const { rows } = await bd.query(
    `SELECT u.id, u.nome, u.email, u.perfil, u.escola_id, u.estado, u.trocar_palavra_passe,
            e.nome AS escola_nome, e.estado AS escola_estado, p.id AS professor_id,
            coalesce((SELECT array_agg(t.id::text) FROM turmas t WHERE t.director_turma_id = p.id), '{}'::text[])
              AS turmas_dirigidas
     FROM utilizadores u
     LEFT JOIN escolas e     ON e.id = u.escola_id
     LEFT JOIN professores p ON p.utilizador_id = u.id
     WHERE u.id = $1`, [id]);
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: r.id, nome: r.nome, email: r.email, perfil: r.perfil, estado: r.estado,
    escolaId: r.escola_id, escola: r.escola_id ? { id: r.escola_id, nome: r.escola_nome, estado: r.escola_estado } : null,
    professorId: r.professor_id, turmasDirigidas: r.turmas_dirigidas, trocarPalavraPasse: r.trocar_palavra_passe,
  };
}

/** Dados da sessão enviados ao front-end (UtilizadorSessao). */
export function sessao(u) {
  return {
    id: u.id, nome: u.nome, email: u.email, perfil: u.perfil,
    escola: u.escola ? { id: u.escola.id, nome: u.escola.nome } : null,
    trocarPalavraPasse: u.trocarPalavraPasse, turmasDirigidas: u.turmasDirigidas, professorId: u.professorId ?? null,
  };
}

/** RF06: alterar a própria palavra-passe. */
export async function alterarPalavraPasse(bd, u, { actual, nova }) {
  const { rows } = await bd.query('SELECT palavra_passe_hash FROM utilizadores WHERE id = $1', [u.id]);
  if (!(await bcrypt.compare(actual, rows[0].palavra_passe_hash))) throw regra('A palavra-passe actual está incorrecta.');
  if (actual === nova) throw regra('A nova palavra-passe tem de ser diferente da actual.');
  await bd.transaccao(async (c) => {
    await c.query('UPDATE utilizadores SET palavra_passe_hash = $2, trocar_palavra_passe = false WHERE id = $1',
      [u.id, await gerarHash(nova)]);
    await registar(c, u, { entidade: 'utilizador', entidadeId: u.id, accao: 'alterar_palavra_passe' });
  });
}
