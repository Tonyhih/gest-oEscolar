<script setup>
import { reactive } from 'vue';
import { api } from '@/api/cliente.js';
import { usePedido } from '@/composables/usePedido.js';
import { dataHora } from '@/util/formatar.js';
import EstadoPedido from '@/components/EstadoPedido.vue';

const filtro = reactive({ entidade: '', de: '', ate: '', pagina: 1 });
const { dados, carregando, erro, executar } = usePedido(
  () => api.get('/auditoria', { ...filtro, entidade: filtro.entidade || undefined, limite: 25 }), { inicial: { dados: [], total: 0, limite: 25, pagina: 1 } });
const ENTIDADES = { nota: 'Notas', matricula: 'Matrículas', falta: 'Faltas', aluno: 'Alunos', utilizador: 'Utilizadores',
                    turma: 'Turmas', classe: 'Classes', ano_lectivo: 'Anos lectivos', plano_curricular: 'Planos' };
const ACCOES = { corrigir_nota: 'Correcção de nota', lancar: 'Lançamento', publicar: 'Publicação', criar: 'Criação', anular: 'Anulação',
                 mudar_turma: 'Mudança de turma', justificar: 'Justificação', exportar_pauta: 'Exportação de pauta', marcar: 'Registo de faltas' };
function filtrar() { filtro.pagina = 1; executar(); }
function irPara(p) { filtro.pagina = p; executar(); }
const resumir = (o) => (o ? JSON.stringify(o).slice(0, 160) : '');
</script>

<template>
  <h1 class="h4 mb-3">Auditoria</h1>
  <form class="row g-2 mb-3 align-items-end" @submit.prevent="filtrar">
    <div class="col-12 col-md-3"><label class="form-label small" for="au-ent">Tipo</label>
      <select id="au-ent" v-model="filtro.entidade" class="form-select form-select-sm">
        <option value="">Todos</option><option v-for="(t, k) in ENTIDADES" :key="k" :value="k">{{ t }}</option>
      </select></div>
    <div class="col-6 col-md-3"><label class="form-label small" for="au-de">De</label><input id="au-de" v-model="filtro.de" type="date" class="form-control form-control-sm" /></div>
    <div class="col-6 col-md-3"><label class="form-label small" for="au-ate">Até</label><input id="au-ate" v-model="filtro.ate" type="date" class="form-control form-control-sm" /></div>
    <div class="col-12 col-md-3"><button type="submit" class="btn btn-sm btn-primary">Filtrar</button></div>
  </form>
  <EstadoPedido :carregando="carregando" :erro="erro" :vazio="dados.dados.length === 0" texto-vazio="Sem registos para estes filtros." @repetir="executar()">
    <div class="table-responsive card shadow-sm">
      <table class="table table-sm mb-0 align-middle">
        <thead><tr><th>Data</th><th>Quem</th><th>O quê</th><th>Detalhes</th></tr></thead>
        <tbody>
          <tr v-for="r in dados.dados" :key="r.id">
            <td class="text-nowrap small">{{ dataHora(r.data) }}</td>
            <td class="small">{{ r.utilizador }}</td>
            <td class="small">{{ ACCOES[r.accao] ?? r.accao }} <span class="text-body-secondary">({{ ENTIDADES[r.entidade] ?? r.entidade }})</span></td>
            <td class="small">
              <div v-if="r.justificacao"><strong>Justificação:</strong> {{ r.justificacao }}</div>
              <div v-if="r.antes" class="text-body-secondary font-monospace text-break">antes: {{ resumir(r.antes) }}</div>
              <div v-if="r.depois" class="text-body-secondary font-monospace text-break">depois: {{ resumir(r.depois) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav v-if="dados.total > dados.limite" class="mt-2" aria-label="Páginas">
      <ul class="pagination pagination-sm">
        <li class="page-item" :class="{ disabled: dados.pagina === 1 }"><button type="button" class="page-link" @click="irPara(dados.pagina - 1)">Anterior</button></li>
        <li class="page-item disabled"><span class="page-link">{{ dados.pagina }} / {{ Math.ceil(dados.total / dados.limite) }}</span></li>
        <li class="page-item" :class="{ disabled: dados.pagina * dados.limite >= dados.total }"><button type="button" class="page-link" @click="irPara(dados.pagina + 1)">Seguinte</button></li>
      </ul>
    </nav>
  </EstadoPedido>
</template>
