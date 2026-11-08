import { ErroAplicacao } from './erros.js';
import { verificarToken, carregarUtilizador } from '../services/autenticacao.js';

/**
 * Exige um token válido e carrega req.utilizador da base de dados.
 * Com trocarPalavraPasse pendente, só as rotas marcadas com permitirTrocaPendente funcionam.
 */
export const exigirAutenticacao = (config, { permitirTrocaPendente = false } = {}) => async (req, res, next) => {
  const [tipo, token] = (req.get('authorization') ?? '').split(' ');
  if (tipo !== 'Bearer' || !token) throw new ErroAplicacao('Sessão inválida ou expirada.', 401);

  const id = verificarToken(config, token);
  const u = await carregarUtilizador(req.bd, id);
  if (!u || u.estado !== 'activo' || (u.escola && u.escola.estado !== 'activo')) {
    throw new ErroAplicacao('Sessão inválida ou expirada.', 401);
  }
  if (u.trocarPalavraPasse && !permitirTrocaPendente) {
    throw new ErroAplicacao('Tem de alterar a palavra-passe antes de continuar.', 403, 'TROCAR_PALAVRA_PASSE');
  }
  req.utilizador = u;
  next();
};
