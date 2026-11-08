import { proibido } from './erros.js';

/**
 * Perfis:
 *   admin_plataforma · director · secretaria · coordenador · professor
 * O "director de turma" é um professor com turmas em req.utilizador.turmasDirigidas.
 * As verificações por recurso (é o professor desta turma?) estão nos serviços.
 */
export const exigirPerfil = (...perfis) => (req, res, next) => {
  if (!perfis.includes(req.utilizador.perfil)) throw proibido();
  next();
};

export const PERFIS_ESCOLA = ['director', 'secretaria', 'coordenador', 'professor'];
export const GESTAO = ['director', 'secretaria'];
