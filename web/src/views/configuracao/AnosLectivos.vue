<script setup>
import { reactive } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { data as fData } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const { dados, carregando, erro, executar } = usePedido(() => api.get('/anos-lectivos'), { inicial: [] });
const accao = useAccao();

const ano = new Date().getFullYear();
const novo = reactive({
  designacao: `${ano}/${ano + 1}`,
  trimestres: [
    { numero: 1, inicio: `${ano}-09-01`, fim: `${ano}-12-18`, aberto: true },
    { numero: 2, inicio: `${ano + 1}-01-04`, fim: `${ano + 1}-04-02`, aberto: false },
    { numero: 3, inicio: `${ano + 1}-04-12`, fim: `${ano + 1}-07-16`, aberto: false },
  ],
});

async function criar() {
  await accao.correr(() => api.post('/anos-lectivos', novo), 'Ano lectivo criado.');
  executar();
}
async function activar(a) {
  await accao.correr(() => api.post(`/anos-lectivos/${a.id}/activar`), `${a.designacao} é agora o ano lectivo activo.`);
  executar();
}
/** Abrir ou fechar um trimestre para o lançamento de notas. */
async function alternarTrimestre(a, t) {
  const trimestres = a.trimestres.map((x) => (x.numero === t.numero ? { ...x, aberto: !x.aberto } : x));
  await accao.correr(() => api.patch(`/anos-lectivos/${a.id}`, { trimestres }),
    `${t.numero}.º trimestre ${t.aberto ? 'fechado' : 'aberto'} para lançamento.`);
  executar();
}
</script>

<template>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <EstadoPedido :carregando="carregando" :erro="erro" :vazio="dados.length === 0" texto-vazio="Ainda não há anos lectivos." @repetir="executar()">
    <div v-for="a in dados" :key="a.id" class="card shadow-sm mb-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>{{ a.designacao }}</strong>
        <span v-if="a.activo" class="badge text-bg-success">Activo</span>
        <button v-else type="button" class="btn btn-sm btn-outline-success" @click="activar(a)">Tornar activo</button>
      </div>
      <ul class="list-group list-group-flush">
        <li v-for="t in a.trimestres" :key="t.numero" class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span>{{ t.numero }}.º trimestre: {{ fData(t.inicio) }} a {{ fData(t.fim) }}</span>
          <span class="d-flex align-items-center gap-2">
            <span class="badge" :class="t.aberto ? 'text-bg-primary' : 'text-bg-secondary'">{{ t.aberto ? 'Aberto para notas' : 'Fechado' }}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary" @click="alternarTrimestre(a, t)">{{ t.aberto ? 'Fechar' : 'Abrir' }}</button>
          </span>
        </li>
      </ul>
    </div>
  </EstadoPedido>

  <form class="card card-body shadow-sm" @submit.prevent="criar">
    <h2 class="h6">Novo ano lectivo</h2>
    <div class="row g-2">
      <div class="col-md-3"><label class="form-label" for="a-des">Designação</label><input id="a-des" v-model="novo.designacao" class="form-control" pattern="\d{4}/\d{4}" required /></div>
    </div>
    <div v-for="t in novo.trimestres" :key="t.numero" class="row g-2 mt-1 align-items-end">
      <div class="col-4 col-md-2 small fw-semibold pb-2">{{ t.numero }}.º trimestre</div>
      <div class="col-4 col-md-3"><label class="form-label small" :for="`ti${t.numero}`">Início</label><input :id="`ti${t.numero}`" v-model="t.inicio" type="date" class="form-control" required /></div>
      <div class="col-4 col-md-3"><label class="form-label small" :for="`tf${t.numero}`">Fim</label><input :id="`tf${t.numero}`" v-model="t.fim" type="date" class="form-control" required /></div>
    </div>
    <div class="mt-3"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Criar ano lectivo</button></div>
  </form>
</template>
