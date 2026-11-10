<script setup>
import { computed, reactive, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { lerNota } from '@/util/formatar.js';
import MensagemAccao from '@/components/MensagemAccao.vue';

// Notas finais de classes feitas antes de a escola usar o sistema, ou noutra escola (para os certificados)
const props = defineProps({ aluno: { type: Object, required: true } });
const accao = useAccao();
const historico = usePedido(() => api.get(`/alunos/${props.aluno.id}/historico`), { inicial: [] });
const disciplinas = usePedido(() => api.get('/disciplinas'), { inicial: [] });

// Classes que o aluno já tem no sistema (as notas dessas vêm das pautas)
const noSistema = computed(() => new Set((props.aluno.matriculas ?? []).filter((m) => m.estado !== 'anulada')
  .map((m) => String(parseInt(m.turmaDesignacao, 10))).filter((c) => c !== 'NaN')));
const classesLivres = computed(() => Array.from({ length: 12 }, (_, i) => String(i + 1)).filter((c) => !noSistema.value.has(c)));

const aberto = ref(false);
const form = reactive({ classe: '', anoLectivo: '', escolaOrigem: '', notas: {} });
const escala = computed(() => (Number(form.classe) <= 6 ? 10 : 20));

function abrir(classe = '') {
  const existente = historico.dados.value.find((h) => h.classe === classe);
  Object.assign(form, {
    classe, anoLectivo: existente?.anoLectivo ?? '', escolaOrigem: existente?.escolaOrigem ?? '',
    notas: Object.fromEntries((existente?.notas ?? []).map((n) => [n.disciplina, String(n.notaFinal)])),
  });
  aberto.value = true;
}
function erroNota(v) {
  const n = lerNota(v);
  if (n === null) return '';
  if (Number.isNaN(n) || !Number.isInteger(n)) return 'Nota final inteira';
  return n < 0 || n > escala.value ? `Entre 0 e ${escala.value}` : '';
}
const preenchidas = computed(() => Object.entries(form.notas).filter(([, v]) => String(v ?? '').trim() !== ''));
const invalido = computed(() => !form.classe || !/^\d{4}\/\d{4}$/.test(form.anoLectivo) || preenchidas.value.length === 0
  || preenchidas.value.some(([, v]) => erroNota(v)));

async function gravar() {
  const corpo = {
    anoLectivo: form.anoLectivo, ...(form.escolaOrigem ? { escolaOrigem: form.escolaOrigem } : {}),
    notas: preenchidas.value.map(([disciplina, v]) => ({ disciplina, notaFinal: lerNota(v) })),
  };
  const r = await accao.correr(() => api.put(`/alunos/${props.aluno.id}/historico/${form.classe}`, corpo),
    `Notas da ${form.classe}.ª classe gravadas.`);
  if (r) { historico.dados.value = r; aberto.value = false; }
}
</script>

<template>
  <div class="card shadow-sm mt-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span>Histórico escolar <span class="small text-body-secondary">· classes anteriores ao sistema ou feitas noutra escola</span></span>
      <button v-if="!aberto" type="button" class="btn btn-sm btn-outline-primary" @click="abrir()">Acrescentar classe</button>
    </div>
    <div class="card-body">
      <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
      <p v-if="!historico.dados.value.length && !aberto" class="text-body-secondary small mb-0">
        Sem histórico. Se o aluno fez classes antes de a escola usar o sistema (por exemplo, a 7.ª e a 8.ª),
        lance aqui as notas finais para o certificado sair completo.
      </p>
      <div v-for="h in historico.dados.value" :key="h.classe" class="mb-2">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <strong>{{ h.classe }}.ª classe · {{ h.anoLectivo }}<span v-if="h.escolaOrigem" class="fw-normal text-body-secondary"> · {{ h.escolaOrigem }}</span></strong>
          <button type="button" class="btn btn-sm btn-link p-0" @click="abrir(h.classe)">Alterar</button>
        </div>
        <span v-for="n in h.notas" :key="n.disciplina" class="badge text-bg-light border me-1">{{ n.sigla }}: {{ n.notaFinal }}</span>
      </div>

      <form v-if="aberto" class="border-top pt-3 mt-2" @submit.prevent="gravar">
        <div class="row g-2">
          <div class="col-4 col-md-2"><label class="form-label small" for="h-classe">Classe</label>
            <select id="h-classe" v-model="form.classe" class="form-select form-select-sm" required>
              <option value="" disabled>—</option>
              <option v-for="c in classesLivres" :key="c" :value="c">{{ c }}.ª</option>
            </select></div>
          <div class="col-8 col-md-3"><label class="form-label small" for="h-ano">Ano lectivo</label>
            <input id="h-ano" v-model="form.anoLectivo" class="form-control form-control-sm" placeholder="2024/2025" pattern="\d{4}/\d{4}" required /></div>
          <div class="col-12 col-md-7"><label class="form-label small" for="h-origem">Escola onde fez a classe (se foi noutra)</label>
            <input id="h-origem" v-model="form.escolaOrigem" class="form-control form-control-sm" /></div>
        </div>
        <p class="small text-body-secondary mt-2 mb-1">Nota final de cada disciplina (escala 0–{{ escala }}). Deixe vazias as disciplinas que o aluno não teve.</p>
        <div class="row g-2">
          <div v-for="d in disciplinas.dados.value" :key="d.id" class="col-6 col-md-3">
            <label class="form-label small mb-0" :for="`h-${d.id}`">{{ d.nome }}</label>
            <input :id="`h-${d.id}`" v-model="form.notas[d.id]" inputmode="numeric" class="form-control form-control-sm"
                   :class="{ 'is-invalid': erroNota(form.notas[d.id]) }" :title="erroNota(form.notas[d.id])" />
          </div>
        </div>
        <div class="mt-3 d-flex gap-2">
          <button type="submit" class="btn btn-sm btn-primary" :disabled="invalido || accao.ocupado.value">Gravar</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" @click="aberto = false">Cancelar</button>
        </div>
      </form>
    </div>
  </div>
</template>
