<script setup>
import { computed, ref, watch } from 'vue';
import { api, descarregar } from '@/api/cliente.js';
import { usePedido } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { data as fData, kz, nota1, SITUACOES, TURNOS } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import GrelhaHorario from '@/components/GrelhaHorario.vue';

// Portal do encarregado de educação e do aluno: só o que a escola já publicou
const auth = useAutenticacao();
const educandos = usePedido(() => api.get('/portal/educandos'), { inicial: [] });
const escolhido = ref('');
watch(() => educandos.dados.value, (l) => { if (!escolhido.value && l.length) escolhido.value = l[0].id; });
const resumo = usePedido(() => (escolhido.value ? api.get(`/portal/alunos/${escolhido.value}`) : Promise.resolve(null)), { imediato: false });
watch(escolhido, () => resumo.executar());
const r = computed(() => resumo.dados.value);
const negativa = (v) => v !== null && v !== undefined && r.value && v < r.value.matricula.notaMinimaAprovacao;

// Faltas: totais por disciplina (somando os trimestres)
const faltas = computed(() => {
  const m = new Map();
  for (const f of r.value?.faltas ?? []) {
    const t = m.get(f.sigla) ?? { nome: f.nome, justificadas: 0, injustificadas: 0 };
    t.justificadas += f.justificadas;
    t.injustificadas += f.injustificadas;
    m.set(f.sigla, t);
  }
  return [...m.values()];
});
const recibo = (p) => descarregar(`/portal/pagamentos/${p.id}/recibo`, `recibo-${p.numeroTexto.replace('/', '-')}.pdf`);
</script>

