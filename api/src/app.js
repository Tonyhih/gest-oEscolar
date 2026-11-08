import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { criarRotas } from './routes/index.js';
import { ErroAplicacao, tratarErros } from './middleware/erros.js';

/**
 * Cria a aplicação Express sem a pôr à escuta (para os testes com Supertest).
 * @param {{ bd: { query: Function, transaccao: Function }, config: object }} dependencias
 */
export function criarApp({ bd, config }) {
  const app = express();
  if (config.producao) app.set('trust proxy', 1); // o Render está atrás de um proxy (IP real para o limite de login)

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    // Lista branca de origens; pedidos sem Origin (curl, Supertest) passam, porque o CORS só protege browsers
    origin: (origem, cb) => cb(null, !origem || config.corsOrigens.includes(origem)),
    methods: ['GET', 'POST', 'PUT', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => { req.bd = bd; next(); });

  app.use('/api/v1', criarRotas(config));
  app.use((req, res, next) => next(new ErroAplicacao('Rota não encontrada.', 404)));
  app.use(tratarErros);
  return app;
}
