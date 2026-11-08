<script setup>
import { ref, watch } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Iniciação: avaliação descritiva por aluno e trimestre (RF33)
const props = defineProps({ id: { type: String, required: true } });
const accao = useAccao();
const trimestre = ref(1);
const textos = ref({});
const turma = usePedido(() => api.get(`/turmas/${props.id}`));
const pauta = usePedido(async () => {
  const p = await api.get(`/turmas/${props.id}/pautas/trimestres/${trimestre.value}`);
  textos.value = Object.fromEntries(p.linhas.map((l) => [l.aluno.id, l.descritiva ?? '']));
  return p;
});
watch(trimestre, () => pauta.executar());

async function gravar() {
  const alunos = turma.dados.value.alunos;
  const corpo = alunos.filter((a) => textos.value[a.id]?.trim()).map((a) => ({ matricula: a.matricula, texto: textos.value[a.id].trim() }));
  if (corpo.length) await accao.correr(() => api.put(`/turmas/${props.id}/avaliacoes-descritivas`, corpo, { trimestre: trimestre.value }), 'Avaliações gravadas.');
}
</script>

<template>
  <RouterLink :to="{ name: 'turma', params: { id } }" class="small">&larr; Turma</RouterLink>
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 my-2">
    <h1 class="h4 mb-0">Avaliação descritiva<template v-if="turma.dados.value"> · {{ turma.dados.value.designacao }}</template></h1>
    <select v-model.number="trimestre" class="form-select w-auto" aria-label="Trimestre">
      <option :value="1">1.º trimestre</option><option :value="2">2.º trimestre</option><option :value="3">3.º trimestre</option>
    </select>
  </div>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <EstadoPedido :carregando="turma.carregando.value || pauta.carregando.value" :erro="turma.erro.value ?? pauta.erro.value" @repetir="pauta.executar()">
    <form v-if="turma.dados.value" @submit.prevent="gravar">
      <div v-if="pauta.dados.value?.publicada" class="alert alert-secondary py-2 small">Este trimestre já foi publicado.</div>
      <div v-for="a in turma.dados.value.alunos" :key="a.id" class="mb-3">
        <label :for="`d-${a.id}`" class="form-label fw-semibold">{{ a.nome }}</label>
        <textarea :id="`d-${a.id}`" v-model="textos[a.id]" class="form-control" rows="2" maxlength="2000"
                  :disabled="pauta.dados.value?.publicada"></textarea>
      </div>
      <button v-if="!pauta.dados.value?.publicada" type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Gravar</button>
    </form>
  </EstadoPedido>
</template>
