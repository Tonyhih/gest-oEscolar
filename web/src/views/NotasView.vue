<script setup>
import { computed, ref, watch } from 'vue';
import { api, descarregar } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { lerNota, nota1 } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const props = defineProps({ id: { type: String, required: true }, disciplina: { type: String, required: true } });
const auth = useAutenticacao();
const accao = useAccao();

const turma = usePedido(() => api.get(`/turmas/${props.id}`));
const atribuicoes = usePedido(() => api.get(`/turmas/${props.id}/atribuicoes`), { inicial: [] });
const anos = usePedido(() => api.get('/anos-lectivos'), { inicial: [] });
const t = computed(() => turma.dados.value);
const atribuicao = computed(() => atribuicoes.dados.value.find((a) => a.disciplina === props.disciplina));
const escala = computed(() => t.value?.avaliacao.escalaMaxima ?? 20);
const minima = computed(() => t.value?.avaliacao.notaMinimaAprovacao ?? 10);

const trimestre = ref(1);
const linhas = ref([]);
const grelha = usePedido(async () => {
  const r = await api.get(`/turmas/${props.id}/disciplinas/${props.disciplina}/notas`, { trimestre: trimestre.value });
  // Os campos são texto para aceitar a vírgula decimal ("12,5")
  linhas.value = r.map((l) => ({ ...l, ed: { mac: txt(l.mac), npp: txt(l.npp), npt: txt(l.npt), exame: txt(l.exame) } }));
  return r;
}, { inicial: [] });
watch(trimestre, () => grelha.executar());
const txt = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

const estadoTrimestre = computed(() => {
  const ano = anos.dados.value.find((a) => a.id === t.value?.anoLectivoId);
  return ano?.trimestres.find((x) => x.numero === trimestre.value);
});
const publicada = computed(() => linhas.value[0]?.publicada ?? false);
const ehProfessorDaDisciplina = computed(() => auth.perfil === 'professor' && atribuicao.value?.professor === auth.utilizador.professorId);
const podeEditar = computed(() => ehProfessorDaDisciplina.value && !publicada.value && estadoTrimestre.value?.aberto);
const motivoSoLeitura = computed(() => {
  if (!ehProfessorDaDisciplina.value) return 'Só o professor desta disciplina lança as notas.';
  if (publicada.value) return 'As notas deste trimestre já foram publicadas. As correcções são feitas pelo director.';
  if (!estadoTrimestre.value?.aberto) return 'Este trimestre está fechado para lançamento.';
  return '';
});

/** Erro de uma célula: não é número ou está fora da escala da classe. */
function erroCelula(valor) {
  const n = lerNota(valor);
  if (n === null) return '';
  if (Number.isNaN(n)) return 'Não é um número';
  if (n < 0 || n > escala.value) return `Entre 0 e ${escala.value}`;
  return '';
}
/** MT prevista enquanto o professor escreve; a oficial é calculada pelo servidor ao gravar. */
function mtPrevista(l) {
  const v = ['mac', 'npp', 'npt'].map((c) => lerNota(l.ed[c]));
  return v.some((x) => x === null || Number.isNaN(x)) ? null : (v[0] + v[1] + v[2]) / 3;
}
const temErros = computed(() => linhas.value.some((l) => ['mac', 'npp', 'npt'].some((c) => erroCelula(l.ed[c]))));

async function gravar() {
  const corpo = linhas.value
    .filter((l) => ['mac', 'npp', 'npt'].some((c) => l.ed[c] !== '' || l[c] !== null))
    .map((l) => ({ matricula: l.matricula, mac: lerNota(l.ed.mac), npp: lerNota(l.ed.npp), npt: lerNota(l.ed.npt) }));
  if (!corpo.length) return;
  const r = await accao.correr(() => api.put(`/turmas/${props.id}/disciplinas/${props.disciplina}/notas`, corpo, { trimestre: trimestre.value }),
    'Notas gravadas.');
  if (r) grelha.executar();
}

