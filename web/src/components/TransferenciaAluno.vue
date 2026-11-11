<script setup>
import { computed, ref } from 'vue';
import { api, descarregar } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { dataHora } from '@/util/formatar.js';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Transferência do aluno para outra escola da plataforma: emitir a guia, descarregar o PDF, cancelar
const props = defineProps({ aluno: { type: Object, required: true } });
const emit = defineEmits(['alterado']);
const accao = useAccao();
const guias = usePedido(() => api.get('/transferencias', { aluno: props.aluno.id }), { inicial: [] });
const escolas = usePedido(() => api.get('/transferencias/escolas'), { inicial: [] });
const escolaDestino = ref('');
const motivo = ref('');
const pendente = computed(() => guias.dados.value.find((g) => g.estado === 'pendente'));
const temMatriculaActiva = computed(() => (props.aluno.matriculas ?? []).some((m) => m.estado === 'activa'));
const ESTADOS = { pendente: 'text-bg-warning', aceite: 'text-bg-success', recusada: 'text-bg-danger', cancelada: 'text-bg-secondary' };

const pdf = (g) => accao.correr(() => descarregar(`/transferencias/${g.id}/guia`, `guia-transferencia-${g.codigo}.pdf`));
async function emitir() {
  if (!confirm('Emitir a guia de transferência? A matrícula só passa a "transferida" quando a escola de destino a aceitar.')) return;
  const g = await accao.correr(() => api.post(`/alunos/${props.aluno.id}/transferencias`, { escolaDestino: escolaDestino.value, motivo: motivo.value }),
    'Guia emitida. Entregue o PDF (com o código) ao encarregado.');
  if (g) {
    motivo.value = '';
    await guias.executar();
    await pdf(g);
  }
}
async function cancelar(g) {
  const m = prompt('Cancelar a guia de transferência? Indique o motivo:');
  if (!m || m.trim().length < 3) return;
  if (await accao.correr(() => api.post(`/transferencias/${g.id}/cancelar`, { motivo: m.trim() }), 'Guia cancelada.')) {
    guias.executar();
    emit('alterado');
  }
}
</script>

<template>
  <div class="card shadow-sm mt-3">
    <div class="card-header">Transferência para outra escola</div>
    <div class="card-body">
      <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
      <ul v-if="guias.dados.value.length" class="list-group mb-3">
        <li v-for="g in guias.dados.value" :key="g.id" class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span>
            <span class="badge me-1" :class="ESTADOS[g.estado]">{{ g.estado }}</span>
            <strong>{{ g.escolaDestino }}</strong> · código <code>{{ g.codigo }}</code>
            <span class="small text-body-secondary d-block">{{ dataHora(g.criadoEm) }} · {{ g.motivo }}<template v-if="g.resposta"> · resposta: {{ g.resposta }}</template></span>
          </span>
          <span class="d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-primary" @click="pdf(g)">Guia (PDF)</button>
            <button v-if="g.estado === 'pendente'" type="button" class="btn btn-sm btn-outline-danger" @click="cancelar(g)">Cancelar</button>
          </span>
        </li>
      </ul>
      <p v-if="!temMatriculaActiva" class="small text-body-secondary mb-0">Só se transfere um aluno com matrícula activa no ano lectivo activo.</p>
      <p v-else-if="pendente" class="small text-body-secondary mb-0">
        Há uma guia pendente. Quando a escola de destino introduzir o código <code>{{ pendente.codigo }}</code>, a matrícula passa a "transferida".
      </p>
      <form v-else class="row g-2 align-items-end" @submit.prevent="emitir">
        <div class="col-12 col-md-5"><label class="form-label small mb-0" for="tr-escola">Escola de destino</label>
          <select id="tr-escola" v-model="escolaDestino" class="form-select form-select-sm" required>
            <option value="" disabled>—</option>
            <option v-for="e in escolas.dados.value" :key="e.id" :value="e.id">{{ e.nome }} ({{ e.municipio }})</option>
          </select></div>
        <div class="col-12 col-md-5"><label class="form-label small mb-0" for="tr-motivo">Motivo</label>
          <input id="tr-motivo" v-model="motivo" class="form-control form-control-sm" required minlength="3" maxlength="300" placeholder="Ex.: mudança de residência" /></div>
        <div class="col-12 col-md-2"><button type="submit" class="btn btn-sm btn-outline-primary w-100" :disabled="accao.ocupado.value">Emitir guia</button></div>
        <p class="small text-body-secondary mb-0">Com propinas em atraso, a guia não é emitida. Os dados só passam quando a escola de destino aceitar.</p>
      </form>
    </div>
  </div>
</template>
