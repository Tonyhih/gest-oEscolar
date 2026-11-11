// Controladores: lêem o pedido já validado (req.dados), chamam o serviço e respondem.
// Não têm regras de negócio; essas estão em src/services.

import * as autenticacao from '../services/autenticacao.js';
import * as plataforma from '../services/plataforma.js';
import * as utilizadores from '../services/utilizadores.js';
import * as estrutura from '../services/estrutura.js';
import * as pessoas from '../services/pessoas.js';
import * as turmas from '../services/turmas.js';
import * as matriculas from '../services/matriculas.js';
import * as notas from '../services/notas.js';
import * as faltas from '../services/faltas.js';
import * as auditoria from '../services/auditoria.js';
import * as estagios from '../services/estagios.js';
import * as painel from '../services/painel.js';
import * as documentos from '../services/documentos.js';
import * as historico from '../services/historico.js';
import * as portal from '../services/portal.js';
import * as horarios from '../services/horarios.js';
import * as declaracoes from '../services/declaracoes.js';
import * as financas from '../services/financas.js';
import * as avisos from '../services/avisos.js';
import { recibo as reciboPdf } from '../pdf/documentos.js';

/** Cria um controlador a partir de fn(req), que devolve o corpo da resposta. */
const acao = (fn, estado = 200) => async (req, res) => {
  const corpo = await fn(req, req.dados ?? {}, req.utilizador);
  if (estado === 204) return res.status(204).end();
  res.status(estado).json(corpo);
};

/** Envia um PDF como ficheiro para descarregar. */
function enviarPdf(res, nome, buffer) {
  res.type('application/pdf').attachment(nome).send(buffer);
}

export const documentosCtrl = {
  async miniPauta(req, res) {
    const { params, query } = req.dados;
    enviarPdf(res, `mini-pauta-${query.trimestre}-trimestre.pdf`,
      await documentos.miniPauta(req.bd, req.utilizador, params.id, params.disciplinaId, query.trimestre));
  },
  async termo(req, res) {
    enviarPdf(res, 'termo-frequencia-aproveitamento.pdf', await documentos.termo(req.bd, req.utilizador, req.dados.params.id, req.dados.query));
  },
  previa: acao((req, d, u) => documentos.previaCertificado(req.bd, u, d.params.id, d.query.ciclo)),
  emitir: acao((req, d, u) => documentos.emitirCertificado(req.bd, u, d.params.id, d.body), 201),
  declaracao: acao((req, d, u) => declaracoes.emitir(req.bd, u, d.params.id, d.body), 201),
  listar: acao((req, d, u) => documentos.listarDocumentos(req.bd, u, d.params.id)),
  async pdf(req, res) {
    const r = await documentos.documentoPdf(req.bd, req.utilizador, req.dados.params.id);
    enviarPdf(res, r.nome, r.pdf);
  },
  escola: acao((req, d, u) => documentos.obterEscola(req.bd, u)),
  actualizarEscola: acao((req, d, u) => documentos.actualizarEscola(req.bd, u, d.body)),
};

export const sistema = {
  saude: acao(async (req) => {
    await req.bd.query('SELECT 1');
    return { estado: 'ok' };
  }),
};

export const auth = (config) => ({
  entrar: acao((req, d) => autenticacao.entrar(req.bd, config, d.body)),
  eu: acao((req, d, u) => autenticacao.sessao(u)),
  alterarPalavraPasse: acao((req, d, u) => autenticacao.alterarPalavraPasse(req.bd, u, d.body), 204),
});

export const escolas = {
  listar: acao((req, d) => plataforma.listarEscolas(req.bd, d.query)),
  criar: acao((req, d, u) => plataforma.criarEscola(req.bd, u, d.body), 201),
  actualizar: acao((req, d, u) => plataforma.actualizarEscola(req.bd, u, d.params.id, d.body)),
  criarDirector: acao((req, d, u) => plataforma.criarDirector(req.bd, u, d.params.id, d.body), 201),
};

