import { ref } from 'vue';

/**
 * Estado de um pedido à API para os ecrãs: carregando, erro e dados.
 *   const { dados, carregando, erro, executar } = usePedido(() => api.get('/turmas'));
 */
export function usePedido(fn, { inicial = null, imediato = true } = {}) {
  const dados = ref(inicial);
  const carregando = ref(false);
  const erro = ref(null);

  async function executar(...args) {
    carregando.value = true;
    erro.value = null;
    try {
      dados.value = await fn(...args);
      return dados.value;
    } catch (e) {
      erro.value = e;
      return undefined;
    } finally {
      carregando.value = false;
    }
  }

  if (imediato) executar();
  return { dados, carregando, erro, executar };
}

/**
 * Estado de uma acção (gravar, publicar...): a ocupado, erro e mensagem de sucesso.
 */
export function useAccao() {
  const ocupado = ref(false);
  const erro = ref(null);
  const sucesso = ref('');

  async function correr(fn, mensagemSucesso = '') {
    ocupado.value = true;
    erro.value = null;
    sucesso.value = '';
    try {
      const r = await fn();
      sucesso.value = mensagemSucesso;
      return r;
    } catch (e) {
      erro.value = e;
      return undefined;
    } finally {
      ocupado.value = false;
    }
  }
  return { ocupado, erro, sucesso, correr };
}
