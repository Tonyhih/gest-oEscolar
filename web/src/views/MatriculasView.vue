<script setup>
import { computed, reactive, ref } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido, useAccao } from '@/composables/usePedido.js';
import { useAutenticacao } from '@/stores/autenticacao.js';
import { data as fData } from '@/util/formatar.js';
import { lerLista, exemploDeTeste } from '@/util/importacao.js';
import EstadoPedido from '@/components/EstadoPedido.vue';
import MensagemAccao from '@/components/MensagemAccao.vue';

const auth = useAutenticacao();
const ehSecretaria = computed(() => auth.perfil === 'secretaria');
const separadores = computed(() => [
  ...(ehSecretaria.value ? [{ id: 'nova', texto: 'Nova matrícula' }, { id: 'importar', texto: 'Importar lista' }] : []),
  { id: 'lista', texto: 'Matrículas do ano' },
]);
const activo = ref(separadores.value[0].id);
const accao = useAccao();

// Turmas do ano lectivo activo, com as vagas
const turmas = usePedido(() => api.get('/turmas'), { inicial: [] });
const vagas = (t) => t.capacidade - t.totalAlunos;
const rotuloTurma = (t) => `${t.designacao} · ${vagas(t) > 0 ? `${vagas(t)} ${vagas(t) === 1 ? 'vaga' : 'vagas'}` : 'cheia'}`;

// ---------------------------------------------------------------- Nova matrícula
const fichaVazia = () => ({
  aluno: { nome: '', dataNascimento: '', sexo: 'F', telefone: '', morada: '', naturalidade: '' },
  comEncarregado: true,
  encarregado: { nome: '', telefone: '', parentesco: 'Mãe' },
});
const ficha = reactive(fichaVazia());
const turmaFicha = ref('');
const ultima = ref(null);
async function matricular() {
  const aluno = Object.fromEntries(Object.entries(ficha.aluno).filter(([, v]) => v !== ''));
  const corpo = { aluno, turma: turmaFicha.value, ...(ficha.comEncarregado ? { encarregado: ficha.encarregado } : {}) };
  const r = await accao.correr(() => api.post('/matriculas/novas', corpo));
  if (r) {
    ultima.value = r;
    Object.assign(ficha, fichaVazia()); // a turma fica escolhida para a matrícula seguinte
    turmas.executar();
    lista.executar();
  }
}

// ---------------------------------------------------------------- Importar lista
const texto = ref('');
const turmaImport = ref('');
const linhas = computed(() => lerLista(texto.value));
const comErros = computed(() => linhas.value.filter((l) => l.erros.length));
const turmaEscolhida = computed(() => turmas.dados.value.find((t) => t.id === turmaImport.value));
const semVagas = computed(() => turmaEscolhida.value && linhas.value.length > vagas(turmaEscolhida.value));
const resultado = ref(null);
async function importar() {
  const alunos = linhas.value.map(({ linha, erros, ...a }) => a);
  const r = await accao.correr(() => api.post('/matriculas/importacao', { turma: turmaImport.value, alunos }));
  if (r) {
    resultado.value = r;
    texto.value = '';
    turmas.executar();
    lista.executar();
  }
}

// ---------------------------------------------------------------- Lista do ano
const lista = usePedido(() => api.get('/matriculas'), { inicial: [] });
const filtroTurma = ref('');
const pesquisa = ref('');
const filtradas = computed(() => lista.dados.value.filter((m) =>
  (!filtroTurma.value || m.turma === filtroTurma.value)
  && (!pesquisa.value || `${m.aluno.nome} ${m.aluno.numeroProcesso}`.toLowerCase().includes(pesquisa.value.toLowerCase()))));
const ESTADOS = { activa: 'text-bg-success', anulada: 'text-bg-secondary', transferida: 'text-bg-warning', concluida: 'text-bg-primary' };
</script>