export const utilizadoresCtrl = {
  listar: acao((req, d, u) => utilizadores.listar(req.bd, u, d.query)),
  criar: acao((req, d, u) => utilizadores.criar(req.bd, u, d.body), 201),
  actualizar: acao((req, d, u) => utilizadores.actualizar(req.bd, u, d.params.id, d.body)),
  reporPalavraPasse: acao((req, d, u) => utilizadores.reporPalavraPasse(req.bd, u, d.params.id)),
};

export const estruturaCtrl = {
  listarAnos: acao((req, d, u) => estrutura.listarAnos(req.bd, u)),
  criarAno: acao((req, d, u) => estrutura.criarAno(req.bd, u, d.body), 201),
  actualizarAno: acao((req, d, u) => estrutura.actualizarAno(req.bd, u, d.params.id, d.body)),
  activarAno: acao((req, d, u) => estrutura.activarAno(req.bd, u, d.params.id)),
  catalogo: acao((req) => estrutura.catalogo(req.bd)),
  listarClasses: acao((req, d, u) => estrutura.listarClasses(req.bd, u)),
  criarClasse: acao((req, d, u) => estrutura.criarClasse(req.bd, u, d.body), 201),
  actualizarClasse: acao((req, d, u) => estrutura.actualizarClasse(req.bd, u, d.params.id, d.body)),
  listarCursos: acao((req, d, u) => estrutura.listarCursos(req.bd, u)),
  criarCurso: acao((req, d, u) => estrutura.criarCurso(req.bd, u, d.body), 201),
  actualizarCurso: acao((req, d, u) => estrutura.actualizarCurso(req.bd, u, d.params.id, d.body)),
  listarDisciplinas: acao((req, d, u) => estrutura.listarDisciplinas(req.bd, u)),
  criarDisciplina: acao((req, d, u) => estrutura.criarDisciplina(req.bd, u, d.body), 201),
  actualizarDisciplina: acao((req, d, u) => estrutura.actualizarDisciplina(req.bd, u, d.params.id, d.body)),
  listarPlanos: acao((req, d, u) => estrutura.listarPlanos(req.bd, u, d.query)),
  criarPlano: acao((req, d, u) => estrutura.criarPlano(req.bd, u, d.body), 201),
  substituirPlano: acao((req, d, u) => estrutura.substituirPlano(req.bd, u, d.params.id, d.body)),
};

export const pessoasCtrl = {
  listarAlunos: acao((req, d, u) => pessoas.listarAlunos(req.bd, u, d.query)),
  obterAluno: acao((req, d, u) => pessoas.obterAluno(req.bd, u, d.params.id)),
  criarAluno: acao((req, d, u) => pessoas.criarAluno(req.bd, u, d.body), 201),
  actualizarAluno: acao((req, d, u) => pessoas.actualizarAluno(req.bd, u, d.params.id, d.body)),
  definirEncarregados: acao((req, d, u) => pessoas.definirEncarregados(req.bd, u, d.params.id, d.body)),
  listarEncarregados: acao((req, d, u) => pessoas.listarEncarregados(req.bd, u, d.query)),
  criarEncarregado: acao((req, d, u) => pessoas.criarEncarregado(req.bd, u, d.body), 201),
  listarProfessores: acao((req, d, u) => pessoas.listarProfessores(req.bd, u)),
  criarProfessor: acao((req, d, u) => pessoas.criarProfessor(req.bd, u, d.body), 201),
  actualizarProfessor: acao((req, d, u) => pessoas.actualizarProfessor(req.bd, u, d.params.id, d.body)),
};

