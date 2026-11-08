import { rateLimit } from 'express-rate-limit';

/** RF05: no máximo `limite` tentativas falhadas de login por IP em 15 minutos. */
export const limitarLogin = (limite) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limite,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ mensagem: 'Demasiadas tentativas. Tente novamente dentro de 15 minutos.', codigo: 'LIMITE' }),
  });
