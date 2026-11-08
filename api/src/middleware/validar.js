import { ErroAplicacao } from './erros.js';

/**
 * Valida body, query e params com esquemas Zod. Os campos que não estão no esquema são descartados
 * (protecção contra atribuição em massa). O resultado fica em req.dados.{body,query,params},
 * porque no Express 5 req.query só tem getter e não pode ser substituído.
 */
export const validar = (esquemas) => (req, res, next) => {
  req.dados = { body: req.body, query: req.query, params: req.params };
  const detalhes = [];
  for (const parte of ['params', 'query', 'body']) {
    if (!esquemas[parte]) continue;
    const r = esquemas[parte].safeParse(req[parte] ?? {});
    if (r.success) req.dados[parte] = r.data;
    else detalhes.push(...r.error.issues.map((i) => ({ campo: [parte, ...i.path].join('.'), mensagem: i.message })));
  }
  if (detalhes.length) return next(new ErroAplicacao('Dados inválidos.', 400, 'VALIDACAO', detalhes));
  next();
};