export const turmasCtrl = {
  listar: acao((req, d, u) => turmas.listar(req.bd, u, d.query)),
  obter: acao((req, d, u) => turmas.obter(req.bd, u, d.params.id)),
  criar: acao((req, d, u) => turmas.criar(req.bd, u, d.body), 201),
  actualizar: acao((req, d, u) => turmas.actualizarTurma(req.bd, u, d.params.id, d.body)),
  listarAtribuicoes: acao((req, d, u) => turmas.listarAtribuicoes(req.bd, u, d.params.id)),
  definirAtribuicoes: acao((req, d, u) => turmas.definirAtribuicoes(req.bd, u, d.params.id, d.body)),
};

export const matriculasCtrl = {
  listar: acao((req, d, u) => matriculas.listar(req.bd, u, d.query)),
  matricular: acao((req, d, u) => matriculas.matricular(req.bd, u, d.body), 201),
  matricularNovo: acao((req, d, u) => matriculas.matricularNovo(req.bd, u, d.body), 201),
  importar: acao((req, d, u) => matriculas.importar(req.bd, u, d.body), 201),
  confirmar: acao((req, d, u) => matriculas.confirmar(req.bd, u, d.body), 201),
  mudarTurma: acao((req, d, u) => matriculas.mudarTurma(req.bd, u, d.params.id, d.body)),
  anular: acao((req, d, u) => matriculas.anular(req.bd, u, d.params.id, d.body)),
};

export const notasCtrl = {
  obter: acao((req, d, u) => notas.obterNotas(req.bd, u, d.params.id, d.params.disciplinaId, d.query.trimestre)),
  lancar: acao((req, d, u) => notas.lancarNotas(req.bd, u, d.params.id, d.params.disciplinaId, d.query.trimestre, d.body)),
  exames: acao((req, d, u) => notas.lancarExames(req.bd, u, d.params.id, d.params.disciplinaId, d.body)),
  descritivas: acao((req, d, u) => notas.lancarDescritivas(req.bd, u, d.params.id, d.query.trimestre, d.body)),
  publicar: acao((req, d, u) => notas.publicar(req.bd, u, d.params.id, d.params.n)),
  corrigir: acao((req, d, u) => notas.corrigir(req.bd, u, d.params.id, d.body)),
  async pautaTrimestral(req, res) {
    const { params, query } = req.dados;
    if (query.formato === 'pdf') {
      return enviarPdf(res, `pauta-${params.n}-trimestre.pdf`, await documentos.pautaPdf(req.bd, req.utilizador, params.id, params.n));
    }
    res.json(await notas.pautaTrimestral(req.bd, req.utilizador, params.id, params.n));
  },
  async pautaFinal(req, res) {
    const { params, query } = req.dados;
    if (query.formato === 'pdf') {
      return enviarPdf(res, 'pauta-final.pdf', await documentos.pautaPdf(req.bd, req.utilizador, params.id));
    }
    if (query.formato === 'csv') {
      const csv = await notas.pautaFinalCsv(req.bd, req.utilizador, params.id);
      res.type('text/csv; charset=utf-8').attachment(`pauta-final-${params.id}.csv`).send(csv);
      return;
    }
    res.json(await notas.pautaFinal(req.bd, req.utilizador, params.id));
  },
};

export const faltasCtrl = {
  marcar: acao((req, d, u) => faltas.marcar(req.bd, u, d.params.id, d.params.disciplinaId, d.query.data, d.body)),
  listar: acao((req, d, u) => faltas.listar(req.bd, u, d.params.id, d.query)),
  justificar: acao((req, d, u) => faltas.justificar(req.bd, u, d.params.id, d.body)),
  resumo: acao((req, d, u) => faltas.resumo(req.bd, u, d.params.id, d.query.trimestre)),
  disciplinar: acao((req, d, u) => faltas.marcarDisciplinar(req.bd, u, d.params.id, d.params.disciplinaId, d.body), 201),
  anularDisciplinar: acao((req, d, u) => faltas.anularDisciplinar(req.bd, u, d.params.id, d.body)),
};

