<script setup>
import { computed, ref } from 'vue';
import { api, descarregar } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { dataHora } from '@/util/formatar.js';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Termo de frequência e aproveitamento e certificados (modelos do MED) de um aluno
const props = defineProps({ aluno: { type: Object, required: true } });
const accao = useAccao();
const documentos = usePedido(() => api.get(`/alunos/${props.aluno.id}/documentos`), { inicial: [] });

// ---------------------------------------------------------------- Termo
const anos = computed(() => [...new Map((props.aluno.matriculas ?? []).filter((m) => m.estado !== 'anulada')
  .map((m) => [m.anoLectivo, m])).values()]);
const anoTermo = ref(anos.value[0]?.anoLectivo ?? '');
const termo = () => accao.correr(() => descarregar(`/alunos/${props.aluno.id}/termo`,
  `termo-${props.aluno.numeroProcesso}.pdf`, { anoLectivo: anoTermo.value || undefined }));

// ---------------------------------------------------------------- Certificado
const CICLOS = { primario: 'Ensino Primário (2.ª, 4.ª e 6.ª classes)', i_ciclo: 'I Ciclo do Ensino Secundário (7.ª, 8.ª e 9.ª classes)' };
const ciclo = ref('i_ciclo');
const previa = ref(null);
const livroRegisto = ref('');
const conferidoPor = ref('');
async function verificar() {
  previa.value = await accao.correr(() => api.get(`/alunos/${props.aluno.id}/certificados/previa`, { ciclo: ciclo.value }));
}
async function emitir(rascunho) {
  if (!rascunho && !confirm('Emitir o certificado com o número seguinte? Um certificado emitido não se pode apagar.')) return;
  const corpo = { ciclo: ciclo.value, rascunho, livroRegisto: livroRegisto.value || undefined, conferidoPor: conferidoPor.value || undefined };
  const doc = await accao.correr(() => api.post(`/alunos/${props.aluno.id}/certificados`, corpo),
    rascunho ? 'Rascunho gerado.' : 'Certificado emitido.');
  if (doc) {
    await descarregar(`/documentos/${doc.id}/pdf`, `certificado-${doc.numeroTexto.replace('/', '-')}.pdf`);
    documentos.executar();
  }
}
const reimprimir = (d) => accao.correr(() => descarregar(`/documentos/${d.id}/pdf`, `certificado-${d.numeroTexto.replace('/', '-')}.pdf`));
</script>

<template>
  <div class="card shadow-sm mt-3">
    <div class="card-header">Documentos</div>
    <div class="card-body">
      <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

      <h3 class="h6">Termo de frequência e aproveitamento</h3>
      <div class="d-flex flex-wrap gap-2 align-items-end mb-4">
        <div><label class="form-label small mb-0" for="t-ano">Ano lectivo</label>
          <select id="t-ano" v-model="anoTermo" class="form-select form-select-sm" :disabled="!anos.length">
            <option v-for="m in anos" :key="m.anoLectivo" :value="m.anoLectivo">{{ m.anoLectivoDesignacao }} · {{ m.turmaDesignacao }}</option>
          </select></div>
        <button type="button" class="btn btn-sm btn-outline-primary" :disabled="!anos.length || accao.ocupado.value" @click="termo">Descarregar PDF</button>
        <span v-if="!anos.length" class="small text-body-secondary">O aluno ainda não tem matrículas.</span>
      </div>

      <h3 class="h6">Certificado</h3>
      <div class="d-flex flex-wrap gap-2 align-items-end">
        <div><label class="form-label small mb-0" for="c-ciclo">Ciclo concluído</label>
          <select id="c-ciclo" v-model="ciclo" class="form-select form-select-sm" @change="previa = null">
            <option v-for="(t, k) in CICLOS" :key="k" :value="k">{{ t }}</option>
          </select></div>
        <button type="button" class="btn btn-sm btn-outline-primary" :disabled="accao.ocupado.value" @click="verificar">Verificar dados</button>
      </div>

      <template v-if="previa">
        <div v-if="!previa.completo" class="alert alert-warning small mt-2 mb-2" role="status">
          <strong>Ainda não se pode emitir:</strong>
          <ul class="mb-0">
            <li v-for="f in previa.emFalta" :key="f">falta a {{ f }}</li>
            <li v-for="f in previa.dadosEmFalta" :key="f">falta o {{ f }} (edite os dados do aluno acima)</li>
          </ul>
          Pode gerar um <strong>rascunho</strong> para conferir, sem número e sem valor legal.
        </div>
        <div v-else class="alert alert-success small mt-2 mb-2" role="status">
          Tudo pronto. Média final: <strong>{{ previa.mediaGeral }}</strong> valores · concluiu em {{ previa.anoConclusao }}.
        </div>
        <div v-if="previa.disciplinas.length" class="table-responsive">
          <table class="table table-sm table-bordered text-center small mb-2">
            <thead><tr><th class="text-start">Disciplina</th><th v-for="c in previa.classes" :key="c.codigo">{{ c.codigo }}.ª<br /><span class="fw-normal">{{ c.ano ?? '—' }}</span></th><th>Média</th></tr></thead>
            <tbody>
              <tr v-for="d in previa.disciplinas" :key="d.id">
                <td class="text-start">{{ d.nome }}</td><td v-for="(n, i) in d.notas" :key="i">{{ n ?? '—' }}</td><td class="fw-semibold">{{ d.media ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="row g-2 align-items-end">
          <div class="col-6 col-md-3"><label class="form-label small mb-0" for="c-livro">Livro de registo n.º</label><input id="c-livro" v-model="livroRegisto" class="form-control form-control-sm" /></div>
          <div class="col-6 col-md-4"><label class="form-label small mb-0" for="c-conf">Conferido por</label><input id="c-conf" v-model="conferidoPor" class="form-control form-control-sm" /></div>
          <div class="col-12 col-md-5 d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="accao.ocupado.value" @click="emitir(true)">Rascunho (PDF)</button>
            <button type="button" class="btn btn-sm btn-primary" :disabled="!previa.completo || accao.ocupado.value" @click="emitir(false)">Emitir certificado</button>
          </div>
        </div>
      </template>

      <template v-if="documentos.dados.value.length">
        <h3 class="h6 mt-4">Emitidos</h3>
        <ul class="list-group">
          <li v-for="d in documentos.dados.value" :key="d.id" class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span>
              <strong>Certificado {{ d.rascunho ? '(rascunho)' : `n.º ${d.numeroTexto}` }}</strong>
              <span class="small text-body-secondary"> · {{ d.ciclo === 'primario' ? 'Ensino Primário' : 'I Ciclo' }} · {{ dataHora(d.emitidoEm) }} · {{ d.emitidoPor }}</span>
            </span>
            <button type="button" class="btn btn-sm btn-outline-primary" @click="reimprimir(d)">PDF</button>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
