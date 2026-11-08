import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nota1, data, lerNota, notaInteira } from '@/util/formatar.js';
import { api, configurarCliente, ErroApi } from '@/api/cliente.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { guarda } from '@/router/index.js';

describe('formatar (RNF10)', () => {
  it('usa vírgula decimal e travessão para notas em falta', () => {
    expect(nota1(12.5)).toBe('12,5');
    expect(nota1(12)).toBe('12,0');
    expect(nota1(null)).toBe('—');
    expect(notaInteira(null)).toBe('—');
  });
  it('mostra as datas como dd/mm/aaaa', () => {
    expect(data('2026-11-08')).toBe('08/11/2026');
    expect(data(null)).toBe('—');
  });
  it('aceita a vírgula ao ler notas escritas pelo professor', () => {
    expect(lerNota('12,5')).toBe(12.5);
    expect(lerNota(' ')).toBeNull();
    expect(Number.isNaN(lerNota('doze'))).toBe(true);
  });
});

describe('cliente HTTP', () => {
  let sessaoInvalida;
  beforeEach(() => {
    sessaoInvalida = vi.fn();
    configurarCliente({ token: () => 'abc', sessaoInvalida });
  });
  const responder = (estado, corpo) => vi.fn().mockResolvedValue(new Response(corpo === undefined ? null : JSON.stringify(corpo), { status: estado }));

  it('envia o token e os parâmetros de consulta, ignorando os vazios', async () => {
    global.fetch = responder(200, []);
    await api.get('/alunos', { pesquisa: 'ana', turma: '' });
    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/alunos\?pesquisa=ana$/);
    expect(opcoes.headers.Authorization).toBe('Bearer abc');
  });

  it('converte o erro da API em ErroApi, com código e detalhes', async () => {
    global.fetch = responder(422, { mensagem: 'Trimestre fechado.', codigo: 'REGRA' });
    await expect(api.put('/x', [])).rejects.toMatchObject({ estado: 422, codigo: 'REGRA', message: 'Trimestre fechado.' });
    expect(sessaoInvalida).not.toHaveBeenCalled();
  });

  it('avisa a sessão em caso de 401', async () => {
    global.fetch = responder(401, { mensagem: 'Sessão inválida ou expirada.', codigo: 'NAO_AUTENTICADO' });
    await expect(api.get('/turmas')).rejects.toBeInstanceOf(ErroApi);
    expect(sessaoInvalida).toHaveBeenCalledOnce();
  });

  it('sem rede → ErroApi com estado 0 e mensagem clara', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/turmas')).rejects.toMatchObject({ estado: 0, codigo: 'SEM_LIGACAO' });
  });

  it('204 → null', async () => {
    global.fetch = responder(204);
    expect(await api.post('/auth/palavra-passe', {})).toBeNull();
  });
});

describe('guarda de rotas', () => {
  let auth;
  beforeEach(() => {
    setActivePinia(createPinia());
    auth = useAutenticacao();
    auth.iniciado = true; // sem pedido à API
  });
  const rota = (meta, fullPath = '/x') => ({ meta, fullPath });
  const sessao = (perfil, extra = {}) => {
    auth.token = 't';
    auth.utilizador = { perfil, turmasDirigidas: [], trocarPalavraPasse: false, ...extra };
  };

  it('sem sessão → página de entrada, guardando o destino', async () => {
    expect(await guarda(auth)(rota({}, '/turmas'))).toEqual({ name: 'entrar', query: { r: '/turmas' } });
  });
  it('com sessão, a página de entrada leva ao início', async () => {
    sessao('secretaria');
    expect(await guarda(auth)(rota({ publica: true }))).toEqual({ name: 'inicio' });
  });
  it('palavra-passe provisória → obrigado a trocar', async () => {
    sessao('professor', { trocarPalavraPasse: true });
    expect(await guarda(auth)(rota({}))).toEqual({ name: 'trocar-palavra-passe' });
    expect(await guarda(auth)(rota({ permiteTroca: true }))).toBe(true);
  });
  it('perfil sem acesso → início', async () => {
    sessao('professor');
    expect(await guarda(auth)(rota({ perfis: ['director'] }))).toEqual({ name: 'inicio' });
    sessao('director');
    expect(await guarda(auth)(rota({ perfis: ['director'] }))).toBe(true);
  });
});
