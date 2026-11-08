import { lerAmbiente } from './config/ambiente.js';
import { criarBdPostgres } from './config/bd.js';
import { criarApp } from './app.js';

const config = lerAmbiente();
const bd = criarBdPostgres(config);
const app = criarApp({ bd, config });

const servidor = app.listen(config.porta, () => {
  console.log(`API à escuta em http://localhost:${config.porta}/api/v1`);
});

// Encerramento limpo (o Render envia SIGTERM ao reiniciar)
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => servidor.close(() => bd.fechar().then(() => process.exit(0))));
}
