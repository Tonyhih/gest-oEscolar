<script setup>
import { computed, reactive, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const classes = usePedido(() => api.get('/classes'), { inicial: [] });
const catalogo = usePedido(() => api.get('/catalogo/classes'), { inicial: [] });
const accao = useAccao();

const nova = reactive({ codigo: '7', ramo: 'geral' });
const doCatalogo = computed(() => catalogo.dados.value.find((c) => c.codigo === nova.codigo));
async function oferecer() {
  const ramo = nova.codigo === '13' ? 'tecnico_profissional' : doCatalogo.value?.ciclo === 'ii_ciclo' ? nova.ramo : 'geral';
  await accao.correr(() => api.post('/classes', { codigo: nova.codigo, ramo }), 'Classe adicionada com as regras de avaliação por omissão.');
  classes.executar();
}

// Edição das regras de avaliação de uma classe (RF14)
const emEdicao = ref(null);
function editar(c) {
  emEdicao.value = { id: c.id, designacao: c.designacao, escalaMaxima: c.escalaMaxima, notaMinimaAprovacao: c.notaMinimaAprovacao,
                     minimoNegativa: c.minimoNegativa, maxNegativas: c.maxNegativas, classeDeExame: c.classeDeExame };
}
async function gravar() {
  const { id, designacao, ...cfg } = emEdicao.value;
  await accao.correr(() => api.patch(`/classes/${id}`, cfg), `Regras de ${designacao} actualizadas.`);
  if (!accao.erro.value) { emEdicao.value = null; classes.executar(); }
}

const modo = (c) => (c.avaliacaoQualitativa ? 'Descritiva' : c.apenasEstagio ? 'Estágio e TFC' : c.classeDeExame ? 'Classe de exame' : 'Normal');
</script>

<template>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <form class="card card-body shadow-sm mb-3" @submit.prevent="oferecer">
    <h2 class="h6">Oferecer uma classe</h2>
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-3">
        <label class="form-label" for="c-cod">Classe</label>
        <select id="c-cod" v-model="nova.codigo" class="form-select">
          <option v-for="c in catalogo.dados.value" :key="c.codigo" :value="c.codigo">{{ c.designacao }}</option>
        </select>
      </div>
      <div v-if="doCatalogo?.ciclo === 'ii_ciclo' && nova.codigo !== '13'" class="col-6 col-md-3">
        <label class="form-label" for="c-ramo">Ramo</label>
        <select id="c-ramo" v-model="nova.ramo" class="form-select">
          <option value="geral">Ensino geral</option><option value="tecnico_profissional">Técnico-profissional</option>
        </select>
      </div>
      <div class="col-12 col-md-3"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Adicionar</button></div>
    </div>
    <p class="form-text mb-0">As regras confirmadas são aplicadas por omissão: Primário 0–10 (aprovação ≥ 5), restantes 0–20 (≥ 10);
      exame na 6.ª, 9.ª e 12.ª; Iniciação descritiva; 13.ª só estágio. Pode ajustá-las depois.</p>
  </form>

  <EstadoPedido :carregando="classes.carregando.value" :erro="classes.erro.value" :vazio="classes.dados.value.length === 0"
                texto-vazio="A escola ainda não oferece nenhuma classe." @repetir="classes.executar()">
    <div class="table-responsive card shadow-sm">
      <table class="table table-sm table-hover mb-0 align-middle">
        <thead><tr><th>Classe</th><th>Avaliação</th><th>Escala</th><th>Aprovação</th><th>Transição</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in classes.dados.value" :key="c.id">
            <td>{{ c.designacao }}</td>
            <td>{{ modo(c) }}</td>
            <td>0–{{ c.escalaMaxima }}</td>
            <td>≥ {{ c.notaMinimaAprovacao }}</td>
            <td class="small">
              <template v-if="c.classeDeExame">Todas positivas</template>
              <template v-else-if="c.avaliacaoQualitativa || c.apenasEstagio">—</template>
              <template v-else>Até {{ c.maxNegativas }} negativas &gt; {{ c.minimoNegativa }}, fora das disciplinas-chave</template>
            </td>
            <td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" @click="editar(c)">Regras</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </EstadoPedido>

  <form v-if="emEdicao" class="card card-body shadow-sm mt-3" @submit.prevent="gravar">
    <h2 class="h6">Regras de avaliação: {{ emEdicao.designacao }}</h2>
    <div class="row g-2">
      <div class="col-6 col-md-2">
        <label class="form-label" for="r-esc">Escala</label>
        <select id="r-esc" v-model.number="emEdicao.escalaMaxima" class="form-select"><option :value="10">0–10</option><option :value="20">0–20</option></select>
      </div>
      <div class="col-6 col-md-2"><label class="form-label" for="r-apr">Aprovação ≥</label><input id="r-apr" v-model.number="emEdicao.notaMinimaAprovacao" type="number" step="0.5" min="0" max="20" class="form-control" /></div>
      <div class="col-6 col-md-3"><label class="form-label" for="r-min">Negativa tem de ser &gt;</label><input id="r-min" v-model.number="emEdicao.minimoNegativa" type="number" step="0.5" min="0" max="20" class="form-control" /></div>
      <div class="col-6 col-md-2"><label class="form-label" for="r-max">Máx. negativas</label><input id="r-max" v-model.number="emEdicao.maxNegativas" type="number" min="0" max="10" class="form-control" /></div>
      <div class="col-12 col-md-3 d-flex align-items-end">
        <div class="form-check"><input id="r-ex" v-model="emEdicao.classeDeExame" class="form-check-input" type="checkbox" /><label class="form-check-label" for="r-ex">Classe de exame</label></div>
      </div>
    </div>
    <div class="mt-3 d-flex gap-2">
      <button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Gravar</button>
      <button type="button" class="btn btn-outline-secondary" @click="emEdicao = null">Cancelar</button>
    </div>
  </form>
</template>
