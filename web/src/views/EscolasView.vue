<script setup>
import { reactive, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const { dados, carregando, erro, executar } = usePedido(() => api.get('/plataforma/escolas', { limite: 100 }), { inicial: { dados: [] } });
const accao = useAccao();
const CICLOS = { primario: 'Primário', i_ciclo: 'I Ciclo', ii_ciclo_geral: 'II Ciclo – Geral', ii_ciclo_tecnico: 'II Ciclo – Técnico-Profissional' };

const nova = reactive({ nome: '', codigo: '', provincia: '', municipio: '', natureza: 'publica', ciclos: [] });
const mostrarForm = ref(false);
async function criar() {
  await accao.correr(() => api.post('/plataforma/escolas', nova), 'Escola registada.');
  if (!accao.erro.value) {
    Object.assign(nova, { nome: '', codigo: '', provincia: '', municipio: '', natureza: 'publica', ciclos: [] });
    mostrarForm.value = false;
    executar();
  }
}

async function alternar(escola) {
  const estado = escola.estado === 'activo' ? 'inactivo' : 'activo';
  if (estado === 'inactivo' && !confirm(`Desactivar "${escola.nome}"? Nenhum utilizador da escola conseguirá entrar.`)) return;
  await accao.correr(() => api.patch(`/plataforma/escolas/${escola.id}`, { estado }), `Escola ${estado === 'activo' ? 'activada' : 'desactivada'}.`);
  executar();
}

// Criar director: a palavra-passe provisória só é mostrada uma vez
const director = reactive({ escolaId: null, nome: '', email: '' });
const credenciais = ref(null);
async function criarDirector() {
  const r = await accao.correr(() => api.post(`/plataforma/escolas/${director.escolaId}/director`, { nome: director.nome, email: director.email }));
  if (r) {
    credenciais.value = { email: r.utilizador.email, palavraPasse: r.palavraPasseProvisoria };
    Object.assign(director, { escolaId: null, nome: '', email: '' });
  }
}
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <h1 class="h4 mb-0">Escolas</h1>
    <button type="button" class="btn btn-primary" @click="mostrarForm = !mostrarForm">{{ mostrarForm ? 'Cancelar' : 'Registar escola' }}</button>
  </div>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <div v-if="credenciais" class="alert alert-warning" role="alert">
    <strong>Conta do director criada.</strong> Entregue estes dados ao director; a palavra-passe não volta a ser mostrada.
    <div class="mt-2 font-monospace">Email: {{ credenciais.email }}<br />Palavra-passe provisória: {{ credenciais.palavraPasse }}</div>
    <button type="button" class="btn btn-sm btn-outline-dark mt-2" @click="credenciais = null">Já anotei</button>
  </div>

  <form v-if="mostrarForm" class="card card-body shadow-sm mb-3" @submit.prevent="criar">
    <div class="row g-2">
      <div class="col-md-6"><label class="form-label" for="e-nome">Nome</label><input id="e-nome" v-model="nova.nome" class="form-control" required /></div>
      <div class="col-md-2"><label class="form-label" for="e-cod">Código</label><input id="e-cod" v-model="nova.codigo" class="form-control" placeholder="LDA-101" required /></div>
      <div class="col-md-2"><label class="form-label" for="e-prov">Província</label><input id="e-prov" v-model="nova.provincia" class="form-control" required /></div>
      <div class="col-md-2"><label class="form-label" for="e-mun">Município</label><input id="e-mun" v-model="nova.municipio" class="form-control" required /></div>
      <div class="col-md-3">
        <label class="form-label" for="e-nat">Natureza</label>
        <select id="e-nat" v-model="nova.natureza" class="form-select">
          <option value="publica">Pública</option><option value="privada">Privada</option><option value="comparticipada">Comparticipada</option>
        </select>
      </div>
      <fieldset class="col-md-9">
        <legend class="form-label fs-6">Níveis que oferece</legend>
        <div v-for="(t, k) in CICLOS" :key="k" class="form-check form-check-inline">
          <input :id="`c-${k}`" v-model="nova.ciclos" class="form-check-input" type="checkbox" :value="k" />
          <label class="form-check-label" :for="`c-${k}`">{{ t }}</label>
        </div>
      </fieldset>
    </div>
    <div class="mt-3"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value || !nova.ciclos.length">Gravar</button></div>
  </form>

  <EstadoPedido :carregando="carregando" :erro="erro" :vazio="dados.dados.length === 0" @repetir="executar()">
    <div class="table-responsive card shadow-sm">
      <table class="table table-hover mb-0 align-middle">
        <thead><tr><th>Escola</th><th>Local</th><th>Níveis</th><th class="text-end">Alunos</th><th class="text-end">Turmas</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in dados.dados" :key="e.id">
            <td><strong>{{ e.nome }}</strong><br /><span class="small text-body-secondary">{{ e.codigo }}</span></td>
            <td>{{ e.municipio }}, {{ e.provincia }}</td>
            <td class="small">{{ e.ciclos.map((c) => CICLOS[c]).join(', ') }}</td>
            <td class="text-end">{{ e.totalAlunos }}</td>
            <td class="text-end">{{ e.totalTurmas }}</td>
            <td><span class="badge" :class="e.estado === 'activo' ? 'text-bg-success' : 'text-bg-secondary'">{{ e.estado }}</span></td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-outline-secondary me-1" @click="director.escolaId = e.id">Director</button>
              <button type="button" class="btn btn-sm" :class="e.estado === 'activo' ? 'btn-outline-danger' : 'btn-outline-success'"
                      @click="alternar(e)">{{ e.estado === 'activo' ? 'Desactivar' : 'Activar' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </EstadoPedido>

  <form v-if="director.escolaId" class="card card-body shadow-sm mt-3" @submit.prevent="criarDirector">
    <h2 class="h6">Conta do director: {{ dados.dados.find((e) => e.id === director.escolaId)?.nome }}</h2>
    <div class="row g-2">
      <div class="col-md-5"><label class="form-label" for="d-nome">Nome</label><input id="d-nome" v-model="director.nome" class="form-control" required /></div>
      <div class="col-md-5"><label class="form-label" for="d-email">Email</label><input id="d-email" v-model="director.email" type="email" class="form-control" required /></div>
      <div class="col-md-2 d-flex align-items-end gap-1">
        <button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Criar</button>
        <button type="button" class="btn btn-outline-secondary" @click="director.escolaId = null">Fechar</button>
      </div>
    </div>
  </form>
</template>