export const estagiosCtrl = {
  listar: acao((req, d, u) => estagios.listar(req.bd, u, d.query)),
  criar: acao((req, d, u) => estagios.criar(req.bd, u, d.body), 201),
  actualizar: acao((req, d, u) => estagios.actualizar(req.bd, u, d.params.id, d.body)),
  tfc: acao((req, d, u) => estagios.definirTfc(req.bd, u, d.params.id, d.body)),
};

export const painelCtrl = {
  obter: acao((req, d, u) => painel.obter(req.bd, u, d.query)),
};

export const historicoCtrl = {
  listar: acao((req, d, u) => historico.listar(req.bd, u, d.params.id)),
  definir: acao((req, d, u) => historico.definirClasse(req.bd, u, d.params.id, d.params.classe, d.body)),
};

export const portalCtrl = {
  acessoAluno: acao((req, d, u) => portal.acessoAluno(req.bd, u, d.params.id, d.body), 201),
  acessoEncarregado: acao((req, d, u) => portal.acessoEncarregado(req.bd, u, d.params.id, d.body), 201),
  educandos: acao((req, d, u) => portal.educandos(req.bd, u)),
  resumo: acao((req, d, u) => portal.resumo(req.bd, u, d.params.id)),
  avisos: acao((req, d, u) => avisos.listar(req.bd, u)),
  lerAvisos: acao((req, d, u) => avisos.marcarLidos(req.bd, u, d.body)),
};

export const horariosCtrl = {
  tempos: acao((req, d, u) => horarios.obterTempos(req.bd, u.escolaId, d.query.turno)),
  definirTempos: acao((req, d, u) => horarios.definirTempos(req.bd, u, d.params.turno, d.body)),
  turma: acao((req, d, u) => horarios.horarioDaTurma(req.bd, u, d.params.id)),
  definirTurma: acao((req, d, u) => horarios.definirHorario(req.bd, u, d.params.id, d.body)),
  professor: acao((req, d, u) => horarios.horarioDoProfessor(req.bd, u)),
};

async function enviarRecibo(req, res, permitidos) {
  const d = await financas.dadosRecibo(req.bd, req.utilizador, req.dados.params.id, permitidos);
  const escola = await documentos.dadosEscola(req.bd, req.utilizador.escolaId);
  enviarPdf(res, `recibo-${d.numeroTexto.replace('/', '-')}.pdf`, await reciboPdf({ ...d, escola }));
}

export const financasCtrl = {
  rubricas: acao((req, d, u) => financas.listarRubricas(req.bd, u, d.query)),
  criarRubrica: acao((req, d, u) => financas.criarRubrica(req.bd, u, d.body), 201),
  actualizarRubrica: acao((req, d, u) => financas.actualizarRubrica(req.bd, u, d.params.id, d.body)),
  gerar: acao((req, d, u) => financas.gerarPropinas(req.bd, u, d.params.id)),
  dividas: acao((req, d, u) => financas.dividas(req.bd, u, d.query)),
  resumo: acao((req, d, u) => financas.resumo(req.bd, u, d.query)),
  ficha: acao((req, d, u) => financas.fichaFinanceira(req.bd, u, d.params.id)),
  cobrar: acao((req, d, u) => financas.criarCobranca(req.bd, u, d.params.id, d.body), 201),
  pagar: acao((req, d, u) => financas.registarPagamento(req.bd, u, d.params.id, d.body), 201),
  anularPagamento: acao((req, d, u) => financas.anularPagamento(req.bd, u, d.params.id, d.body)),
  anularCobranca: acao((req, d, u) => financas.anularCobranca(req.bd, u, d.params.id, d.body)),
  recibo: (req, res) => enviarRecibo(req, res),
  async reciboPortal(req, res) {
    const permitidos = (await portal.alunosPermitidos(req.bd, req.utilizador)).map((a) => a.id);
    return enviarRecibo(req, res, permitidos);
  },
};

export const auditoriaCtrl = {
  listar: acao((req, d, u) => auditoria.listar(req.bd, u, d.query)),
};
