import { z } from 'zod';
import { criarEnvioEmail } from '../services/email.js';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL em falta'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET tem de ter pelo menos 32 caracteres'),
  JWT_EXPIRA: z.string().default('8h'),
  CORS_ORIGENS: z.string().default('http://localhost:5173'),
  // Segundo factor do director (ligado por omissão) e envio de email pelo Brevo
  SEGUNDO_FACTOR: z.enum(['ligado', 'desligado']).default('ligado'),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_REMETENTE: z.string().email().optional(),
});

/** Lê e valida as variáveis de ambiente. Termina o processo se faltar alguma. */
export function lerAmbiente(env = process.env) {
  const r = esquema.safeParse(env);
  if (!r.success) {
    console.error('Configuração inválida:', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    process.exit(1);
  }
  const e = r.data;
  return {
    producao: e.NODE_ENV === 'production',
    porta: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwt: { segredo: e.JWT_SECRET, expira: e.JWT_EXPIRA },
    // Só origens (esquema + domínio + porta), sem caminho
    corsOrigens: e.CORS_ORIGENS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
    limiteLogin: 5,
    segundoFactor: e.SEGUNDO_FACTOR === 'ligado' ? { perfis: ['director'] } : null,
    email: { enviar: criarEnvioEmail({ brevoApiKey: e.BREVO_API_KEY, remetente: e.EMAIL_REMETENTE }) },
  };
}