// ---------------------------------------------------------------- Exame (classes de exame)
const podeExame = computed(() => t.value?.avaliacao.classeDeExame && (ehProfessorDaDisciplina.value || auth.perfil === 'secretaria'));
const resultadosExame = ref({});
async function gravarExames() {
  const corpo = linhas.value.filter((l) => l.ed.exame !== '').map((l) => ({ matricula: l.matricula, exame: lerNota(l.ed.exame) }));
  const r = await accao.correr(() => api.put(`/turmas/${props.id}/disciplinas/${props.disciplina}/exame`, corpo), 'Notas de exame gravadas.');
  if (r) resultadosExame.value = Object.fromEntries(r.map((x) => [x.matricula, x]));
}

const miniPauta = () => accao.correr(() => descarregar(`/turmas/${props.id}/disciplinas/${props.disciplina}/mini-pauta`,
  `mini-pauta-${atribuicao.value?.sigla ?? 'disciplina'}-${trimestre.value}-trimestre.pdf`, { trimestre: trimestre.value }));

// ---------------------------------------------------------------- Correcção (director)
const correcao = ref(null);
function abrirCorrecao(l) {
  correcao.value = { linha: l, campo: 'npt', valor: '', justificacao: '' };
}
async function corrigir() {
  const c = correcao.value;
  const r = await accao.correr(() => api.post(`/notas/${c.linha.id}/correccoes`,
    { campo: c.campo, valor: lerNota(c.valor), justificacao: c.justificacao }), 'Nota corrigida e registada na auditoria.');
  if (r) { correcao.value = null; grelha.executar(); }
}
</script>

