<script setup>
import { computed } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido } from '@/composables/usePedido.js';
import { TURNOS } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';

// RF38: indicadores do ano lectivo (só números agregados)
const { dados, carregando, erro, executar } = usePedido(() => api.get('/painel'));
const pct = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 1 });

const global = computed(() => {
  const l = dados.value?.aprovacaoPorClasse ?? [];
  const decididos = l.reduce((s, c) => s + c.total - c.pendentes, 0);
  const transitam = l.reduce((s, c) => s + c.transitam, 0);
  return decididos ? (100 * transitam) / decididos : null;
});

// Tabela classe × turno
const turnos = computed(() => [...new Set((dados.value?.alunosPorClasse ?? []).map((l) => l.turno))]
  .sort((a, b) => Object.keys(TURNOS).indexOf(a) - Object.keys(TURNOS).indexOf(b)));
const tabela = computed(() => {
  const m = new Map();
  for (const l of dados.value?.alunosPorClasse ?? []) {
    if (!m.has(l.classe)) m.set(l.classe, { classe: l.classe, total: 0 });
    m.get(l.classe)[l.turno] = (m.get(l.classe)[l.turno] ?? 0) + l.total;
    m.get(l.classe).total += l.total;
  }
  return [...m.values()];
});
</script>

<template>
  <EstadoPedido :carregando="carregando" :erro="erro" @repetir="executar()">
    <template v-if="dados">
      <h1 class="h4 mb-3">Painel · {{ dados.anoLectivo.designacao }}</h1>

      <div class="row g-3 mb-4">
        <div v-for="t in [
          { rotulo: 'Alunos matriculados', valor: dados.totais.alunos },
          { rotulo: 'Turmas', valor: dados.totais.turmas },
          { rotulo: 'Professores', valor: dados.totais.professores },
          { rotulo: 'Transitam (decididos)', valor: global === null ? '—' : `${pct.format(global)} %` },
        ]" :key="t.rotulo" class="col-6 col-lg-3">
          <div class="card h-100 shadow-sm">
            <div class="card-body">
              <div class="small text-body-secondary">{{ t.rotulo }}</div>
              <div class="fs-2 fw-semibold lh-sm">{{ t.valor }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-3">
        <section class="col-lg-7" aria-labelledby="t-transicao">
          <div class="card shadow-sm h-100">
            <div class="card-header"><h2 id="t-transicao" class="h6 mb-0">Alunos que transitam, por classe</h2></div>
            <div class="card-body">
              <p v-if="!dados.aprovacaoPorClasse.length" class="text-body-secondary mb-0">Ainda não há resultados.</p>
              <div class="barras">
              <div v-for="c in dados.aprovacaoPorClasse" :key="c.classe" class="barra-linha"
                   :title="`${c.classe}: ${c.transitam} transitam, ${c.naoTransitam} não transitam, ${c.pendentes} pendentes`">
                <span class="barra-rotulo">{{ c.classe }}</span>
                <span class="barra-trilho" role="img"
                      :aria-label="c.percentagem === null ? `${c.classe}: sem resultados decididos` : `${c.classe}: ${pct.format(c.percentagem)} % transitam`">
                  <span class="barra-valor" :style="{ width: `${c.percentagem ?? 0}%` }"></span>
                </span>
                <span class="barra-texto">
                  <strong>{{ c.percentagem === null ? '—' : `${pct.format(c.percentagem)} %` }}</strong>
                  <span class="text-body-secondary"> · {{ c.transitam }} de {{ c.total - c.pendentes }}</span>
                  <span v-if="c.pendentes" class="text-body-secondary"> · {{ c.pendentes }} pend.</span>
                </span>
              </div>
              </div>
              <p class="small text-body-secondary mt-3 mb-0">Percentagem sobre os alunos com situação decidida (as mesmas regras da pauta final).
                Os pendentes ainda não têm todas as notas finais, ou, na 13.ª classe, o estágio e o TFC.</p>
            </div>
          </div>
        </section>

        <section class="col-lg-5" aria-labelledby="t-turnos">
          <div class="card shadow-sm h-100">
            <div class="card-header"><h2 id="t-turnos" class="h6 mb-0">Alunos por classe e turno</h2></div>
            <div class="table-responsive">
              <table class="table table-sm mb-0 text-end">
                <thead><tr><th class="text-start">Classe</th><th v-for="t in turnos" :key="t">{{ TURNOS[t] }}</th><th>Total</th></tr></thead>
                <tbody>
                  <tr v-for="l in tabela" :key="l.classe">
                    <td class="text-start">{{ l.classe }}</td>
                    <td v-for="t in turnos" :key="t">{{ l[t] ?? '—' }}</td>
                    <td class="fw-semibold">{{ l.total }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="card-footer small text-body-secondary">
              Faltas injustificadas no ano: <strong class="text-body">{{ dados.totais.faltasInjustificadas }}</strong>
            </div>
          </div>
        </section>
      </div>
    </template>
  </EstadoPedido>
</template>

<style scoped>
/* Uma só grelha para todas as linhas: as barras começam e acabam no mesmo sítio */
.barras { display: grid; grid-template-columns: auto 1fr auto; column-gap: 0.75rem; row-gap: 0.7rem; align-items: center; }
.barra-linha { display: contents; }
.barra-rotulo { font-size: 0.875rem; }
.barra-trilho { display: block; height: 0.75rem; background: var(--bs-secondary-bg); border-radius: 4px; overflow: hidden; }
.barra-valor { display: block; height: 100%; background: #198754; border-radius: 0 4px 4px 0; }
.barra-texto { font-size: 0.875rem; white-space: nowrap; }
@media (max-width: 575.98px) {
  .barras { display: block; }
  .barra-linha { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 0.75rem; margin-bottom: 0.75rem; }
  .barra-trilho { grid-column: 1 / -1; grid-row: 2; }
}
</style>
