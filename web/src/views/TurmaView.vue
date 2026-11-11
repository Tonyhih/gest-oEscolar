<script setup>
import { computed, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const props = defineProps({ id: { type: String, required: true } });
const auth = useAutenticacao();
const accao = useAccao();

const turma = usePedido(() => api.get(`/turmas/${props.id}`));
const atribuicoes = usePedido(() => api.get(`/turmas/${props.id}/atribuicoes`), { inicial: [] });
const t = computed(() => turma.dados.value);
const ehDT = computed(() => auth.dirige(props.id));
const qualitativa = computed(() => t.value?.avaliacao.avaliacaoQualitativa);
const estagio = computed(() => t.value?.avaliacao.apenasEstagio);

// Disciplinas que o professor lecciona nesta turma
const ehProfessor = computed(() => auth.perfil === 'professor');
const minhas = computed(() => (ehProfessor.value
  ? atribuicoes.dados.value.filter((a) => a.professor === auth.utilizador.professorId)
  : atribuicoes.dados.value));
const verPautas = computed(() => auth.temPerfil('director', 'secretaria', 'coordenador') || ehDT.value);

// ---------------------------------------------------------------- Atribuições (director e coordenador)
const podeAtribuir = computed(() => auth.temPerfil('director', 'coordenador') && !qualitativa.value && !estagio.value);
const plano = ref([]);
const professores = ref([]);
const escolha = ref({});
const editarAtrib = ref(false);
async function abrirAtribuicoes() {
  const [planos, profs] = await Promise.all([
    api.get('/planos-curriculares', { classe: t.value.classeId, curso: t.value.cursoId ?? undefined }),
    api.get('/professores'),
  ]);
  plano.value = (planos.find((p) => (p.curso ?? null) === (t.value.cursoId ?? null))?.disciplinas) ?? [];
  professores.value = profs;
  escolha.value = Object.fromEntries(atribuicoes.dados.value.map((a) => [a.disciplina, a.professor]));
  editarAtrib.value = true;
}
async function gravarAtribuicoes() {
  const lista = Object.entries(escolha.value).filter(([, p]) => p).map(([disciplina, professor]) => ({ disciplina, professor }));
  const r = await accao.correr(() => api.put(`/turmas/${props.id}/atribuicoes`, lista), 'Atribuições gravadas.');
  if (r) { atribuicoes.dados.value = r; editarAtrib.value = false; }
}

// ---------------------------------------------------------------- Matrículas (secretaria)
const ehSecretaria = computed(() => auth.perfil === 'secretaria');
const pesquisa = ref('');
const resultados = ref([]);
async function procurar() {
  resultados.value = pesquisa.value.length < 2 ? [] : (await api.get('/alunos', { pesquisa: pesquisa.value, limite: 10 })).dados;
}
async function matricular(aluno) {
  await accao.correr(() => api.post('/matriculas', { aluno: aluno.id, turma: props.id }), `${aluno.nome} matriculado(a).`);
  if (!accao.erro.value) { pesquisa.value = ''; resultados.value = []; turma.executar(); }
}
async function anular(aluno) {
  const motivo = prompt(`Motivo para anular a matrícula de ${aluno.nome}:`);
  if (!motivo) return;
  await accao.correr(() => api.post(`/matriculas/${aluno.matricula}/anular`, { motivo }), 'Matrícula anulada.');
  turma.executar();
}
const mudanca = ref(null);
async function prepararMudanca(aluno) {
  const outras = (await api.get('/turmas', { anoLectivo: t.value.anoLectivoId })).filter((x) => x.id !== props.id);
  mudanca.value = { aluno, outras, turma: '', motivo: '' };
}
async function mudar() {
  const m = mudanca.value;
  await accao.correr(() => api.post(`/matriculas/${m.aluno.matricula}/mudar-turma`, { turma: m.turma, motivo: m.motivo }),
    `${m.aluno.nome} mudou de turma.`);
  if (!accao.erro.value) { mudanca.value = null; turma.executar(); }
}
</script>

<template>
  <RouterLink :to="{ name: 'turmas' }" class="small">&larr; Turmas</RouterLink>
  <EstadoPedido :carregando="turma.carregando.value" :erro="turma.erro.value" @repetir="turma.executar()">
    <template v-if="t">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 my-2">
        <div>
          <h1 class="h4 mb-0">{{ t.designacao }}</h1>
          <span class="text-body-secondary small">{{ t.sala ?? 'Sem sala' }} · {{ t.totalAlunos }}/{{ t.capacidade }} alunos ·
            escala 0–{{ t.avaliacao.escalaMaxima }}<template v-if="t.avaliacao.classeDeExame"> · classe de exame</template></span>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <RouterLink v-if="verPautas" class="btn btn-primary" :to="{ name: 'pautas', params: { id } }">Pautas</RouterLink>
          <RouterLink v-if="!qualitativa && !estagio" class="btn btn-outline-primary" :to="{ name: 'horario', params: { id } }">Horário</RouterLink>
          <RouterLink v-if="ehDT || auth.perfil === 'director'" class="btn btn-outline-primary" :to="{ name: 'faltas', params: { id } }">Faltas da turma</RouterLink>
          <RouterLink v-if="qualitativa && auth.perfil === 'professor'" class="btn btn-outline-primary" :to="{ name: 'descritiva', params: { id } }">Avaliação descritiva</RouterLink>
        </div>
      </div>
      <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

      <!-- Professor: as suas disciplinas nesta turma -->
      <section v-if="minhas.length" class="card shadow-sm mb-3">
        <div class="card-header">{{ ehProfessor ? 'As minhas disciplinas nesta turma' : 'Notas por disciplina' }}</div>
        <ul class="list-group list-group-flush">
          <li v-for="a in minhas" :key="a.disciplina" class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span><strong>{{ a.sigla }}</strong><span v-if="!ehProfessor" class="small text-body-secondary ms-2">{{ a.professorNome }}</span></span>
            <span class="d-flex gap-2">
              <RouterLink class="btn btn-sm btn-primary" :to="{ name: 'notas', params: { id, disciplina: a.disciplina } }">Notas</RouterLink>
              <RouterLink v-if="ehProfessor" class="btn btn-sm btn-outline-primary" :to="{ name: 'faltas', params: { id }, query: { disciplina: a.disciplina } }">Faltas</RouterLink>
            </span>
          </li>
        </ul>
      </section>

      <div class="row g-3">
        <section class="col-lg-7">
          <div class="card shadow-sm">
            <div class="card-header d-flex justify-content-between"><span>Alunos ({{ t.alunos.length }})</span></div>
            <ul class="list-group list-group-flush">
              <li v-for="(a, i) in t.alunos" :key="a.id" class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span><span class="text-body-secondary small me-2">{{ i + 1 }}.</span>
                  <RouterLink v-if="auth.perfil !== 'professor' || ehDT" :to="{ name: 'aluno', params: { id: a.id } }">{{ a.nome }}</RouterLink>
                  <template v-else>{{ a.nome }}</template>
                  <span class="small text-body-secondary ms-1">{{ a.numeroProcesso }}</span></span>
                <span v-if="ehSecretaria" class="d-flex gap-1">
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="prepararMudanca(a)">Mudar turma</button>
                  <button type="button" class="btn btn-sm btn-outline-danger" @click="anular(a)">Anular</button>
                </span>
              </li>
              <li v-if="!t.alunos.length" class="list-group-item text-body-secondary">Ainda não há alunos matriculados.</li>
            </ul>
            <form v-if="mudanca" class="card-body border-top" @submit.prevent="mudar">
              <h2 class="h6">Mudar {{ mudanca.aluno.nome }} de turma</h2>
              <div class="row g-2">
                <div class="col-md-6"><label class="form-label small" for="mt-turma">Nova turma</label>
                  <select id="mt-turma" v-model="mudanca.turma" class="form-select form-select-sm" required>
                    <option value="" disabled>—</option>
                    <option v-for="o in mudanca.outras" :key="o.id" :value="o.id">{{ o.designacao }}</option>
                  </select></div>
                <div class="col-md-6"><label class="form-label small" for="mt-mot">Motivo</label><input id="mt-mot" v-model="mudanca.motivo" class="form-control form-control-sm" minlength="3" required /></div>
              </div>
              <div class="mt-2 d-flex gap-2"><button type="submit" class="btn btn-sm btn-primary">Mudar</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="mudanca = null">Cancelar</button></div>
            </form>
            <div v-if="ehSecretaria" class="card-body border-top">
              <label for="procurar" class="form-label small">Matricular aluno nesta turma</label>
              <input id="procurar" v-model="pesquisa" type="search" class="form-control form-control-sm" placeholder="Nome ou n.º de processo" @input="procurar" />
              <ul v-if="resultados.length" class="list-group mt-2">
                <li v-for="r in resultados" :key="r.id" class="list-group-item d-flex justify-content-between align-items-center">
                  <span>{{ r.nome }} <span class="small text-body-secondary">{{ r.turma ?? 'sem turma' }}</span></span>
                  <button type="button" class="btn btn-sm btn-outline-primary" :disabled="!!r.turma || accao.ocupado.value" @click="matricular(r)">Matricular</button>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section v-if="!qualitativa && !estagio" class="col-lg-5">
          <div class="card shadow-sm">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span>Professores por disciplina</span>
              <button v-if="podeAtribuir && !editarAtrib" type="button" class="btn btn-sm btn-outline-primary" @click="abrirAtribuicoes">Editar</button>
            </div>
            <form v-if="editarAtrib" class="card-body" @submit.prevent="gravarAtribuicoes">
              <p v-if="!plano.length" class="text-body-secondary small">A classe ainda não tem plano curricular.</p>
              <div v-for="d in plano" :key="d.disciplina" class="mb-2">
                <label class="form-label small mb-0" :for="`at-${d.disciplina}`">{{ d.nome }}<span v-if="d.chave" class="badge text-bg-warning ms-1">chave</span></label>
                <select :id="`at-${d.disciplina}`" v-model="escolha[d.disciplina]" class="form-select form-select-sm">
                  <option value="">—</option>
                  <option v-for="p in professores" :key="p.id" :value="p.id">{{ p.nome }}</option>
                </select>
              </div>
              <div class="d-flex gap-2"><button type="submit" class="btn btn-sm btn-primary" :disabled="accao.ocupado.value">Gravar</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="editarAtrib = false">Cancelar</button></div>
            </form>
            <ul v-else class="list-group list-group-flush">
              <li v-for="a in atribuicoes.dados.value" :key="a.disciplina" class="list-group-item d-flex justify-content-between">
                <span>{{ a.sigla }}</span><span class="small">{{ a.professorNome }}</span>
              </li>
              <li v-if="!atribuicoes.dados.value.length" class="list-group-item text-body-secondary small">Sem professores atribuídos.</li>
            </ul>
          </div>
        </section>
      </div>
    </template>
  </EstadoPedido>
</template>
