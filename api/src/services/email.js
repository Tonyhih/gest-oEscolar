// Envio de email. Com BREVO_API_KEY e EMAIL_REMETENTE usa a API do Brevo; sem elas, escreve a mensagem
// nos registos do servidor (modo de teste), para o sistema continuar a funcionar sem conta de email.

const BREVO = 'https://api.brevo.com/v3/smtp/email';

/** Cria a função de envio conforme a configuração. */
export function criarEnvioEmail({ brevoApiKey, remetente, nomeRemetente = 'Gestão Escolar' } = {}) {
  if (brevoApiKey && remetente) {
    return async ({ para, nome, assunto, texto }) => {
      const r = await fetch(BREVO, {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: nomeRemetente, email: remetente }, to: [{ email: para, name: nome }], subject: assunto, textContent: texto }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`Brevo respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
    };
  }
  return async ({ para, assunto, texto }) => {
    console.warn(`[email em modo de teste: configure BREVO_API_KEY e EMAIL_REMETENTE] Para: ${para} · ${assunto}\n${texto}`);
  };
}
