<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const auth = useAutenticacao();
const gere = computed(() => auth.temPerfil('director', 'secretaria'));

const anos = usePedido(() => api.get('/anos-lectivos'), { inicial: [] });
const anoId = ref('');
watch(() => anos.dados.value, (lista) => { if (!anoId.value) anoId.value = lista.find((a) => a.activo)?.id ?? lista[0]?.id ?? ''; });
const turmas = usePedido(() => (anoId.value ? api.get('/turmas', { anoLectivo: anoId.value }) : Promise.resolve([])), { inicial: [], imediato: false });
watch(anoId, () => turmas.executar());

// Criação de turmas (director e secretaria)
const classes = usePedido(() => (gere.value ? api.get('/classes') : Promise.resolve([])), { inicial: [] });
const cursos = usePedido(() => (gere.value ? api.get('/cursos') : Promise.resolve([])), { inicial: [] });
const professores = usePedido(() => (gere.value ? api.get('/professores') : Promise.resolve([])), { inicial: [] });
const mostrarForm = ref(false);
const nova = reactive({ classe: '', curso: '', nome: 'A', turno: 'manha', sala: '', capacidade: 40, directorTurma: '' });
const classeNova = computed(() => classes.dados.value.find((c) => c.id === nova.classe));
const accao = useAccao();
async function criar() {
  const corpo = { ...nova, anoLectivo: anoId.value };
  for (const k of ['curso', 'sala', 'directorTurma']) if (!corpo[k]) delete corpo[k];
  if (classeNova.value?.ciclo !== 'ii_ciclo') delete corpo.curso;
  await accao.correr(() => api.post('/turmas', corpo), 'Turma criada.');
  if (!accao.erro.value) { mostrarForm.value = false; turmas.executar(); }
}

// Agrupar por classe
const grupos = computed(() => {
  const m = new Map();
  for (const t of turmas.dados.value) {
    const chave = t.designacao.split(' – ')[0].replace(/ [A-Z0-9]+$/, '');
    if (!m.has(chave)) m.set(chave, []);
    m.get(chave).push(t);
  }
  return [...m];
});
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <h1 class="h4 mb-0">{{ auth.perfil === 'professor' ? 'As minhas turmas' : 'Turmas' }}</h1>
    <div class="d-flex gap-2 align-items-center">
      <label for="ano" class="small">Ano lectivo</label>
      <select id="ano" v-model="anoId" class="form-select form-select-sm w-auto">
        <option v-for="a in anos.dados.value" :key="a.id" :value="a.id">{{ a.designacao }}{{ a.activo ? ' (activo)' : '' }}</option>
      </select>
      <button v-if="gere" type="button" class="btn btn-primary btn-sm" @click="mostrarForm = !mostrarForm">{{ mostrarForm ? 'Cancelar' : 'Nova turma' }}</button>
    </div>
  </div>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <form v-if="mostrarForm" class="card card-body shadow-sm mb-3" @submit.prevent="criar">
    <div class="row g-2">
      <div class="col-md-3"><label class="form-label" for="t-classe">Classe</label>
        <select id="t-classe" v-model="nova.classe" class="form-select" required>
          <option value="" disabled>—</option>
          <option v-for="c in classes.dados.value" :key="c.id" :value="c.id">{{ c.designacao }}</option>
        </select></div>
      <div v-if="classeNova?.ciclo === 'ii_ciclo'" class="col-md-3"><label class="form-label" for="t-curso">Curso</label>
        <select id="t-curso" v-model="nova.curso" class="form-select" :required="classeNova?.ramo === 'tecnico_profissional'">
          <option value="">—</option>
          <option v-for="c in cursos.dados.value.filter((x) => x.ramo === classeNova.ramo)" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select></div>
      <div class="col-4 col-md-1"><label class="form-label" for="t-nome">Turma</label><input id="t-nome" v-model="nova.nome" class="form-control" required /></div>
      <div class="col-8 col-md-2"><label class="form-label" for="t-turno">Turno</label>
        <select id="t-turno" v-model="nova.turno" class="form-select"><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option></select></div>
      <div class="col-6 col-md-1"><label class="form-label" for="t-sala">Sala</label><input id="t-sala" v-model="nova.sala" class="form-control" /></div>
      <div class="col-6 col-md-2"><label class="form-label" for="t-cap">Capacidade</label><input id="t-cap" v-model.number="nova.capacidade" type="number" min="1" max="80" class="form-control" /></div>
      <div class="col-md-4"><label class="form-label" for="t-dt">Director(a) de turma</label>
        <select id="t-dt" v-model="nova.directorTurma" class="form-select">
          <option value="">—</option>
          <option v-for="p in professores.dados.value" :key="p.id" :value="p.id">{{ p.nome }}</option>
        </select></div>
    </div>
    <div class="mt-3"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value || !anoId">Criar turma</button></div>
  </form>

  <EstadoPedido :carregando="turmas.carregando.value || anos.carregando.value" :erro="turmas.erro.value ?? anos.erro.value"
                :vazio="turmas.dados.value.length === 0"
                :texto-vazio="auth.perfil === 'professor' ? 'Ainda não tem turmas atribuídas neste ano lectivo.' : 'Não há turmas neste ano lectivo.'"
                @repetir="turmas.executar()">
    <section v-for="[classe, lista] in grupos" :key="classe" class="mb-3">
      <h2 class="h6 text-body-secondary">{{ classe }}</h2>
      <div class="list-group shadow-sm">
        <RouterLink v-for="t in lista" :key="t.id" :to="{ name: 'turma', params: { id: t.id } }"
                    class="list-group-item list-group-item-action d-flex flex-wrap justify-content-between gap-2">
          <span>{{ t.designacao }}<span v-if="auth.dirige(t.id)" class="badge text-bg-success ms-2">Director(a) de turma</span></span>
          <span class="small text-body-secondary">{{ t.sala ?? '' }} · {{ t.totalAlunos }}/{{ t.capacidade }} alunos</span>
        </RouterLink>
      </div>
    </section>
  </EstadoPedido>
</template>
