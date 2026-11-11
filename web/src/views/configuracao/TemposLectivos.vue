<script setup>
import { ref, watch } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { TURNOS } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Horas de cada tempo lectivo, por turno (usadas nos horários)
const turno = ref('manha');
const accao = useAccao();
const linhas = ref([]);
const { dados, carregando, erro, executar } = usePedido(async () => {
  const r = await api.get('/tempos', { turno: turno.value });
  linhas.value = r.tempos.map((t) => ({ inicio: t.inicio, fim: t.fim }));
  return r;
});
watch(turno, () => { accao.sucesso.value = ''; executar(); });

function acrescentar() {
  const ultimo = linhas.value.at(-1);
  linhas.value.push({ inicio: ultimo?.fim ?? '07:00', fim: '' });
}
async function gravar() {
  const r = await accao.correr(() => api.put(`/tempos/${turno.value}`, linhas.value), `Tempos da ${TURNOS[turno.value].toLowerCase()} gravados.`);
  if (r) dados.value = r;
}
</script>

<template>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <ul class="nav nav-pills mb-3">
    <li v-for="(t, k) in TURNOS" :key="k" class="nav-item">
      <button type="button" class="nav-link" :class="{ active: turno === k }" @click="turno = k">{{ t }}</button>
    </li>
  </ul>
  <EstadoPedido :carregando="carregando" :erro="erro" @repetir="executar()">
    <form class="card card-body shadow-sm" style="max-width: 32rem" @submit.prevent="gravar">
      <p v-if="dados?.predefinidos" class="small text-body-secondary">Horas típicas propostas. Ajuste-as e grave.</p>
      <div v-for="(l, i) in linhas" :key="i" class="d-flex gap-2 align-items-end mb-2">
        <span class="small fw-semibold pb-2" style="width: 4rem">{{ i + 1 }}.º tempo</span>
        <div><label class="form-label small mb-0" :for="`ti-${i}`">Início</label><input :id="`ti-${i}`" v-model="l.inicio" type="time" class="form-control form-control-sm" required /></div>
        <div><label class="form-label small mb-0" :for="`tf-${i}`">Fim</label><input :id="`tf-${i}`" v-model="l.fim" type="time" class="form-control form-control-sm" required /></div>
        <button type="button" class="btn btn-sm btn-outline-danger" :aria-label="`Retirar o ${i + 1}.º tempo`" :disabled="linhas.length === 1" @click="linhas.splice(i, 1)">×</button>
      </div>
      <div class="d-flex gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="linhas.length >= 10" @click="acrescentar">Acrescentar tempo</button>
        <button type="submit" class="btn btn-sm btn-primary" :disabled="accao.ocupado.value">Gravar</button>
      </div>
    </form>
  </EstadoPedido>
</template>
