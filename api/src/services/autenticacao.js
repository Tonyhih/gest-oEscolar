import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
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
    `SELECT u.id, u.nome, u.email, u.perfil, u.palavra_passe_hash, u.estado, e.estado AS escola_estado
     FROM utilizadores u LEFT JOIN escolas e ON e.id = u.escola_id
     WHERE lower(u.email) = lower($1)`, [email]);
  const u = rows[0];
  const valida = await bcrypt.compare(palavraPasse, u?.palavra_passe_hash ?? (await obterHashFicticio()));
  // A mesma mensagem para email inexistente, palavra-passe errada, conta ou escola inactiva
  if (!u || !valida || u.estado !== 'activo' || (u.escola_estado && u.escola_estado !== 'activo')) {
    throw CREDENCIAIS_ERRADAS();
  }
  // Segundo factor: o director recebe um código por email antes de receber o token
  if (config.segundoFactor?.perfis.includes(u.perfil)) return criarDesafio(bd, config, u);
  return emitirSessao(bd, config, u.id);
}

async function emitirSessao(bd, config, id) {
  const token = jwt.sign({}, config.jwt.segredo, {
    algorithm: 'HS256', subject: id, issuer: EMISSOR, audience: AUDIENCIA, expiresIn: config.jwt.expira,
  });
  return { token, utilizador: sessao(await carregarUtilizador(bd, id)) };
}

// ======================================================================
// Segundo factor por email (código de 6 dígitos, 10 minutos, 5 tentativas, 3 reenvios)
// ======================================================================
const VALIDADE_MIN = 10;
const hashCodigo = (config, desafio, codigo) => createHmac('sha256', config.jwt.segredo).update(`${desafio}:${codigo}`).digest('hex');
const novoCodigoNumerico = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
/** tonyhih1@outlook.com → t*****1@outlook.com */
export const mascararEmail = (email) => email.replace(/^(.)(.*)(.)@/, (_, a, meio, b) => `${a}${'*'.repeat(Math.max(meio.length, 1))}${b}@`);

async function enviarCodigo(config, u, codigo) {
  await config.email.enviar({
    para: u.email, nome: u.nome, assunto: `Código de acesso: ${codigo}`,
    texto: `Olá, ${u.nome}.\n\nO seu código de acesso ao Sistema de Gestão Escolar é ${codigo}.\n`
      + `É válido durante ${VALIDADE_MIN} minutos. Se não foi você a tentar entrar, mude a palavra-passe.\n`,
  });
}

async function criarDesafio(bd, config, u) {
  const codigo = novoCodigoNumerico();
  const { rows } = await bd.query(
    `INSERT INTO codigos_acesso (utilizador_id, codigo_hash, expira_em) VALUES ($1, 'pendente', now() + interval '${VALIDADE_MIN} minutes')
     RETURNING id, expira_em`, [u.id]);
  const desafio = rows[0].id;
  await bd.query('UPDATE codigos_acesso SET codigo_hash = $2 WHERE id = $1', [desafio, hashCodigo(config, desafio, codigo)]);
  try {
    await enviarCodigo(config, u, codigo);
  } catch (e) {
    console.error('Falha ao enviar o código de acesso:', e.message);
    throw new ErroAplicacao('Não foi possível enviar o código por email. Tente de novo dentro de alguns minutos.', 503, 'EMAIL');
  }
  return { segundoFactor: true, desafio, email: mascararEmail(u.email), expiraEm: rows[0].expira_em };
}

const CODIGO_INVALIDO = (m = 'Código incorrecto ou expirado.') => new ErroAplicacao(m, 401, 'CODIGO');

/** Confirma o código e devolve a sessão. */
export async function confirmarCodigo(bd, config, { desafio, codigo }) {
  const d = await bd.transaccao(async (c) => {
    const x = (await c.query(`SELECT * FROM codigos_acesso WHERE id = $1 FOR UPDATE`, [desafio])).rows[0];
    if (!x || x.usado_em || new Date(x.expira_em) < new Date()) throw CODIGO_INVALIDO('O código expirou. Entre de novo.');
    if (x.tentativas >= 5) throw CODIGO_INVALIDO('Demasiadas tentativas. Entre de novo para receber outro código.');
    const certo = timingSafeEqual(Buffer.from(hashCodigo(config, desafio, codigo)), Buffer.from(x.codigo_hash));
    if (!certo) {
      await c.query('UPDATE codigos_acesso SET tentativas = tentativas + 1 WHERE id = $1', [desafio]);
      return { erro: true };
    }
    await c.query('UPDATE codigos_acesso SET usado_em = now() WHERE id = $1', [desafio]);
    const u = await carregarUtilizador(c, x.utilizador_id);
    if (!u || u.estado !== 'activo' || (u.escola && u.escola.estado !== 'activo')) throw CODIGO_INVALIDO();
    await registar(c, u, { entidade: 'utilizador', entidadeId: u.id, accao: 'login_segundo_factor' });
    return { id: u.id };
  });
  // A tentativa falhada fica gravada (fora do rollback) e só depois se responde com o erro
  if (d.erro) throw CODIGO_INVALIDO();
  return emitirSessao(bd, config, d.id);
}

/** Envia um código novo para o mesmo desafio (no máximo 3 vezes, com 1 minuto de intervalo). */
export async function reenviarCodigo(bd, config, { desafio }) {
  const x = (await bd.query(`SELECT c.*, u.nome, u.email FROM codigos_acesso c JOIN utilizadores u ON u.id = c.utilizador_id
                             WHERE c.id = $1`, [desafio])).rows[0];
  if (!x || x.usado_em || new Date(x.expira_em) < new Date()) throw CODIGO_INVALIDO('O código expirou. Entre de novo.');
  if (x.reenvios >= 3) throw regra('Já pediu 3 códigos. Entre de novo.');
  if (Date.now() - new Date(x.enviado_em).getTime() < 60_000) throw regra('Aguarde um minuto antes de pedir outro código.');
  const codigo = novoCodigoNumerico();
  await bd.query(`UPDATE codigos_acesso SET codigo_hash = $2, tentativas = 0, reenvios = reenvios + 1, enviado_em = now(),
                  expira_em = now() + interval '${VALIDADE_MIN} minutes' WHERE id = $1`, [desafio, hashCodigo(config, desafio, codigo)]);
  await enviarCodigo(config, x, codigo);
  return { segundoFactor: true, desafio, email: mascararEmail(x.email) };
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
