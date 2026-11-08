<script setup>
import { computed } from 'vue';
import { useAutenticacao, NOMES_PERFIL } from '@/stores/autenticacao.js';
import { api } from '@/api/cliente.js';
import { usePedido } from '@/composables/usePedido.js';
import EstadoPedido from '@/components/EstadoPedido.vue';

const auth = useAutenticacao();
const ehPlataforma = auth.perfil === 'admin_plataforma';
const turmas = usePedido(() => (ehPlataforma ? Promise.resolve([]) : api.get('/turmas')), { inicial: [] });

const atalhos = computed(() => ({
  admin_plataforma: [{ to: { name: 'escolas' }, titulo: 'Escolas', texto: 'Registar escolas, activar ou desactivar, criar a conta do director.' }],
  director: [
    { to: { name: 'painel' }, titulo: 'Painel', texto: 'Alunos, turmas e transição por classe no ano lectivo.' },
    { to: { name: 'configuracao' }, titulo: 'Configuração', texto: 'Ano lectivo, trimestres, classes, cursos, disciplinas e planos.' },
    { to: { name: 'utilizadores' }, titulo: 'Utilizadores', texto: 'Secretaria, coordenação e professores.' },
    { to: { name: 'turmas' }, titulo: 'Turmas e pautas', texto: 'Turmas, atribuições, pautas e publicação.' },
    { to: { name: 'auditoria' }, titulo: 'Auditoria', texto: 'Quem alterou o quê e quando.' },
  ],
  secretaria: [
    { to: { name: 'matriculas' }, titulo: 'Matrículas', texto: 'Ficha de matrícula de um aluno novo ou importar uma lista para uma turma.' },
    { to: { name: 'alunos' }, titulo: 'Alunos', texto: 'Registar alunos e encarregados, processos.' },
    { to: { name: 'turmas' }, titulo: 'Turmas e matrículas', texto: 'Criar turmas, matricular e confirmar matrículas.' },
  ],
  coordenador: [
    { to: { name: 'configuracao' }, titulo: 'Cursos e planos', texto: 'Disciplinas, planos curriculares e disciplinas-chave.' },
    { to: { name: 'turmas' }, titulo: 'Turmas', texto: 'Atribuir professores às disciplinas.' },
  ],
  professor: [],
}[auth.perfil] ?? []));
</script>

<template>
  <h1 class="h4">Olá, {{ auth.utilizador.nome }}</h1>
  <p class="text-body-secondary">{{ NOMES_PERFIL[auth.perfil] }}<template v-if="auth.utilizador.escola"> · {{ auth.utilizador.escola.nome }}</template></p>

  <div v-if="atalhos.length" class="row g-3 mb-4">
    <div v-for="a in atalhos" :key="a.titulo" class="col-12 col-sm-6 col-lg-3">
      <RouterLink :to="a.to" class="card h-100 text-decoration-none shadow-sm">
        <div class="card-body">
          <h2 class="h6 card-title text-success">{{ a.titulo }}</h2>
          <p class="card-text small text-body-secondary mb-0">{{ a.texto }}</p>
        </div>
      </RouterLink>
    </div>
  </div>

  <template v-if="!ehPlataforma">
    <h2 class="h5">{{ auth.perfil === 'professor' ? 'As minhas turmas' : 'Turmas do ano lectivo activo' }}</h2>
    <EstadoPedido :carregando="turmas.carregando.value" :erro="turmas.erro.value" :vazio="turmas.dados.value.length === 0"
                  texto-vazio="Não há turmas no ano lectivo activo." @repetir="turmas.executar()">
      <div class="list-group shadow-sm">
        <RouterLink v-for="t in turmas.dados.value" :key="t.id" :to="{ name: 'turma', params: { id: t.id } }"
                    class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
          <span>
            {{ t.designacao }}
            <span v-if="auth.dirige(t.id)" class="badge text-bg-success ms-1">Director(a) de turma</span>
          </span>
          <span class="badge text-bg-light border">{{ t.totalAlunos }} alunos</span>
        </RouterLink>
      </div>
    </EstadoPedido>
  </template>
</template>