<template>
  <RouterLink :to="{ name: 'turma', params: { id } }" class="small">&larr; Turma</RouterLink>
  <EstadoPedido :carregando="turma.carregando.value" :erro="turma.erro.value" @repetir="turma.executar()">
    <template v-if="t">
      <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 my-2">
        <div>
          <h1 class="h4 mb-0">Notas de {{ atribuicao?.sigla ?? 'disciplina' }}</h1>
          <span class="text-body-secondary small">{{ t.designacao }} · escala 0–{{ escala }} · aprovação ≥ {{ minima }}</span>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
        <button type="button" class="btn btn-outline-secondary" :disabled="accao.ocupado.value" @click="miniPauta">Mini-pauta (PDF)</button>
        <div class="btn-group" role="group" aria-label="Trimestre">
          <template v-for="n in [1, 2, 3]" :key="n">
            <input :id="`tri-${n}`" v-model="trimestre" type="radio" class="btn-check" name="trimestre" :value="n" />
            <label class="btn btn-outline-primary" :for="`tri-${n}`">{{ n }}.º<span class="d-none d-sm-inline"> trimestre</span><span class="d-sm-none"> T</span></label>
          </template>
        </div>
        </div>
      </div>

      <div v-if="motivoSoLeitura" class="alert alert-secondary py-2 small" role="status">{{ motivoSoLeitura }}</div>
      <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

      <EstadoPedido :carregando="grelha.carregando.value" :erro="grelha.erro.value" :vazio="linhas.length === 0"
                    texto-vazio="A turma não tem alunos." @repetir="grelha.executar()">
        <form class="card shadow-sm" @submit.prevent="gravar">
          <div class="table-responsive">
            <table class="table table-sm table-hover mb-0 grelha-notas">
              <caption class="visually-hidden">Notas do {{ trimestre }}.º trimestre</caption>
              <thead>
                <tr><th scope="col">Aluno</th><th scope="col" title="Média das avaliações contínuas">MAC</th>
                  <th scope="col" title="Nota da prova do professor">NPP</th><th scope="col" title="Nota da prova trimestral">NPT</th>
                  <th scope="col" title="Média trimestral">MT</th><th v-if="auth.perfil === 'director' && publicada" scope="col"></th></tr>
              </thead>
              <tbody>
                <tr v-for="l in linhas" :key="l.matricula">
                  <td class="nome">{{ l.aluno.nome }}</td>
                  <td v-for="c in ['mac', 'npp', 'npt']" :key="c">
                    <input v-if="podeEditar" v-model="l.ed[c]" class="form-control form-control-sm" :class="{ 'is-invalid': erroCelula(l.ed[c]) }"
                           inputmode="decimal" :aria-label="`${c.toUpperCase()} de ${l.aluno.nome}`" :title="erroCelula(l.ed[c])" />
                    <span v-else :class="{ negativa: l[c] !== null && l[c] < minima }">{{ nota1(l[c]) }}</span>
                  </td>
                  <td>
                    <strong :class="{ negativa: (podeEditar ? mtPrevista(l) : l.mt) !== null && (podeEditar ? mtPrevista(l) : l.mt) < minima }">
                      {{ nota1(podeEditar ? mtPrevista(l) : l.mt) }}</strong>
                  </td>
                  <td v-if="auth.perfil === 'director' && publicada">
                    <button v-if="l.id" type="button" class="btn btn-sm btn-outline-secondary" @click="abrirCorrecao(l)">Corrigir</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="podeEditar" class="card-footer d-flex flex-wrap gap-2 align-items-center">
            <button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value || temErros">Gravar notas</button>
            <span class="small text-body-secondary">Pode usar vírgula decimal (12,5). Campos vazios ficam por lançar.</span>
          </div>
        </form>

        <form v-if="correcao" class="card card-body shadow-sm mt-3" @submit.prevent="corrigir">
          <h2 class="h6">Corrigir nota de {{ correcao.linha.aluno.nome }} ({{ trimestre }}.º trimestre)</h2>
          <div class="row g-2">
            <div class="col-4 col-md-2"><label class="form-label small" for="co-campo">Campo</label>
              <select id="co-campo" v-model="correcao.campo" class="form-select form-select-sm">
                <option value="mac">MAC</option><option value="npp">NPP</option><option value="npt">NPT</option>
                <option v-if="t.avaliacao.classeDeExame" value="exame">Exame</option>
              </select></div>
            <div class="col-4 col-md-2"><label class="form-label small" for="co-valor">Novo valor</label>
              <input id="co-valor" v-model="correcao.valor" inputmode="decimal" class="form-control form-control-sm" required /></div>
            <div class="col-12 col-md-8"><label class="form-label small" for="co-just">Justificação (mín. 10 caracteres)</label>
              <input id="co-just" v-model="correcao.justificacao" class="form-control form-control-sm" minlength="10" required /></div>
          </div>
          <div class="mt-2 d-flex gap-2">
            <button type="submit" class="btn btn-sm btn-primary" :disabled="accao.ocupado.value || !!erroCelula(correcao.valor)">Corrigir</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" @click="correcao = null">Cancelar</button>
          </div>
        </form>

        <form v-if="podeExame" class="card shadow-sm mt-3" @submit.prevent="gravarExames">
          <div class="card-header">Prova de exame <span class="small text-body-secondary">· CF = MFD × 40% + exame × 60%</span></div>
          <div class="table-responsive">
            <table class="table table-sm mb-0 grelha-notas">
              <thead><tr><th>Aluno</th><th>Exame</th><th>MFD</th><th>CF</th><th>Final</th></tr></thead>
              <tbody>
                <tr v-for="l in linhas" :key="l.matricula">
                  <td class="nome">{{ l.aluno.nome }}</td>
                  <td><input v-model="l.ed.exame" class="form-control form-control-sm" :class="{ 'is-invalid': erroCelula(l.ed.exame) }"
                             inputmode="decimal" :aria-label="`Exame de ${l.aluno.nome}`" /></td>
                  <td>{{ nota1(resultadosExame[l.matricula]?.mfd) }}</td>
                  <td>{{ nota1(resultadosExame[l.matricula]?.cf) }}</td>
                  <td><strong :class="{ negativa: resultadosExame[l.matricula]?.aprovado === false }">{{ resultadosExame[l.matricula]?.notaFinal ?? '—' }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="card-footer"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Gravar exames</button></div>
        </form>
      </EstadoPedido>
    </template>
  </EstadoPedido>
</template>
