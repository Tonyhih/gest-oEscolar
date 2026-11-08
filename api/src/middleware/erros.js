const CODIGOS = {
  400: 'VALIDACAO', 401: 'NAO_AUTENTICADO', 403: 'PROIBIDO', 404: 'NAO_ENCONTRADO',
  409: 'CONFLITO', 413: 'DEMASIADO_GRANDE', 422: 'REGRA', 429: 'LIMITE',
};

export class ErroAplicacao extends Error {
  /**
   * @param {string} mensagem  texto para o utilizador
   * @param {number} estado    código HTTP
   * @param {string} [codigo]  código estável para o front-end
   * @param {Array}  [detalhes]
   */
  constructor(mensagem, estado = 500, codigo = undefined, detalhes = undefined) {
    super(mensagem);
    this.estado = estado;
    this.codigo = codigo ?? CODIGOS[estado] ?? 'ERRO';
    this.detalhes = detalhes;
  }
}

export const naoEncontrado = (o = 'Registo') => new ErroAplicacao(`${o} não encontrado.`, 404);
export const proibido = (m = 'Não tem permissão para esta operação.') => new ErroAplicacao(m, 403);
export const regra = (m) => new ErroAplicacao(m, 422);
export const conflito = (m) => new ErroAplicacao(m, 409);

/** Traduz erros do PostgreSQL em respostas HTTP, sem revelar detalhes internos. */
function traduzirErroPostgres(erro) {
  switch (erro.code) {
    case '23505': return new ErroAplicacao('Já existe um registo com estes dados.', 409, 'DUPLICADO');
    case '23503': return new ErroAplicacao('Um dos registos indicados não existe.', 404, 'REFERENCIA');
    case '23514': return new ErroAplicacao('Os dados violam uma regra do sistema.', 422, 'RESTRICAO');
    case '22P02': return new ErroAplicacao('Identificador inválido.', 400, 'VALIDACAO');
    case 'P0001': return new ErroAplicacao('Operação não permitida.', 422, 'REGRA');
    default: return null;
  }
}

// eslint-disable-next-line no-unused-vars
export function tratarErros(erro, req, res, next) {
  if (erro.type === 'entity.parse.failed') erro = new ErroAplicacao('JSON mal formado.', 400);
  if (erro.type === 'entity.too.large') erro = new ErroAplicacao('Pedido demasiado grande.', 413);
  if (!(erro instanceof ErroAplicacao)) erro = traduzirErroPostgres(erro) ?? erro;

  if (erro instanceof ErroAplicacao) {
    const corpo = { mensagem: erro.message, codigo: erro.codigo };
    if (erro.detalhes) corpo.detalhes = erro.detalhes;
    return res.status(erro.estado).json(corpo);
  }
  if (process.env.NODE_ENV !== 'test') console.error(erro);
  res.status(500).json({ mensagem: 'Erro interno.', codigo: 'ERRO' }); // nunca expõe o stack trace
}
