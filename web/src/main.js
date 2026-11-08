import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/js/dist/collapse';
import './estilos.css';
import App from './App.vue';
import { criarRouter } from './router/index.js';
import { useAutenticacao, ligarSessao } from './stores/autenticacao.js';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const auth = useAutenticacao(pinia);
const router = criarRouter(auth);
ligarSessao(auth, router);
app.use(router);

// O perfil é carregado antes de montar a aplicação (a guarda chama auth.iniciar()).
router.isReady().then(() => app.mount('#app'));
