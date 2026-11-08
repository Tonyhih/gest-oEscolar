<script setup>
import { ref, watch } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Dados da escola usados nos documentos (o decreto de criação aparece no certificado)
const { dados, carregando, erro, executar } = usePedido(() => api.get('/escola'));
const accao = useAccao();
const decreto = ref('');
watch(dados, (e) => { decreto.value = e?.decretoCriacao ?? ''; });
const NATUREZA = { publica: 'Pública', privada: 'Privada', comparticipada: 'Comparticipada' };

async function gravar() {
  const r = await accao.correr(() => api.patch('/escola', { decretoCriacao: decreto.value }), 'Dados da escola gravados.');
  if (r) dados.value = r;
}
</script>

<template>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <EstadoPedido :carregando="carregando" :erro="erro" @repetir="executar()">
    <form v-if="dados" class="card card-body shadow-sm" @submit.prevent="gravar">
      <dl class="row mb-3">
        <dt class="col-sm-3">Nome</dt><dd class="col-sm-9">{{ dados.nome }}</dd>
        <dt class="col-sm-3">Código</dt><dd class="col-sm-9">{{ dados.codigo }}</dd>
        <dt class="col-sm-3">Local</dt><dd class="col-sm-9">{{ dados.municipio }}, {{ dados.provincia }}</dd>
        <dt class="col-sm-3">Natureza</dt><dd class="col-sm-9">{{ NATUREZA[dados.natureza] }}</dd>
      </dl>
      <p class="small text-body-secondary">O nome, o código e o local são alterados pela administração da plataforma.</p>
      <div class="row g-2 align-items-end">
        <div class="col-md-6">
          <label class="form-label" for="decreto">Decreto executivo de criação</label>
          <input id="decreto" v-model="decreto" class="form-control" placeholder="Ex.: 123/2015, de 10 de Março" required minlength="3" aria-describedby="decreto-ajuda" />
          <div id="decreto-ajuda" class="form-text">Aparece nos certificados: "… criado sob o Decreto Executivo n.º …".</div>
        </div>
        <div class="col-md-3"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Gravar</button></div>
      </div>
    </form>
  </EstadoPedido>
</template>
