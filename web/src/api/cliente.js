// Cliente HTTP único: nenhum componente usa fetch directamente.

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/+$/, '');

export class ErroApi extends Error {
  /**
   * @param {string} mensagem
   * @param {number} estado   código HTTP (0 = sem ligação)
   * @param {string} [codigo] código estável da API (VALIDACAO, REGRA, ...)
   * @param {Array}  [detalhes]
   */
  constructor(mensagem, estado, codigo, detalhes) {
    super(mensagem);
    this.estado = estado;
    this.codigo = codigo;
    this.detalhes = detalhes ?? [];
  }
}

let obterToken = () => null;
let aoFalharSessao = () => {};

/** A store de autenticação regista aqui como obter o token e o que fazer com 401/403 de sessão. */
export function configurarCliente({ token, sessaoInvalida }) {
  obterToken = token;
  aoFalharSessao = sessaoInvalida;
}

function montarUrl(caminho, query) {
  const url = new URL(`${BASE}${caminho}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  return url;
}

async function enviar(caminho, { metodo = 'GET', corpo, query } = {}) {
  const cabecalhos = {};
  const token = obterToken();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  try {
    return await fetch(montarUrl(caminho, query), {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi('Sem ligação ao servidor. Verifique a internet e tente de novo.', 0, 'SEM_LIGACAO');
  }
}

async function verificar(resposta) {
  if (resposta.ok) return resposta;
  const dados = await resposta.json().catch(() => ({}));
  const erro = new ErroApi(dados.mensagem ?? 'Erro inesperado.', resposta.status, dados.codigo, dados.detalhes);
  if (resposta.status === 401 || erro.codigo === 'TROCAR_PALAVRA_PASSE') aoFalharSessao(erro);
  throw erro;
}

/** Pedido JSON. Devolve o corpo da resposta (ou null para 204). */
export async function pedido(caminho, opcoes = {}) {
  const resposta = await verificar(await enviar(caminho, opcoes));
  if (resposta.status === 204) return null;
  return resposta.json();
}

/** Descarrega um ficheiro (por exemplo, a pauta em CSV) com o token de sessão. */
export async function descarregar(caminho, nomeFicheiro, query) {
  const resposta = await verificar(await enviar(caminho, { query }));
  const url = URL.createObjectURL(await resposta.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nomeFicheiro });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: (c, query) => pedido(c, { query }),
  post: (c, corpo, query) => pedido(c, { metodo: 'POST', corpo: corpo ?? {}, query }),
  put: (c, corpo, query) => pedido(c, { metodo: 'PUT', corpo, query }),
  patch: (c, corpo) => pedido(c, { metodo: 'PATCH', corpo }),
};