<template>
  <h1 class="h4 mb-3">{{ auth.perfil === 'aluno' ? 'As minhas notas e faltas' : 'Notas e faltas dos educandos' }}</h1>

  <EstadoPedido :carregando="educandos.carregando.value" :erro="educandos.erro.value" :vazio="educandos.dados.value.length === 0"
                texto-vazio="Ainda não há alunos ligados a esta conta. Fale com a secretaria da escola." @repetir="educandos.executar()">
    <ul v-if="educandos.dados.value.length > 1" class="nav nav-pills mb-3">
      <li v-for="a in educandos.dados.value" :key="a.id" class="nav-item">
        <button type="button" class="nav-link" :class="{ active: escolhido === a.id }" @click="escolhido = a.id">{{ a.nome }}</button>
      </li>
    </ul>

    <EstadoPedido :carregando="resumo.carregando.value" :erro="resumo.erro.value" @repetir="resumo.executar()">
      <template v-if="r">
        <div class="card shadow-sm mb-3">
          <div class="card-body">
            <h2 class="h5 mb-1">{{ r.aluno.nome }}</h2>
            <p v-if="!r.matricula" class="text-body-secondary mb-0">Sem matrícula activa.</p>
            <p v-else class="text-body-secondary mb-0">
              Processo {{ r.aluno.numeroProcesso }} · {{ r.matricula.anoLectivo }} · {{ r.matricula.turma }} · {{ TURNOS[r.matricula.turno] }}
              <template v-if="r.matricula.directorTurma"> · Director(a) de turma: {{ r.matricula.directorTurma }}</template>
            </p>
          </div>
        </div>

        <template v-if="r.matricula">
          <!-- Situação no fim do ano -->
          <div v-if="r.situacao" class="alert d-flex flex-wrap gap-2 align-items-center"
               :class="r.situacao.situacao === 'transita' ? 'alert-success' : r.situacao.situacao === 'pendente' ? 'alert-secondary' : 'alert-danger'" role="status">
            <strong>Situação no fim do ano: {{ SITUACOES[r.situacao.situacao]?.texto }}</strong>
            <span v-if="r.situacao.motivos.length" class="small">({{ r.situacao.motivos.join(' ') }})</span>
          </div>

          <!-- Notas -->
          <section v-if="r.tipo === 'notas'" class="card shadow-sm mb-3" aria-labelledby="t-notas">
            <div class="card-header"><h3 id="t-notas" class="h6 mb-0">Notas (média de cada trimestre, escala 0–{{ r.matricula.escalaMaxima }})</h3></div>
            <div class="table-responsive">
              <table class="table table-sm mb-0 text-center align-middle">
                <thead><tr><th class="text-start">Disciplina</th><th>1.º T</th><th>2.º T</th><th>3.º T</th><th v-if="r.classeDeExame">Exame</th><th>Final</th></tr></thead>
                <tbody>
                  <tr v-for="d in r.disciplinas" :key="d.sigla">
                    <td class="text-start">{{ d.nome }}</td>
                    <td v-for="(t, i) in d.trimestres" :key="i" :class="{ negativa: negativa(t) }">{{ nota1(t) }}</td>
                    <td v-if="r.classeDeExame">{{ d.exame ?? '—' }}</td>
                    <td class="fw-semibold" :class="{ negativa: negativa(d.notaFinal) }">{{ d.notaFinal ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="card-footer small text-body-secondary">
              <template v-if="r.trimestresPublicados.length">Publicados: {{ r.trimestresPublicados.map((t) => `${t}.º`).join(', ') }} trimestre.</template>
              <template v-else>Ainda nenhum trimestre foi publicado.</template>
              As notas aparecem depois de a escola publicar cada trimestre; a nota final aparece com o 3.º trimestre.
            </div>
          </section>

          <!-- Iniciação -->
          <section v-else-if="r.tipo === 'descritiva'" class="card shadow-sm mb-3">
            <div class="card-header"><h3 class="h6 mb-0">Avaliação descritiva</h3></div>
            <ul class="list-group list-group-flush">
              <li v-for="d in r.descritivas" :key="d.trimestre" class="list-group-item"><strong>{{ d.trimestre }}.º trimestre:</strong> {{ d.texto }}</li>
              <li v-if="!r.descritivas.length" class="list-group-item text-body-secondary">Ainda nenhum trimestre foi publicado.</li>
            </ul>
          </section>

          <!-- 13.ª classe -->
          <section v-else-if="r.tipo === 'estagio'" class="card shadow-sm mb-3">
            <div class="card-header"><h3 class="h6 mb-0">Estágio e Trabalho de Fim de Curso</h3></div>
            <div class="card-body">
              <p v-if="!r.estagio" class="text-body-secondary mb-0">O estágio ainda não foi registado.</p>
              <dl v-else class="row mb-0">
                <dt class="col-5">Entidade</dt><dd class="col-7">{{ r.estagio.entidade }}</dd>
                <dt class="col-5">Nota do estágio</dt><dd class="col-7">{{ r.estagio.nota ?? '—' }}</dd>
                <dt class="col-5">TFC</dt><dd class="col-7">{{ r.estagio.tfcTema ?? '—' }} · {{ r.estagio.tfcNota ?? '—' }}</dd>
                <dt class="col-5">Curso</dt><dd class="col-7">{{ r.estagio.cursoConcluido ? 'Concluído' : 'Por concluir' }}</dd>
              </dl>
            </div>
          </section>

          <!-- Horário -->
          <section v-if="r.horario?.aulas.length" class="card shadow-sm mb-3" aria-labelledby="t-horario">
            <div class="card-header"><h3 id="t-horario" class="h6 mb-0">Horário da turma</h3></div>
            <GrelhaHorario :tempos="r.horario.tempos" :aulas="r.horario.aulas" />
          </section>

          <!-- Propinas -->
          <section v-if="r.financas && (r.financas.pendentes.length || r.financas.pagamentos.length)" class="card shadow-sm mb-3" aria-labelledby="t-propinas">
            <div class="card-header d-flex flex-wrap justify-content-between gap-2">
              <h3 id="t-propinas" class="h6 mb-0">Propinas e pagamentos</h3>
              <span class="small">Em atraso: <strong :class="{ 'text-danger': r.financas.totais.emAtraso > 0 }">{{ kz(r.financas.totais.emAtraso) }}</strong></span>
            </div>
            <div class="card-body">
              <h4 class="h6">Por pagar</h4>
              <ul v-if="r.financas.pendentes.length" class="list-unstyled small">
                <li v-for="c in r.financas.pendentes" :key="c.id" :class="{ 'text-danger': c.emAtraso }">
                  {{ c.descricao }} · {{ kz(c.valor) }} · vence a {{ fData(c.vencimento) }}<template v-if="c.emAtraso"> (em atraso<template v-if="c.multaPrevista">, multa {{ kz(c.multaPrevista) }}</template>)</template>
                </li>
              </ul>
              <p v-else class="small text-success">Tudo pago.</p>
              <template v-if="r.financas.pagamentos.length">
                <h4 class="h6 mt-3">Recibos</h4>
                <ul class="list-group">
                  <li v-for="p in r.financas.pagamentos" :key="p.id" class="list-group-item d-flex justify-content-between align-items-center gap-2 small">
                    <span><strong>N.º {{ p.numeroTexto }}</strong> · {{ fData(p.dataPagamento) }} · {{ kz(p.valorTotal) }}<br />{{ p.itens.map((i) => i.descricao).join(', ') }}</span>
                    <button type="button" class="btn btn-sm btn-outline-primary" @click="recibo(p)">PDF</button>
                  </li>
                </ul>
              </template>
              <p class="small text-body-secondary mt-2 mb-0">Os pagamentos fazem-se na secretaria da escola.</p>
            </div>
          </section>

          <!-- Faltas -->
          <section class="card shadow-sm" aria-labelledby="t-faltas">
            <div class="card-header"><h3 id="t-faltas" class="h6 mb-0">Faltas no ano</h3></div>
            <div class="table-responsive">
              <table class="table table-sm mb-0 text-center">
                <thead><tr><th class="text-start">Disciplina</th><th>Justificadas</th><th>Injustificadas</th></tr></thead>
                <tbody>
                  <tr v-for="f in faltas" :key="f.nome">
                    <td class="text-start">{{ f.nome }}</td><td>{{ f.justificadas }}</td>
                    <td :class="{ 'text-danger fw-semibold': f.injustificadas > 0 }">{{ f.injustificadas }}</td>
                  </tr>
                  <tr v-if="!faltas.length"><td colspan="3" class="text-body-secondary">Sem faltas registadas.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="card-footer small text-body-secondary">Para justificar uma falta, fale com o(a) director(a) de turma.</div>
          </section>
        </template>
      </template>
    </EstadoPedido>
  </EstadoPedido>
</template>