<template>
  <h1 class="h4 mb-3">Matrículas</h1>
  <ul class="nav nav-tabs mb-3" role="tablist">
    <li v-for="s in separadores" :key="s.id" class="nav-item" role="presentation">
      <button type="button" class="nav-link" :class="{ active: activo === s.id }" role="tab" :aria-selected="activo === s.id"
              @click="activo = s.id; accao.erro.value = null; accao.sucesso.value = ''">{{ s.texto }}</button>
    </li>
  </ul>
  <MensagemAccao :erro="accao.erro.value" :sucesso="accao.sucesso.value" />

  <EstadoPedido v-if="activo !== 'lista'" :carregando="turmas.carregando.value" :erro="turmas.erro.value"
                :vazio="turmas.dados.value.length === 0" @repetir="turmas.executar()">
    <template #vazio>Ainda não há turmas no ano lectivo activo. O director tem de criar o ano lectivo, as classes e as turmas.</template>

    <!-- Nova matrícula -->
    <form v-if="activo === 'nova'" class="card shadow-sm" @submit.prevent="matricular">
      <div class="card-body">
        <div v-if="ultima" class="alert alert-success py-2" role="status">
          <strong>{{ ultima.aluno.nome }}</strong> matriculado(a) na {{ ultima.turmaDesignacao }} com o processo
          <strong>{{ ultima.aluno.numeroProcesso }}</strong>.
          <RouterLink :to="{ name: 'aluno', params: { id: ultima.aluno.id } }">Abrir a ficha</RouterLink>
        </div>
        <h2 class="h6">Aluno</h2>
        <div class="row g-2 mb-3">
          <div class="col-md-6"><label class="form-label small" for="m-nome">Nome completo</label><input id="m-nome" v-model="ficha.aluno.nome" class="form-control" required minlength="3" /></div>
          <div class="col-6 col-md-3"><label class="form-label small" for="m-nasc">Data de nascimento</label><input id="m-nasc" v-model="ficha.aluno.dataNascimento" type="date" class="form-control" required /></div>
          <div class="col-6 col-md-3"><label class="form-label small" for="m-sexo">Sexo</label>
            <select id="m-sexo" v-model="ficha.aluno.sexo" class="form-select"><option value="F">Feminino</option><option value="M">Masculino</option></select></div>
          <div class="col-md-4"><label class="form-label small" for="m-nat">Naturalidade</label><input id="m-nat" v-model="ficha.aluno.naturalidade" class="form-control" /></div>
          <div class="col-md-4"><label class="form-label small" for="m-tel">Telefone</label><input id="m-tel" v-model="ficha.aluno.telefone" type="tel" class="form-control" placeholder="+244 9xx xxx xxx" /></div>
          <div class="col-md-4"><label class="form-label small" for="m-mor">Morada</label><input id="m-mor" v-model="ficha.aluno.morada" class="form-control" /></div>
        </div>

        <div class="form-check mb-2">
          <input id="m-com-ee" v-model="ficha.comEncarregado" class="form-check-input" type="checkbox" />
          <label class="form-check-label fw-semibold" for="m-com-ee">Encarregado de educação</label>
        </div>
        <div v-if="ficha.comEncarregado" class="row g-2 mb-3">
          <div class="col-md-5"><label class="form-label small" for="m-ee-nome">Nome</label><input id="m-ee-nome" v-model="ficha.encarregado.nome" class="form-control" required minlength="3" /></div>
          <div class="col-md-4"><label class="form-label small" for="m-ee-tel">Telefone</label><input id="m-ee-tel" v-model="ficha.encarregado.telefone" type="tel" class="form-control" required /></div>
          <div class="col-md-3"><label class="form-label small" for="m-ee-par">Parentesco</label><input id="m-ee-par" v-model="ficha.encarregado.parentesco" class="form-control" required /></div>
        </div>

        <h2 class="h6">Turma</h2>
        <div class="row g-2">
          <div class="col-md-6">
            <label class="visually-hidden" for="m-turma">Turma</label>
            <select id="m-turma" v-model="turmaFicha" class="form-select" required>
              <option value="" disabled>Escolha a turma</option>
              <option v-for="t in turmas.dados.value" :key="t.id" :value="t.id" :disabled="vagas(t) <= 0">{{ rotuloTurma(t) }}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 align-items-center">
        <button type="submit" class="btn btn-primary" :disabled="accao.ocupado.value || !turmaFicha">Matricular</button>
        <span class="small text-body-secondary">O n.º de processo é gerado automaticamente. Se alguma coisa falhar, nada fica gravado.</span>
      </div>
    </form>

    <!-- Importar lista -->
    <div v-else-if="activo === 'importar'" class="card shadow-sm">
      <div class="card-body">
        <div v-if="resultado" class="alert alert-success py-2" role="status">
          {{ resultado.importados }} alunos importados e matriculados na {{ resultado.matriculas[0]?.turmaDesignacao }}.
        </div>
        <div class="row g-2 mb-2">
          <div class="col-md-6"><label class="form-label small" for="i-turma">Turma</label>
            <select id="i-turma" v-model="turmaImport" class="form-select">
              <option value="" disabled>Escolha a turma</option>
              <option v-for="t in turmas.dados.value" :key="t.id" :value="t.id" :disabled="vagas(t) <= 0">{{ rotuloTurma(t) }}</option>
            </select></div>
        </div>
        <label class="form-label small" for="i-lista">Cole a lista: uma linha por aluno, com os campos separados por <kbd>;</kbd> (ou copiados do Excel)</label>
        <textarea id="i-lista" v-model="texto" class="form-control font-monospace small" rows="8"
                  placeholder="Nome; Data de nascimento; Sexo; Encarregado; Telefone do encarregado&#10;Ana Paulo; 01/02/2013; F; Rosa Paulo; +244 923 000 001"></textarea>
        <div class="d-flex flex-wrap gap-2 mt-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" @click="texto = exemploDeTeste(); resultado = null">Preencher com 10 alunos de teste</button>
          <span class="small text-body-secondary align-self-center">O encarregado e o telefone são opcionais.</span>
        </div>

        <template v-if="linhas.length">
          <div class="table-responsive mt-3">
            <table class="table table-sm align-middle mb-0">
              <caption class="small">{{ linhas.length }} alunos na lista<template v-if="comErros.length"> · {{ comErros.length }} com erros</template></caption>
              <thead><tr><th>Linha</th><th>Nome</th><th>Nascimento</th><th>Sexo</th><th>Encarregado</th><th></th></tr></thead>
              <tbody>
                <tr v-for="l in linhas" :key="l.linha" :class="{ 'table-danger': l.erros.length }">
                  <td>{{ l.linha }}</td><td>{{ l.nome }}</td><td>{{ l.dataNascimento ? fData(l.dataNascimento) : '—' }}</td>
                  <td>{{ l.sexo ?? '—' }}</td><td class="small">{{ l.encarregadoNome ?? '' }} {{ l.encarregadoTelefone ?? '' }}</td>
                  <td class="small text-danger">{{ l.erros.join('; ') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="semVagas" class="text-danger small mt-2 mb-0" role="alert">
            A turma só tem {{ vagas(turmaEscolhida) }} vagas para {{ linhas.length }} alunos.</p>
        </template>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 align-items-center">
        <button type="button" class="btn btn-primary" :disabled="accao.ocupado.value || !turmaImport || !linhas.length || comErros.length > 0 || semVagas"
                @click="importar">Importar {{ linhas.length || '' }} {{ linhas.length === 1 ? 'aluno' : 'alunos' }}</button>
        <span class="small text-body-secondary">Tudo ou nada: se uma linha falhar, nenhum aluno é importado.</span>
      </div>
    </div>
  </EstadoPedido>

  <!-- Matrículas do ano -->
  <template v-if="activo === 'lista'">
    <div class="row g-2 mb-2">
      <div class="col-md-5"><label class="visually-hidden" for="l-pesq">Pesquisar</label>
        <input id="l-pesq" v-model="pesquisa" type="search" class="form-control" placeholder="Pesquisar por nome ou n.º de processo" /></div>
      <div class="col-md-4"><label class="visually-hidden" for="l-turma">Turma</label>
        <select id="l-turma" v-model="filtroTurma" class="form-select">
          <option value="">Todas as turmas</option>
          <option v-for="t in turmas.dados.value" :key="t.id" :value="t.id">{{ t.designacao }}</option>
        </select></div>
    </div>
    <EstadoPedido :carregando="lista.carregando.value" :erro="lista.erro.value" :vazio="filtradas.length === 0"
                  texto-vazio="Não há matrículas no ano lectivo activo." @repetir="lista.executar()">
      <div class="table-responsive card shadow-sm">
        <table class="table table-sm table-hover mb-0 align-middle">
          <caption class="small px-2">{{ filtradas.length }} matrículas</caption>
          <thead><tr><th>Aluno</th><th>Processo</th><th>Turma</th><th>Tipo</th><th>Estado</th><th>Data</th></tr></thead>
          <tbody>
            <tr v-for="m in filtradas" :key="m.id">
              <td><RouterLink :to="{ name: 'aluno', params: { id: m.aluno.id } }">{{ m.aluno.nome }}</RouterLink></td>
              <td class="small">{{ m.aluno.numeroProcesso }}</td>
              <td><RouterLink :to="{ name: 'turma', params: { id: m.turma } }">{{ m.turmaDesignacao }}</RouterLink></td>
              <td class="small">{{ m.tipo === 'confirmacao' ? 'Confirmação' : 'Matrícula' }}</td>
              <td><span class="badge" :class="ESTADOS[m.estado]">{{ m.estado }}</span></td>
              <td class="small">{{ fData(m.criadoEm) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </EstadoPedido>
  </template>
</template>
