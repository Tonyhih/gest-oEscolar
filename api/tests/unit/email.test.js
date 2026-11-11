import { describe, it, expect, vi, afterEach } from 'vitest';
import { criarEnvioEmail } from '../../src/services/email.js';
import { mascararEmail } from '../../src/services/autenticacao.js';

afterEach(() => vi.restoreAllMocks());

describe('Envio de email', () => {
  it('com a chave do Brevo, chama a API com o remetente e o destinatário', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    await criarEnvioEmail({ brevoApiKey: 'chave-de-teste', remetente: 'escola@exemplo.ao' })({ para: 'd@exemplo.ao', nome: 'D', assunto: 'A', texto: 'T' });
    const [url, pedido] = f.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(pedido.headers['api-key']).toBe('chave-de-teste');
    expect(JSON.parse(pedido.body)).toMatchObject({ sender: { email: 'escola@exemplo.ao' }, to: [{ email: 'd@exemplo.ao' }], subject: 'A', textContent: 'T' });
  });

  it('se o Brevo recusar, o envio falha (o login responde 503)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('chave inválida', { status: 401 }));
    await expect(criarEnvioEmail({ brevoApiKey: 'x', remetente: 'e@exemplo.ao' })({ para: 'd@exemplo.ao', assunto: 'A', texto: 'T' })).rejects.toThrow(/401/);
  });

  it('sem chave, escreve nos registos (modo de teste)', async () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await criarEnvioEmail({})({ para: 'd@exemplo.ao', assunto: 'Código', texto: 'é 123456.' });
    expect(w.mock.calls[0][0]).toMatch(/modo de teste.*123456/s);
  });

  it('mascara o email mostrado no ecrã', () => {
    expect(mascararEmail('director@lda101.test')).toBe('d******r@lda101.test');
    expect(mascararEmail('ab@x.ao')).toBe('a*b@x.ao');
  });
});
