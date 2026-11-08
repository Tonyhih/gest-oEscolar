<script setup>
import { reactive } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const cursos = usePedido(() => api.get('/cursos'), { inicial: [] });
const disciplinas = usePedido(() => api.get('/disciplinas'), { inicial: [] });
const accao = useAccao();

const curso = reactive({ nome: '', sigla: '', ramo: 'tecnico_profissional' });
const disciplina = reactive({ nome: '', sigla: '' });

async function criarCurso() {
  await accao.correr(() => api.post('/cursos', curso), 'Curso criado.');
  if (!accao.erro.value) { Object.assign(curso, { nome: '', sigla: '' }); cursos.executar(); }
}
async function criarDisciplina() {
  await accao.correr(() => api.post('/disciplinas', disciplina), 'Disciplina criada.');
  if (!accao.erro.value) { Object.assign(disciplina, { nome: '', sigla: '' }); disciplinas.executar(); }
}
</script>

<template>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <div class="row g-3">
    <section class="col-lg-6" aria-labelledby="t-cursos">
      <h2 id="t-cursos" class="h6">Cursos e áreas do II Ciclo</h2>
      <EstadoPedido :carregando="cursos.carregando.value" :erro="cursos.erro.value" :vazio="cursos.dados.value.length === 0"
                    texto-vazio="Sem cursos. O Primário e o I Ciclo não precisam de cursos." @repetir="cursos.executar()">
        <ul class="list-group shadow-sm mb-2">
          <li v-for="c in cursos.dados.value" :key="c.id" class="list-group-item d-flex justify-content-between">
            <span>{{ c.nome }} <span class="text-body-secondary">({{ c.sigla }})</span></span>
            <span class="small text-body-secondary">{{ c.ramo === 'geral' ? 'Ensino geral' : 'Técnico-profissional' }}</span>
          </li>
        </ul>
      </EstadoPedido>
      <form class="card card-body shadow-sm" @submit.prevent="criarCurso">
        <div class="row g-2">
          <div class="col-12"><label class="form-label" for="cu-nome">Nome</label><input id="cu-nome" v-model="curso.nome" class="form-control" required /></div>
          <div class="col-4"><label class="form-label" for="cu-sig">Sigla</label><input id="cu-sig" v-model="curso.sigla" class="form-control" required /></div>
          <div class="col-8">
            <label class="form-label" for="cu-ramo">Ramo</label>
            <select id="cu-ramo" v-model="curso.ramo" class="form-select"><option value="tecnico_profissional">Técnico-profissional</option><option value="geral">Ensino geral (área)</option></select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary mt-2 align-self-start" :disabled="accao.ocupado.value">Criar curso</button>
      </form>
    </section>

    <section class="col-lg-6" aria-labelledby="t-disc">
      <h2 id="t-disc" class="h6">Disciplinas</h2>
      <EstadoPedido :carregando="disciplinas.carregando.value" :erro="disciplinas.erro.value" :vazio="disciplinas.dados.value.length === 0" @repetir="disciplinas.executar()">
        <ul class="list-group shadow-sm mb-2">
          <li v-for="d in disciplinas.dados.value" :key="d.id" class="list-group-item d-flex justify-content-between">
            <span>{{ d.nome }}</span><span class="badge text-bg-light border">{{ d.sigla }}</span>
          </li>
        </ul>
      </EstadoPedido>
      <form class="card card-body shadow-sm" @submit.prevent="criarDisciplina">
        <div class="row g-2">
          <div class="col-8"><label class="form-label" for="di-nome">Nome</label><input id="di-nome" v-model="disciplina.nome" class="form-control" required /></div>
          <div class="col-4"><label class="form-label" for="di-sig">Sigla</label><input id="di-sig" v-model="disciplina.sigla" class="form-control" required /></div>
        </div>
        <button type="submit" class="btn btn-primary mt-2 align-self-start" :disabled="accao.ocupado.value">Criar disciplina</button>
      </form>
    </section>
  </div>
</template>
