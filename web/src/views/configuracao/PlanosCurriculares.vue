<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const classes = usePedido(() => api.get('/classes'), { inicial: [] });
const cursos = usePedido(() => api.get('/cursos'), { inicial: [] });
const disciplinas = usePedido(() => api.get('/disciplinas'), { inicial: [] });
const accao = useAccao();

const classeId = ref('');
const cursoId = ref('');
const classe = computed(() => classes.dados.value.find((c) => c.id === classeId.value));
const precisaCurso = computed(() => classe.value?.ciclo === 'ii_ciclo');
const cursosDoRamo = computed(() => cursos.dados.value.filter((c) => c.ramo === classe.value?.ramo));

// Linhas editáveis: uma por disciplina da escola
const plano = ref(null);
const linhas = ref([]);
const carregando = ref(false);
const erro = ref(null);

async function carregar() {
  plano.value = null;
  linhas.value = [];
  if (!classeId.value || (precisaCurso.value && !cursoId.value)) return;
  carregando.value = true;
  erro.value = null;
  try {
    const lista = await api.get('/planos-curriculares', { classe: classeId.value, curso: cursoId.value || undefined });
    // Sem curso, a API devolve todos os planos da classe; escolhemos o que não tem curso
    plano.value = lista.find((p) => (p.curso ?? '') === cursoId.value) ?? null;
    const noPlano = new Map((plano.value?.disciplinas ?? []).map((d) => [d.disciplina, d]));
    linhas.value = disciplinas.dados.value.map((d) => ({
      id: d.id, nome: d.nome, sigla: d.sigla, incluida: noPlano.has(d.id),
      chave: noPlano.get(d.id)?.chave ?? false, carga: noPlano.get(d.id)?.cargaHorariaSemanal ?? 4,
    }));
  } catch (e) {
    erro.value = e;
  } finally {
    carregando.value = false;
  }
}
watch([classeId, cursoId], () => { if (!precisaCurso.value) cursoId.value = ''; carregar(); });

async function gravar() {
  const escolhidas = linhas.value.filter((l) => l.incluida)
    .map((l) => ({ disciplina: l.id, chave: l.chave, cargaHorariaSemanal: Number(l.carga) || undefined }));
  const r = await accao.correr(() => (plano.value
    ? api.put(`/planos-curriculares/${plano.value.id}`, { disciplinas: escolhidas })
    : api.post('/planos-curriculares', { classe: classeId.value, curso: cursoId.value || undefined, disciplinas: escolhidas })),
  'Plano curricular gravado.');
  if (r) carregar();
}
</script>

<template>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />
  <div class="row g-2 mb-3">
    <div class="col-md-4">
      <label class="form-label" for="p-classe">Classe</label>
      <select id="p-classe" v-model="classeId" class="form-select">
        <option value="" disabled>Escolha a classe</option>
        <option v-for="c in classes.dados.value.filter((x) => !x.avaliacaoQualitativa && !x.apenasEstagio)" :key="c.id" :value="c.id">{{ c.designacao }}</option>
      </select>
    </div>
    <div v-if="precisaCurso" class="col-md-4">
      <label class="form-label" for="p-curso">Curso</label>
      <select id="p-curso" v-model="cursoId" class="form-select">
        <option value="" disabled>Escolha o curso</option>
        <option v-for="c in cursosDoRamo" :key="c.id" :value="c.id">{{ c.nome }}</option>
      </select>
    </div>
  </div>

  <EstadoPedido v-if="classeId && (!precisaCurso || cursoId)" :carregando="carregando" :erro="erro" @repetir="carregar">
    <form class="card shadow-sm" @submit.prevent="gravar">
      <div class="card-header small">{{ plano ? 'Plano existente' : 'Ainda não há plano: escolha as disciplinas e grave.' }}
        As <strong>disciplinas-chave</strong> impedem a transição se tiverem negativa.</div>
      <div class="table-responsive">
        <table class="table table-sm mb-0 align-middle">
          <thead><tr><th>Incluir</th><th>Disciplina</th><th>Chave</th><th>Horas/semana</th></tr></thead>
          <tbody>
            <tr v-for="l in linhas" :key="l.id">
              <td><input :id="`inc-${l.id}`" v-model="l.incluida" class="form-check-input" type="checkbox" :aria-label="`Incluir ${l.nome}`" /></td>
              <td><label :for="`inc-${l.id}`">{{ l.nome }}</label> <span class="text-body-secondary small">({{ l.sigla }})</span></td>
              <td><input v-model="l.chave" class="form-check-input" type="checkbox" :disabled="!l.incluida" :aria-label="`${l.nome} é disciplina-chave`" /></td>
              <td><input v-model="l.carga" type="number" min="1" max="20" class="form-control form-control-sm" style="width: 5rem" :disabled="!l.incluida" :aria-label="`Horas de ${l.nome}`" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card-footer"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value || !linhas.some((l) => l.incluida)">Gravar plano</button></div>
    </form>
  </EstadoPedido>
</template>
