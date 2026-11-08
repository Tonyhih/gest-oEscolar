<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const auth = useAutenticacao();
const router = useRouter();
const pesquisa = ref('');
const pagina = ref(1);
const { dados, carregando, erro, executar } = usePedido(
  () => api.get('/alunos', { pesquisa: pesquisa.value || undefined, pagina: pagina.value, limite: 20 }),
  { inicial: { dados: [], total: 0, pagina: 1, limite: 20 } });

let espera;
function pesquisar() {
  clearTimeout(espera);
  espera = setTimeout(() => { pagina.value = 1; executar(); }, 300);
}
function irPara(p) { pagina.value = p; executar(); }

const mostrarForm = ref(false);
const accao = useAccao();
const novo = reactive({ nome: '', dataNascimento: '', sexo: 'F', numeroProcesso: '', naturalidade: '', morada: '', telefone: '' });
async function criar() {
  const corpo = Object.fromEntries(Object.entries(novo).filter(([, v]) => v !== ''));
  const r = await accao.correr(() => api.post('/alunos', corpo));
  if (r) router.push({ name: 'aluno', params: { id: r.id } });
}
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <h1 class="h4 mb-0">Alunos</h1>
    <button v-if="auth.perfil === 'secretaria'" type="button" class="btn btn-primary" @click="mostrarForm = !mostrarForm">
      {{ mostrarForm ? 'Cancelar' : 'Registar aluno' }}
    </button>
  </div>

  <form v-if="mostrarForm" class="card card-body shadow-sm mb-3" @submit.prevent="criar">
    <MensagemAccao :erro="accao.erro.value" />
    <div class="row g-2">
      <div class="col-md-6"><label class="form-label" for="a-nome">Nome completo</label><input id="a-nome" v-model="novo.nome" class="form-control" required /></div>
      <div class="col-6 col-md-3"><label class="form-label" for="a-nasc">Data de nascimento</label><input id="a-nasc" v-model="novo.dataNascimento" type="date" class="form-control" required /></div>
      <div class="col-6 col-md-3">
        <label class="form-label" for="a-sexo">Sexo</label>
        <select id="a-sexo" v-model="novo.sexo" class="form-select"><option value="F">Feminino</option><option value="M">Masculino</option></select>
      </div>
      <div class="col-md-3"><label class="form-label" for="a-proc">N.º de processo</label><input id="a-proc" v-model="novo.numeroProcesso" class="form-control" aria-describedby="a-proc-ajuda" />
        <div id="a-proc-ajuda" class="form-text">Deixe vazio para gerar automaticamente.</div></div>
      <div class="col-md-3"><label class="form-label" for="a-nat">Naturalidade</label><input id="a-nat" v-model="novo.naturalidade" class="form-control" /></div>
      <div class="col-md-3"><label class="form-label" for="a-tel">Telefone</label><input id="a-tel" v-model="novo.telefone" type="tel" class="form-control" placeholder="+244 9xx xxx xxx" /></div>
      <div class="col-md-3"><label class="form-label" for="a-mor">Morada</label><input id="a-mor" v-model="novo.morada" class="form-control" /></div>
    </div>
    <div class="mt-3"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Registar</button></div>
  </form>

  <div class="mb-2">
    <label for="pesquisa" class="visually-hidden">Pesquisar alunos</label>
    <input id="pesquisa" v-model="pesquisa" type="search" class="form-control" placeholder="Pesquisar por nome ou n.º de processo" @input="pesquisar" />
  </div>
  <EstadoPedido :carregando="carregando" :erro="erro" :vazio="dados.dados.length === 0"
                :texto-vazio="pesquisa ? 'Nenhum aluno encontrado.' : 'Ainda não há alunos registados.'" @repetir="executar()">
    <div class="list-group shadow-sm">
      <RouterLink v-for="a in dados.dados" :key="a.id" :to="{ name: 'aluno', params: { id: a.id } }"
                  class="list-group-item list-group-item-action d-flex flex-wrap justify-content-between gap-2">
        <span><strong>{{ a.nome }}</strong> <span class="small text-body-secondary">{{ a.numeroProcesso }}</span></span>
        <span class="small">{{ a.turma ?? 'Sem matrícula activa' }}<span v-if="a.estado !== 'activo'" class="badge text-bg-secondary ms-1">inactivo</span></span>
      </RouterLink>
    </div>
    <nav v-if="dados.total > dados.limite" class="mt-2" aria-label="Páginas">
      <ul class="pagination pagination-sm">
        <li class="page-item" :class="{ disabled: dados.pagina === 1 }"><button type="button" class="page-link" @click="irPara(dados.pagina - 1)">Anterior</button></li>
        <li class="page-item disabled"><span class="page-link">{{ dados.pagina }} / {{ Math.ceil(dados.total / dados.limite) }}</span></li>
        <li class="page-item" :class="{ disabled: dados.pagina * dados.limite >= dados.total }"><button type="button" class="page-link" @click="irPara(dados.pagina + 1)">Seguinte</button></li>
      </ul>
    </nav>
  </EstadoPedido>
</template>
