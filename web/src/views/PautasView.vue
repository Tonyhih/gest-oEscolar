<script setup>
import { computed, ref, watch } from 'vue';
import { api, descarregar } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { nota1, notaInteira, SITUACOES } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const props = defineProps({ id: { type: String, required: true } });
const auth = useAutenticacao();
const accao = useAccao();
const vista = ref('final'); // 1, 2, 3 ou 'final'

const pauta = usePedido(() => (vista.value === 'final'
  ? api.get(`/turmas/${props.id}/pautas/final`)
  : api.get(`/turmas/${props.id}/pautas/trimestres/${vista.value}`)));
watch(vista, () => pauta.executar());
const p = computed(() => pauta.dados.value);

const qualitativa = computed(() => p.value?.linhas[0] && 'descritiva' in p.value.linhas[0]);
const colunas = computed(() => (p.value?.linhas[0]?.notas ? Object.keys(p.value.linhas[0].notas) : (p.value?.disciplinas ?? []).map((d) => d.sigla)));
const chaves = computed(() => new Set((p.value?.disciplinas ?? []).filter((d) => d.chave).map((d) => d.sigla)));
const minima = computed(() => p.value?.turma.notaMinimaAprovacao ?? 10);
const podePublicar = computed(() => vista.value !== 'final' && p.value && !p.value.publicada && (auth.perfil === 'director' || auth.dirige(props.id)));
const podeExportar = computed(() => auth.perfil === 'director' || auth.dirige(props.id));

const resumo = computed(() => {
  if (vista.value !== 'final' || !p.value) return null;
  const c = { transita: 0, nao_transita: 0, pendente: 0, concluido: 0 };
  for (const l of p.value.linhas) c[l.situacao] = (c[l.situacao] ?? 0) + 1;
  return c;
});

async function publicar() {
  if (!confirm(`Publicar as notas do ${vista.value}.º trimestre? Depois disso, os professores já não as podem alterar.`)) return;
  await accao.correr(() => api.post(`/turmas/${props.id}/trimestres/${vista.value}/publicar`), 'Trimestre publicado.');
  pauta.executar();
}
async function exportar() {
  await accao.correr(() => descarregar(`/turmas/${props.id}/pautas/final`, `pauta-final-${p.value.turma.designacao.replace(/\W+/g, '-')}.csv`, { formato: 'csv' }));
}
const valor = (v) => (vista.value === 'final' ? notaInteira(v) : nota1(v));
</script>

<template>
  <RouterLink :to="{ name: 'turma', params: { id } }" class="small nao-imprimir">&larr; Turma</RouterLink>
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 my-2">
    <h1 class="h4 mb-0">Pauta {{ vista === 'final' ? 'final' : `do ${vista}.º trimestre` }}<template v-if="p"> · {{ p.turma.designacao }}</template></h1>
    <div class="btn-group nao-imprimir" role="group" aria-label="Pauta">
      <template v-for="v in [1, 2, 3, 'final']" :key="v">
        <input :id="`pv-${v}`" v-model="vista" type="radio" class="btn-check" name="vista" :value="v" />
        <label class="btn btn-outline-primary" :for="`pv-${v}`">{{ v === 'final' ? 'Final' : `${v}.º T` }}</label>
      </template>
    </div>
  </div>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <EstadoPedido :carregando="pauta.carregando.value" :erro="pauta.erro.value" :vazio="p?.linhas.length === 0"
                texto-vazio="A turma não tem alunos." @repetir="pauta.executar()">
    <template v-if="p">
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2 nao-imprimir">
        <span v-if="vista !== 'final'" class="badge" :class="p.publicada ? 'text-bg-success' : 'text-bg-secondary'">{{ p.publicada ? 'Publicada' : 'Por publicar' }}</span>
        <template v-if="resumo">
          <span class="badge text-bg-success">{{ resumo.transita + resumo.concluido }} transitam</span>
          <span class="badge text-bg-danger">{{ resumo.nao_transita }} não transitam</span>
          <span v-if="resumo.pendente" class="badge text-bg-secondary">{{ resumo.pendente }} pendentes</span>
        </template>
        <span class="flex-grow-1"></span>
        <button v-if="podePublicar" type="button" class="btn btn-sm btn-primary" :disabled="accao.ocupado.value" @click="publicar">Publicar trimestre</button>
        <button v-if="vista === 'final' && podeExportar" type="button" class="btn btn-sm btn-outline-primary" @click="exportar">Exportar CSV</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.print()">Imprimir</button>
      </div>

      <div v-if="qualitativa" class="list-group shadow-sm">
        <div v-for="l in p.linhas" :key="l.aluno.id" class="list-group-item">
          <strong>{{ l.aluno.nome }}</strong>
          <p class="mb-0 small" :class="{ 'text-body-secondary fst-italic': !l.descritiva }">{{ l.descritiva ?? 'Sem avaliação lançada.' }}</p>
        </div>
      </div>

      <div v-else class="table-responsive card shadow-sm">
        <table class="table table-sm table-bordered table-hover mb-0 tabela-pauta text-center align-middle">
          <caption class="visually-hidden">Pauta</caption>
          <thead>
            <tr>
              <th scope="col">N.º</th><th scope="col" class="text-start">Nome</th>
              <th v-for="c in colunas" :key="c" scope="col">{{ c }}<span v-if="chaves.has(c)" title="Disciplina-chave" aria-label="disciplina-chave">*</span></th>
              <th scope="col">Neg.</th><th v-if="vista === 'final'" scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in p.linhas" :key="l.aluno.id">
              <td>{{ i + 1 }}</td>
              <td class="text-start">{{ l.aluno.nome }}<br /><span class="small text-body-secondary">{{ l.aluno.numeroProcesso }}</span></td>
              <td v-for="c in colunas" :key="c" :class="{ negativa: l.notas[c] !== null && l.notas[c] < minima }">{{ valor(l.notas[c]) }}</td>
              <td>{{ l.negativas }}</td>
              <td v-if="vista === 'final'" :title="l.motivos?.join(' ')">
                <span class="badge" :class="SITUACOES[l.situacao]?.classe">{{ SITUACOES[l.situacao]?.texto }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small text-body-secondary mt-2">
        <template v-if="chaves.size">* Disciplina-chave. </template>
        <template v-if="vista === 'final' && p.turma.classeDeExame">Classe de exame: nota final = MFD × 40% + exame × 60%; transita só com todas as disciplinas positivas.</template>
        <template v-else-if="vista === 'final'">Nota final = média das três MT, arredondada à unidade.</template>
        <template v-else>MT = (MAC + NPP + NPT) / 3.</template>
      </p>
    </template>
  </EstadoPedido>
</template>
