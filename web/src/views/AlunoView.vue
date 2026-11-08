<script setup>
import { computed, reactive, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { data as fData } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const props = defineProps({ id: { type: String, required: true } });
const auth = useAutenticacao();
const ehSecretaria = computed(() => auth.perfil === 'secretaria');
const { dados: aluno, carregando, erro, executar } = usePedido(() => api.get(`/alunos/${props.id}`));
const accao = useAccao();

// Edição dos dados pessoais
const edicao = ref(null);
function editar() {
  const a = aluno.value;
  edicao.value = { nome: a.nome, dataNascimento: a.dataNascimento?.slice(0, 10), sexo: a.sexo, naturalidade: a.naturalidade ?? '',
                   morada: a.morada ?? '', telefone: a.telefone ?? '' };
}
async function gravar() {
  const corpo = Object.fromEntries(Object.entries(edicao.value).filter(([, v]) => v !== ''));
  const r = await accao.correr(() => api.patch(`/alunos/${props.id}`, corpo), 'Dados gravados.');
  if (r) { aluno.value = r; edicao.value = null; }
}

// Encarregados (RF16)
const ee = reactive({ nome: '', telefone: '', parentesco: 'Mãe' });
async function acrescentarEncarregado() {
  const r = await accao.correr(async () => {
    const novo = await api.post('/encarregados', { nome: ee.nome, telefone: ee.telefone });
    const lista = aluno.value.encarregados.map((x) => ({ encarregado: x.encarregado.id, parentesco: x.parentesco, principal: x.principal }));
    lista.push({ encarregado: novo.id, parentesco: ee.parentesco, principal: lista.length === 0 });
    return api.put(`/alunos/${props.id}/encarregados`, lista);
  }, 'Encarregado acrescentado.');
  if (r) { aluno.value = r; Object.assign(ee, { nome: '', telefone: '', parentesco: 'Mãe' }); }
}

// Confirmação de matrícula noutro ano lectivo (RF22)
const ultima = computed(() => aluno.value?.matriculas?.find((m) => ['activa', 'concluida'].includes(m.estado)));
const anos = usePedido(() => (ehSecretaria.value ? api.get('/anos-lectivos') : Promise.resolve([])), { inicial: [] });
const anoNovo = ref('');
const turmasAno = ref([]);
const turmaNova = ref('');
async function escolherAno() {
  turmaNova.value = '';
  turmasAno.value = anoNovo.value ? await api.get('/turmas', { anoLectivo: anoNovo.value }) : [];
}
async function confirmar() {
  await accao.correr(() => api.post('/matriculas/confirmacoes', { matriculaAnterior: ultima.value.id, turma: turmaNova.value }),
    'Matrícula confirmada.');
  if (!accao.erro.value) { anoNovo.value = ''; turmasAno.value = []; executar(); }
}
</script>

<template>
  <RouterLink v-if="auth.perfil !== 'professor'" :to="{ name: 'alunos' }" class="small">&larr; Alunos</RouterLink>
  <EstadoPedido :carregando="carregando" :erro="erro" @repetir="executar()">
    <template v-if="aluno">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 my-2">
        <div>
          <h1 class="h4 mb-0">{{ aluno.nome }}</h1>
          <span class="text-body-secondary">Processo {{ aluno.numeroProcesso }}</span>
          <span v-if="aluno.estado !== 'activo'" class="badge text-bg-secondary ms-2">inactivo</span>
        </div>
        <button v-if="ehSecretaria && !edicao" type="button" class="btn btn-outline-primary" @click="editar">Editar dados</button>
      </div>
      <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

      <div class="row g-3">
        <section class="col-lg-6">
          <div class="card shadow-sm">
            <div class="card-header">Dados pessoais</div>
            <form v-if="edicao" class="card-body" @submit.prevent="gravar">
              <div class="row g-2">
                <div class="col-12"><label class="form-label" for="ed-nome">Nome</label><input id="ed-nome" v-model="edicao.nome" class="form-control" required /></div>
                <div class="col-6"><label class="form-label" for="ed-nasc">Nascimento</label><input id="ed-nasc" v-model="edicao.dataNascimento" type="date" class="form-control" required /></div>
                <div class="col-6"><label class="form-label" for="ed-sexo">Sexo</label>
                  <select id="ed-sexo" v-model="edicao.sexo" class="form-select"><option value="F">Feminino</option><option value="M">Masculino</option></select></div>
                <div class="col-6"><label class="form-label" for="ed-nat">Naturalidade</label><input id="ed-nat" v-model="edicao.naturalidade" class="form-control" /></div>
                <div class="col-6"><label class="form-label" for="ed-tel">Telefone</label><input id="ed-tel" v-model="edicao.telefone" class="form-control" /></div>
                <div class="col-12"><label class="form-label" for="ed-mor">Morada</label><input id="ed-mor" v-model="edicao.morada" class="form-control" /></div>
              </div>
              <div class="mt-3 d-flex gap-2"><button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value">Gravar</button>
                <button type="button" class="btn btn-outline-secondary" @click="edicao = null">Cancelar</button></div>
            </form>
            <dl v-else class="card-body row mb-0">
              <dt class="col-5">Data de nascimento</dt><dd class="col-7">{{ fData(aluno.dataNascimento) }}</dd>
              <dt class="col-5">Sexo</dt><dd class="col-7">{{ aluno.sexo === 'F' ? 'Feminino' : 'Masculino' }}</dd>
              <template v-if="'morada' in aluno">
                <dt class="col-5">Naturalidade</dt><dd class="col-7">{{ aluno.naturalidade ?? '—' }}</dd>
                <dt class="col-5">Telefone</dt><dd class="col-7">{{ aluno.telefone ?? '—' }}</dd>
                <dt class="col-5">Morada</dt><dd class="col-7">{{ aluno.morada ?? '—' }}</dd>
              </template>
            </dl>
          </div>
        </section>

        <section class="col-lg-6">
          <div class="card shadow-sm mb-3">
            <div class="card-header">Encarregados de educação</div>
            <ul class="list-group list-group-flush">
              <li v-for="e in aluno.encarregados" :key="e.encarregado.id" class="list-group-item">
                <strong>{{ e.encarregado.nome }}</strong> <span class="text-body-secondary">({{ e.parentesco }})</span>
                <span v-if="e.principal" class="badge text-bg-success ms-1">principal</span><br />
                <a :href="`tel:${e.encarregado.telefone}`" class="small">{{ e.encarregado.telefone }}</a>
              </li>
              <li v-if="!aluno.encarregados.length" class="list-group-item text-body-secondary">Sem encarregados registados.</li>
            </ul>
            <form v-if="ehSecretaria" class="card-body border-top" @submit.prevent="acrescentarEncarregado">
              <div class="row g-2">
                <div class="col-md-5"><label class="form-label small" for="ee-nome">Nome</label><input id="ee-nome" v-model="ee.nome" class="form-control form-control-sm" required /></div>
                <div class="col-md-4"><label class="form-label small" for="ee-tel">Telefone</label><input id="ee-tel" v-model="ee.telefone" class="form-control form-control-sm" required /></div>
                <div class="col-md-3"><label class="form-label small" for="ee-par">Parentesco</label><input id="ee-par" v-model="ee.parentesco" class="form-control form-control-sm" required /></div>
              </div>
              <button type="submit" class="btn btn-sm btn-outline-primary mt-2" :disabled="accao.ocupado.value">Acrescentar</button>
            </form>
          </div>

          <div v-if="aluno.matriculas" class="card shadow-sm">
            <div class="card-header">Matrículas</div>
            <ul class="list-group list-group-flush">
              <li v-for="m in aluno.matriculas" :key="m.id" class="list-group-item d-flex justify-content-between">
                <span>{{ m.anoLectivoDesignacao }} · <RouterLink :to="{ name: 'turma', params: { id: m.turma } }">{{ m.turmaDesignacao }}</RouterLink></span>
                <span class="small">{{ m.tipo === 'confirmacao' ? 'Confirmação' : 'Matrícula' }} ·
                  <span :class="m.estado === 'activa' ? 'text-success' : 'text-body-secondary'">{{ m.estado }}</span></span>
              </li>
              <li v-if="!aluno.matriculas.length" class="list-group-item text-body-secondary">Ainda sem matrícula. Matricule a partir da página da turma.</li>
            </ul>
            <form v-if="ehSecretaria && ultima" class="card-body border-top" @submit.prevent="confirmar">
              <h2 class="h6">Confirmar matrícula noutro ano lectivo</h2>
              <div class="row g-2">
                <div class="col-6"><label class="form-label small" for="cf-ano">Ano lectivo</label>
                  <select id="cf-ano" v-model="anoNovo" class="form-select form-select-sm" @change="escolherAno">
                    <option value="">—</option>
                    <option v-for="a in anos.dados.value.filter((x) => x.id !== ultima.anoLectivo)" :key="a.id" :value="a.id">{{ a.designacao }}</option>
                  </select></div>
                <div class="col-6"><label class="form-label small" for="cf-turma">Turma</label>
                  <select id="cf-turma" v-model="turmaNova" class="form-select form-select-sm" :disabled="!turmasAno.length">
                    <option value="">—</option>
                    <option v-for="t in turmasAno" :key="t.id" :value="t.id">{{ t.designacao }} ({{ t.totalAlunos }}/{{ t.capacidade }})</option>
                  </select></div>
              </div>
              <p v-if="anoNovo && !turmasAno.length" class="small text-body-secondary mt-2 mb-0">Esse ano lectivo ainda não tem turmas.</p>
              <button type="submit" class="btn btn-sm btn-outline-primary mt-2" :disabled="!turmaNova || accao.ocupado.value">Confirmar</button>
            </form>
          </div>
        </section>
      </div>
    </template>
  </EstadoPedido>
</template>
