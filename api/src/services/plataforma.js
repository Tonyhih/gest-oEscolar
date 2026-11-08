import { camel, colunas, inserir, paginar } from '../util/sql.js';
import { conflito, naoEncontrado } from '../middleware/erros.js';
import { gerarHash, gerarPalavraPasseProvisoria } from './autenticacao.js';
import { registar } from './auditoria.js';

/** RF01, RF04: escolas com totais agregados (sem dados pessoais). */
export function listarEscolas(bd, { pagina, limite }) {
  return paginar(bd, `
    SELECT e.id, e.codigo, e.nome, e.provincia, e.municipio, e.natureza, e.ciclos, e.estado,
           (SELECT count(*)::int FROM alunos a WHERE a.escola_id = e.id AND a.estado = 'activo') AS total_alunos,
           (SELECT count(*)::int FROM turmas t JOIN anos_lectivos al ON al.id = t.ano_lectivo_id
             WHERE t.escola_id = e.id AND al.activo) AS total_turmas
    FROM escolas e ORDER BY e.nome`, [], { pagina, limite });
}

/** RF01 */
export async function criarEscola(bd, u, dados) {
  return bd.transaccao(async (c) => {
    const escola = await inserir(c, 'escolas', colunas(dados));
    await registar(c, u, { entidade: 'escola', entidadeId: escola.id, accao: 'criar', depois: escola });
    return camel(escola);
  });
}

/** RF03: activar ou desactivar (nunca apagar). */
export async function actualizarEscola(bd, u, id, { estado }) {
  return bd.transaccao(async (c) => {
    const { rows } = await c.query('UPDATE escolas SET estado = $2 WHERE id = $1 RETURNING *', [id, estado]);
    if (!rows[0]) throw naoEncontrado('Escola');
    await registar(c, u, { entidade: 'escola', entidadeId: id, accao: `estado_${estado}` });
    return camel(rows[0]);
  });
}

/** RF02: conta do director. A palavra-passe provisória só é devolvida nesta resposta. */
export async function criarDirector(bd, u, escolaId, { nome, email }) {
  return bd.transaccao(async (c) => {
    const { rows } = await c.query('SELECT id FROM escolas WHERE id = $1', [escolaId]);
    if (!rows[0]) throw naoEncontrado('Escola');
    const existente = await c.query(
      `SELECT 1 FROM utilizadores WHERE escola_id = $1 AND perfil = 'director' AND estado = 'activo'`, [escolaId]);
    if (existente.rows[0]) throw conflito('A escola já tem um director activo.');

    const palavraPasseProvisoria = gerarPalavraPasseProvisoria();
    const director = await inserir(c, 'utilizadores', {
      escola_id: escolaId, nome, email, perfil: 'director',
      palavra_passe_hash: await gerarHash(palavraPasseProvisoria), trocar_palavra_passe: true,
    });
    await registar(c, u, { entidade: 'utilizador', entidadeId: director.id, accao: 'criar_director' });
    return { utilizador: publico(director), palavraPasseProvisoria };
  });
}

/** Utilizador sem o hash da palavra-passe. */
export const publico = ({ id, nome, email, perfil, estado }) => ({ id, nome, email, perfil, estado });
