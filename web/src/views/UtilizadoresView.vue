<script setup>
import { reactive, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao, NOMES_PERFIL } from '@/stores/autenticacao.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const auth = useAutenticacao();
const filtro = ref('');
const { dados, carregando, erro, executar } = usePedido(
  () => api.get('/utilizadores', { perfil: filtro.value || undefined, limite: 100 }), { inicial: { dados: [] } });
const accao = useAccao();
const credenciais = ref(null);

const novo = reactive({ nome: '', email: '', perfil: 'professor' });
async function criar() {
  const r = await accao.correr(() => api.post('/utilizadores', novo));
  if (r) {
    credenciais.value = { email: r.utilizador.email, palavraPasse: r.palavraPasseProvisoria };
    Object.assign(novo, { nome: '', email: '', perfil: 'professor' });
    executar();
  }
}

async function repor(u) {
  if (!confirm(`Repor a palavra-passe de ${u.nome}?`)) return;
  const r = await accao.correr(() => api.post(`/utilizadores/${u.id}/repor-palavra-passe`));
  if (r) credenciais.value = { email: u.email, palavraPasse: r.palavraPasseProvisoria };
}

async function alternar(u) {
  const estado = u.estado === 'activo' ? 'inactivo' : 'activo';
  await accao.correr(() => api.patch(`/utilizadores/${u.id}`, { estado }), `${u.nome}: conta ${estado === 'activo' ? 'activada' : 'desactivada'}.`);
  executar();
}
</script>

<template>
  <h1 class="h4 mb-3">Utilizadores da escola</h1>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <div v-if="credenciais" class="alert alert-warning" role="alert">
    Entregue estes dados à pessoa; a palavra-passe provisória não volta a ser mostrada e terá de ser trocada no primeiro acesso.
    <div class="mt-2 font-monospace">Email: {{ credenciais.email }}<br />Palavra-passe provisória: {{ credenciais.palavraPasse }}</div>
    <button type="button" class="btn btn-sm btn-outline-dark mt-2" @click="credenciais = null">Já anotei</button>
  </div>

  <form class="card card-body shadow-sm mb-3" @submit.prevent="criar">
    <h2 class="h6">Novo utilizador</h2>
    <div class="row g-2">
      <div class="col-md-4"><label class="form-label" for="u-nome">Nome</label><input id="u-nome" v-model="novo.nome" class="form-control" required /></div>
      <div class="col-md-4"><label class="form-label" for="u-email">Email</label><input id="u-email" v-model="novo.email" type="email" class="form-control" required /></div>
      <div class="col-md-2">
        <label class="form-label" for="u-perfil">Perfil</label>
        <select id="u-perfil" v-model="novo.perfil" class="form-select">
          <option value="professor">Professor(a)</option><option value="secretaria">Secretaria</option><option value="coordenador">Coordenação</option>
        </select>
      </div>
      <div class="col-md-2 d-flex align-items-end"><button type="submit" class="btn btn-primary w-100" :disabled="accao.ocupado.value">Criar</button></div>
    </div>
  </form>

  <div class="d-flex gap-2 align-items-center mb-2">
    <label for="f-perfil" class="small">Perfil</label>
    <select id="f-perfil" v-model="filtro" class="form-select form-select-sm w-auto" @change="executar()">
      <option value="">Todos</option>
      <option v-for="(t, k) in NOMES_PERFIL" v-show="k !== 'admin_plataforma'" :key="k" :value="k">{{ t }}</option>
    </select>
  </div>
  <EstadoPedido :carregando="carregando" :erro="erro" :vazio="dados.dados.length === 0" @repetir="executar()">
    <div class="table-responsive card shadow-sm">
      <table class="table table-hover mb-0 align-middle">
        <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in dados.dados" :key="u.id">
            <td>{{ u.nome }}</td><td class="small">{{ u.email }}</td><td>{{ NOMES_PERFIL[u.perfil] }}</td>
            <td><span class="badge" :class="u.estado === 'activo' ? 'text-bg-success' : 'text-bg-secondary'">{{ u.estado }}</span></td>
            <td class="text-end text-nowrap">
              <template v-if="u.id !== auth.utilizador.id">
                <button type="button" class="btn btn-sm btn-outline-secondary me-1" @click="repor(u)">Repor palavra-passe</button>
                <button type="button" class="btn btn-sm" :class="u.estado === 'activo' ? 'btn-outline-danger' : 'btn-outline-success'"
                        @click="alternar(u)">{{ u.estado === 'activo' ? 'Desactivar' : 'Activar' }}</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </EstadoPedido>
</template>
