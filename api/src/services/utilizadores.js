import { inserir, paginar } from '../util/sql.js';
import { naoEncontrado, regra } from '../middleware/erros.js';
import { gerarHash, gerarPalavraPasseProvisoria } from './autenticacao.js';
import { registar } from './auditoria.js';
import { publico } from './plataforma.js';

/** RF07 */
export function listar(bd, u, { perfil, pagina, limite }) {
  const p = [u.escolaId];
  let filtro = '';
  if (perfil) { p.push(perfil); filtro = 'AND perfil = $2'; }
  return paginar(bd, `SELECT id, nome, email, perfil, estado FROM utilizadores
                      WHERE escola_id = $1 ${filtro} ORDER BY nome`, p, { pagina, limite });
}

/**
 * RF07: cria um utilizador na escola do director. O perfil "director" não pode ser escolhido aqui
 * (o esquema Zod só aceita secretaria, coordenador e professor). Um professor recebe logo a ficha
 * em professores.
 */
export async function criar(bd, u, { nome, email, perfil }) {
  return bd.transaccao(async (c) => {
    const palavraPasseProvisoria = gerarPalavraPasseProvisoria();
    const novo = await inserir(c, 'utilizadores', {
      escola_id: u.escolaId, nome, email, perfil,
      palavra_passe_hash: await gerarHash(palavraPasseProvisoria), trocar_palavra_passe: true,
    });
    if (perfil === 'professor') await inserir(c, 'professores', { escola_id: u.escolaId, utilizador_id: novo.id });
    await registar(c, u, { entidade: 'utilizador', entidadeId: novo.id, accao: 'criar', depois: publico(novo) });
    return { utilizador: publico(novo), palavraPasseProvisoria };
  });
}

/** RF09: alterar o nome ou desactivar. O histórico (notas lançadas) mantém-se. */
export async function actualizar(bd, u, id, { nome, estado }) {
  if (id === u.id && estado === 'inactivo') throw regra('Não pode desactivar a sua própria conta.');
  return bd.transaccao(async (c) => {
    const antes = (await c.query(`SELECT * FROM utilizadores WHERE id = $1 AND escola_id = $2`, [id, u.escolaId])).rows[0];
    if (!antes) throw naoEncontrado('Utilizador');
    const { rows } = await c.query(
      `UPDATE utilizadores SET nome = coalesce($3, nome), estado = coalesce($4, estado)
       WHERE id = $1 AND escola_id = $2 RETURNING *`, [id, u.escolaId, nome ?? null, estado ?? null]);
    await registar(c, u, { entidade: 'utilizador', entidadeId: id, accao: 'actualizar', antes: publico(antes), depois: publico(rows[0]) });
    return publico(rows[0]);
  });
}

/** RF08 */
export async function reporPalavraPasse(bd, u, id) {
  return bd.transaccao(async (c) => {
    const palavraPasseProvisoria = gerarPalavraPasseProvisoria();
    const { rows } = await c.query(
      `UPDATE utilizadores SET palavra_passe_hash = $3, trocar_palavra_passe = true
       WHERE id = $1 AND escola_id = $2 RETURNING id`, [id, u.escolaId, await gerarHash(palavraPasseProvisoria)]);
    if (!rows[0]) throw naoEncontrado('Utilizador');
    await registar(c, u, { entidade: 'utilizador', entidadeId: id, accao: 'repor_palavra_passe' });
    return { palavraPasseProvisoria };
  });
}
