import { Router } from 'express';
import { validar } from '../middleware/validar.js';
import { exigirAutenticacao } from '../middleware/autenticacao.js';
import { exigirPerfil, GESTAO, PERFIS_ESCOLA } from '../middleware/autorizacao.js';
import { limitarLogin } from '../middleware/limites.js';
import { paginacao, paramsId } from '../validacao/comum.js';
import * as E from '../validacao/esquemas.js';
import * as C from '../controllers/index.js';

/**
 * Todas as rotas da API (montadas em /api/v1). A ordem dos middlewares é sempre:
 * autenticação → perfil → validação → controlador. As verificações por recurso
 * (professor da turma, director de turma, mesma escola) estão nos serviços.
 */
export function criarRotas(config) {
  const r = Router();
  const auth = exigirAutenticacao(config);
  const auth2 = exigirAutenticacao(config, { permitirTrocaPendente: true });
  const perfil = exigirPerfil;
  const v = validar;
  const A = C.auth(config);

  const DIR = ['director'];
  const EST = ['director', 'coordenador'];       // estrutura: director e coordenador
  const SEC = ['secretaria'];
  const LEITURA_ALUNOS = ['director', 'secretaria', 'coordenador', 'professor'];

  // ---------------------------------------------------------- Sistema e autenticação
  r.get('/saude', C.sistema.saude);
  r.post('/auth/login', limitarLogin(config.limiteLogin), v({ body: E.login }), A.entrar);
  r.get('/auth/eu', auth2, A.eu);
  r.post('/auth/palavra-passe', auth2, v({ body: E.alterarPalavraPasse }), A.alterarPalavraPasse);

  // ---------------------------------------------------------- Plataforma (só o administrador)
  const AP = [auth, perfil('admin_plataforma')];
  r.get('/plataforma/escolas', ...AP, v({ query: paginacao }), C.escolas.listar);
  r.post('/plataforma/escolas', ...AP, v({ body: E.escola }), C.escolas.criar);
  r.patch('/plataforma/escolas/:id', ...AP, v({ params: paramsId, body: E.estadoEscola }), C.escolas.actualizar);
  r.post('/plataforma/escolas/:id/director', ...AP, v({ params: paramsId, body: E.pessoaConta }), C.escolas.criarDirector);

  // ---------------------------------------------------------- Utilizadores da escola
  r.get('/utilizadores', auth, perfil(...DIR), v({ query: E.filtroUtilizadores.merge(paginacao) }), C.utilizadoresCtrl.listar);
  r.post('/utilizadores', auth, perfil(...DIR), v({ body: E.novoUtilizador }), C.utilizadoresCtrl.criar);
  r.patch('/utilizadores/:id', auth, perfil(...DIR), v({ params: paramsId, body: E.actualizarUtilizador }), C.utilizadoresCtrl.actualizar);
  r.post('/utilizadores/:id/repor-palavra-passe', auth, perfil(...DIR), v({ params: paramsId }), C.utilizadoresCtrl.reporPalavraPasse);

  // ---------------------------------------------------------- Estrutura de ensino
  const S = C.estruturaCtrl;
  const escola = [auth, perfil(...PERFIS_ESCOLA)];
  r.get('/anos-lectivos', ...escola, S.listarAnos);
  r.post('/anos-lectivos', auth, perfil(...DIR), v({ body: E.anoLectivo }), S.criarAno);
  r.patch('/anos-lectivos/:id', auth, perfil(...DIR), v({ params: paramsId, body: E.actualizarAno }), S.actualizarAno);
  r.post('/anos-lectivos/:id/activar', auth, perfil(...DIR), v({ params: paramsId }), S.activarAno);
  r.get('/catalogo/classes', ...escola, S.catalogo);
  r.get('/classes', ...escola, S.listarClasses);
  r.post('/classes', auth, perfil(...DIR), v({ body: E.classe }), S.criarClasse);
  r.patch('/classes/:id', auth, perfil(...DIR), v({ params: paramsId, body: E.configClasse }), S.actualizarClasse);
  r.get('/cursos', ...escola, S.listarCursos);
  r.post('/cursos', auth, perfil(...EST), v({ body: E.curso }), S.criarCurso);
  r.patch('/cursos/:id', auth, perfil(...EST), v({ params: paramsId, body: E.actualizarCurso }), S.actualizarCurso);
  r.get('/disciplinas', ...escola, S.listarDisciplinas);
  r.post('/disciplinas', auth, perfil(...EST), v({ body: E.disciplina }), S.criarDisciplina);
  r.patch('/disciplinas/:id', auth, perfil(...EST), v({ params: paramsId, body: E.actualizarDisciplina }), S.actualizarDisciplina);
  r.get('/planos-curriculares', ...escola, v({ query: E.filtroPlanos }), S.listarPlanos);
  r.post('/planos-curriculares', auth, perfil(...EST), v({ body: E.plano }), S.criarPlano);
  r.put('/planos-curriculares/:id', auth, perfil(...EST), v({ params: paramsId, body: E.substituirPlano }), S.substituirPlano);

  // ---------------------------------------------------------- Pessoas
  const P = C.pessoasCtrl;
  r.get('/alunos', auth, perfil(...LEITURA_ALUNOS), v({ query: E.filtroAlunos }), P.listarAlunos);
  r.post('/alunos', auth, perfil(...SEC), v({ body: E.aluno }), P.criarAluno);
  r.get('/alunos/:id', auth, perfil(...LEITURA_ALUNOS), v({ params: paramsId }), P.obterAluno);
  r.patch('/alunos/:id', auth, perfil(...SEC), v({ params: paramsId, body: E.actualizarAluno }), P.actualizarAluno);
  r.put('/alunos/:id/encarregados', auth, perfil(...SEC), v({ params: paramsId, body: E.encarregadosAluno }), P.definirEncarregados);
  r.get('/encarregados', auth, perfil(...SEC), v({ query: E.filtroPesquisa }), P.listarEncarregados);
  r.post('/encarregados', auth, perfil(...SEC), v({ body: E.encarregado }), P.criarEncarregado);
  r.get('/professores', auth, perfil(...GESTAO, 'coordenador'), P.listarProfessores);
  r.post('/professores', auth, perfil(...GESTAO), v({ body: E.professor }), P.criarProfessor);
  r.patch('/professores/:id', auth, perfil(...GESTAO), v({ params: paramsId, body: E.actualizarProfessor }), P.actualizarProfessor);

  // ---------------------------------------------------------- Turmas e matrículas
  const T = C.turmasCtrl;
  r.get('/turmas', ...escola, v({ query: E.filtroTurmas }), T.listar);
  r.post('/turmas', auth, perfil(...GESTAO), v({ body: E.turma }), T.criar);
  r.get('/turmas/:id', ...escola, v({ params: paramsId }), T.obter);
  r.patch('/turmas/:id', auth, perfil(...GESTAO), v({ params: paramsId, body: E.actualizarTurma }), T.actualizar);
  r.get('/turmas/:id/atribuicoes', ...escola, v({ params: paramsId }), T.listarAtribuicoes);
  r.put('/turmas/:id/atribuicoes', auth, perfil(...EST), v({ params: paramsId, body: E.atribuicoes }), T.definirAtribuicoes);

  const M = C.matriculasCtrl;
  // As rotas fixas vêm antes das que têm parâmetros
  r.post('/matriculas/confirmacoes', auth, perfil(...SEC), v({ body: E.confirmacao }), M.confirmar);
  r.get('/matriculas', auth, perfil('director', 'secretaria', 'professor'), v({ query: E.filtroMatriculas }), M.listar);
  r.post('/matriculas', auth, perfil(...SEC), v({ body: E.matricula }), M.matricular);
  r.post('/matriculas/:id/mudar-turma', auth, perfil(...SEC), v({ params: paramsId, body: E.mudarTurma }), M.mudarTurma);
  r.post('/matriculas/:id/anular', auth, perfil(...SEC), v({ params: paramsId, body: E.motivo }), M.anular);

  // ---------------------------------------------------------- Avaliação
  const N = C.notasCtrl;
  const td = E.paramsTurmaDisciplina;
  r.get('/turmas/:id/disciplinas/:disciplinaId/notas', ...escola, v({ params: td, query: E.queryTrimestre }), N.obter);
  r.put('/turmas/:id/disciplinas/:disciplinaId/notas', auth, perfil('professor'),
    v({ params: td, query: E.queryTrimestre, body: E.notasLote }), N.lancar);
  r.put('/turmas/:id/disciplinas/:disciplinaId/exame', auth, perfil('professor', 'secretaria'),
    v({ params: td, body: E.examesLote }), N.exames);
  r.put('/turmas/:id/avaliacoes-descritivas', auth, perfil('professor'),
    v({ params: paramsId, query: E.queryTrimestre, body: E.descritivasLote }), N.descritivas);
  r.post('/turmas/:id/trimestres/:n/publicar', auth, perfil('director', 'professor'), v({ params: E.paramsTurmaTrimestre }), N.publicar);
  r.post('/notas/:id/correccoes', auth, perfil(...DIR), v({ params: paramsId, body: E.correccao }), N.corrigir);
  r.get('/turmas/:id/pautas/trimestres/:n', ...escola, v({ params: E.paramsTurmaTrimestre }), N.pautaTrimestral);
  r.get('/turmas/:id/pautas/final', ...escola, v({ params: paramsId, query: E.formatoPauta }), N.pautaFinal);

  // ---------------------------------------------------------- Assiduidade
  const F = C.faltasCtrl;
  r.put('/turmas/:id/disciplinas/:disciplinaId/faltas', auth, perfil('professor'),
    v({ params: td, query: E.queryData, body: E.faltasLote }), F.marcar);
  r.get('/turmas/:id/faltas/resumo', auth, perfil('director', 'professor'), v({ params: paramsId, query: E.queryTrimestre }), F.resumo);
  r.get('/turmas/:id/faltas', auth, perfil('director', 'professor'), v({ params: paramsId, query: E.filtroFaltas }), F.listar);
  r.post('/faltas/:id/justificar', auth, perfil('professor'), v({ params: paramsId, body: E.motivo }), F.justificar);

  // ---------------------------------------------------------- Estágio e TFC (13.ª classe) e painel
  const G = C.estagiosCtrl;
  const ESTAGIO = ['director', 'secretaria', 'coordenador'];
  r.get('/estagios', auth, perfil(...ESTAGIO), v({ query: E.filtroAno }), G.listar);
  r.post('/estagios', auth, perfil(...ESTAGIO), v({ body: E.estagio }), G.criar);
  r.patch('/estagios/:id', auth, perfil(...ESTAGIO), v({ params: paramsId, body: E.actualizarEstagio }), G.actualizar);
  r.patch('/estagios/:id/tfc', auth, perfil('director', 'coordenador'), v({ params: paramsId, body: E.tfc }), G.tfc);
  r.get('/painel', auth, perfil(...DIR), v({ query: E.filtroAno }), C.painelCtrl.obter);

  // ---------------------------------------------------------- Auditoria
  r.get('/auditoria', auth, perfil(...DIR), v({ query: E.filtroAuditoria }), C.auditoriaCtrl.listar);

  return r;
}
