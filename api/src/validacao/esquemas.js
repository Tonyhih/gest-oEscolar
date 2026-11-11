import { z } from 'zod';
import { data, email, estado, nota, notaOuNula, ramo, texto, trimestre, turno, uuid } from './comum.js';

// Os esquemas descartam campos desconhecidos (comportamento por omissão do Zod):
// por exemplo, "perfil" ou "escolaId" enviados pelo cliente nunca chegam aos serviços.

// ---------------------------------------------------------------- Autenticação
export const login = z.object({ email, palavraPasse: z.string().min(1).max(200) });
export const alterarPalavraPasse = z.object({ actual: z.string().min(1), nova: z.string().min(8, 'Mínimo de 8 caracteres.').max(200) });

// ---------------------------------------------------------------- Plataforma
export const escola = z.object({
  nome: texto(3), codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Código com letras, números e hífen.'),
  provincia: texto(2, 60), municipio: texto(2, 60), natureza: z.enum(['publica', 'privada', 'comparticipada']),
  ciclos: z.array(z.enum(['primario', 'i_ciclo', 'ii_ciclo_geral', 'ii_ciclo_tecnico'])).min(1),
});
export const estadoEscola = z.object({ estado });
export const pessoaConta = z.object({ nome: texto(3), email });

// ---------------------------------------------------------------- Utilizadores
export const novoUtilizador = z.object({ nome: texto(3), email, perfil: z.enum(['secretaria', 'coordenador', 'professor']) });
export const actualizarUtilizador = z.object({ nome: texto(3).optional(), estado: estado.optional() });
export const filtroUtilizadores = z.object({
  perfil: z.enum(['director', 'secretaria', 'coordenador', 'professor']).optional(),
});

// ---------------------------------------------------------------- Estrutura
const trimestreAno = z.object({ numero: z.number().int().min(1).max(3), inicio: data, fim: data, aberto: z.boolean().default(false) });
export const anoLectivo = z.object({
  designacao: z.string().regex(/^\d{4}\/\d{4}$/, 'Formato 2026/2027.'),
  trimestres: z.array(trimestreAno).length(3),
});
export const actualizarAno = anoLectivo.partial();

const configAvaliacao = {
  escalaMaxima: z.union([z.literal(10), z.literal(20)]).optional(),
  notaMinimaAprovacao: z.number().min(0).max(20).optional(),
  minimoNegativa: z.number().min(0).max(20).optional(),
  maxNegativas: z.number().int().min(0).max(10).optional(),
  classeDeExame: z.boolean().optional(),
  avaliacaoQualitativa: z.boolean().optional(),
  apenasEstagio: z.boolean().optional(),
};
export const classe = z.object({
  codigo: z.enum(['INI', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']), ramo: ramo.optional(), ...configAvaliacao,
});
export const configClasse = z.object({ ...configAvaliacao, estado: estado.optional() });

export const curso = z.object({ nome: texto(3), sigla: texto(1, 10), ramo, coordenador: uuid.optional() });
export const actualizarCurso = curso.partial().extend({ estado: estado.optional() });
export const disciplina = z.object({ nome: texto(2), sigla: texto(1, 10) });
export const actualizarDisciplina = disciplina.partial().extend({ estado: estado.optional() });

const disciplinasPlano = z.array(z.object({
  disciplina: uuid, cargaHorariaSemanal: z.number().int().min(1).max(20).optional(), chave: z.boolean().default(false),
})).min(1);
export const plano = z.object({ classe: uuid, curso: uuid.optional(), disciplinas: disciplinasPlano });
export const substituirPlano = z.object({ disciplinas: disciplinasPlano });
export const filtroPlanos = z.object({ classe: uuid, curso: uuid.optional() });

// ---------------------------------------------------------------- Pessoas
export const aluno = z.object({
  numeroProcesso: texto(1, 30).optional(),
  nome: texto(3),
  dataNascimento: data,
  sexo: z.enum(['M', 'F']),
  documento: z.object({ tipo: z.enum(['bi', 'cedula', 'passaporte']), numero: texto(3, 30) }).nullable().optional(),
  naturalidade: texto(2, 100).optional(),
  morada: texto(2, 300).optional(),
  telefone: texto(9, 20).optional(),
  // Pedidos pelo termo e pelos certificados do MED
  nomePai: texto(3).optional(),
  nomeMae: texto(3).optional(),
  municipioNaturalidade: texto(2, 100).optional(),
  provinciaNaturalidade: texto(2, 100).optional(),
  documentoEmissaoLocal: texto(2, 100).optional(),
  documentoEmissaoData: data.optional(),
});
export const actualizarAluno = aluno.partial().extend({ estado: estado.optional() });
export const filtroAlunos = z.object({
  pesquisa: z.string().trim().max(100).optional(), turma: uuid.optional(),
  pagina: z.coerce.number().int().min(1).default(1), limite: z.coerce.number().int().min(1).max(100).default(20),
});
export const encarregadosAluno = z.array(z.object({
  encarregado: uuid, parentesco: texto(2, 40), principal: z.boolean().default(false),
})).max(5);
export const encarregado = z.object({
  nome: texto(3), telefone: texto(9, 20), email: email.optional(), documento: texto(3, 30).optional(), profissao: texto(2, 100).optional(),
});
export const filtroPesquisa = z.object({ pesquisa: z.string().trim().max(100).optional() });
export const professor = z.object({
  utilizador: uuid, numeroAgente: texto(1, 30).optional(), habilitacoes: texto(2, 200).optional(), disciplinas: z.array(uuid).optional(),
});
export const actualizarProfessor = professor.omit({ utilizador: true }).partial();

// ---------------------------------------------------------------- Turmas e matrículas
export const turma = z.object({
  anoLectivo: uuid, classe: uuid, curso: uuid.optional(), nome: texto(1, 10), turno,
  sala: texto(1, 30).optional(), capacidade: z.number().int().min(1).max(80), directorTurma: uuid.optional(),
});
export const actualizarTurma = z.object({
  nome: texto(1, 10).optional(), turno: turno.optional(), sala: texto(1, 30).optional(),
  capacidade: z.number().int().min(1).max(80).optional(), directorTurma: uuid.optional(), estado: estado.optional(),
});
export const filtroTurmas = z.object({ anoLectivo: uuid.optional(), classe: uuid.optional(), turno: turno.optional() });
export const atribuicoes = z.array(z.object({ disciplina: uuid, professor: uuid }));

export const matricula = z.object({ aluno: uuid, turma: uuid });
const encarregadoFicha = z.object({ nome: texto(3), telefone: texto(9, 20), parentesco: texto(2, 40).default('Encarregado(a)') });
export const novaMatricula = z.object({ aluno, encarregado: encarregadoFicha.optional(), turma: uuid });
export const importacao = z.object({
  turma: uuid,
  alunos: z.array(z.object({
    nome: texto(3), dataNascimento: data, sexo: z.enum(['M', 'F']),
    encarregadoNome: texto(3).optional(), encarregadoTelefone: texto(9, 20).optional(), parentesco: texto(2, 40).optional(),
  })).min(1, 'A lista está vazia.').max(100, 'No máximo 100 alunos de cada vez.'),
});
export const confirmacao = z.object({ matriculaAnterior: uuid, turma: uuid });
export const mudarTurma = z.object({ turma: uuid, motivo: texto(3, 500) });
export const motivo = z.object({ motivo: texto(3, 500) });
export const filtroMatriculas = z.object({ anoLectivo: uuid.optional(), turma: uuid.optional() });

// ---------------------------------------------------------------- Avaliação
export const paramsTurmaDisciplina = z.object({ id: uuid, disciplinaId: uuid });
export const paramsTurmaTrimestre = z.object({ id: uuid, n: trimestre });
export const queryTrimestre = z.object({ trimestre });
export const notasLote = z.array(z.object({ matricula: uuid, mac: notaOuNula.optional(), npp: notaOuNula.optional(), npt: notaOuNula.optional() }))
  .min(1).max(100);
export const examesLote = z.array(z.object({ matricula: uuid, exame: nota })).min(1).max(100);
export const descritivasLote = z.array(z.object({ matricula: uuid, texto: texto(1, 2000) })).min(1).max(100);
export const correccao = z.object({
  campo: z.enum(['mac', 'npp', 'npt', 'exame']), valor: nota,
  justificacao: texto(10, 500).describe('Mínimo de 10 caracteres.'),
});
export const formatoPauta = z.object({ formato: z.enum(['json', 'csv', 'pdf']).default('json') });
export const formatoPautaTrimestral = z.object({ formato: z.enum(['json', 'pdf']).default('json') });
export const dadosEscola = z.object({ decretoCriacao: texto(3, 120) });
export const queryAnoLectivo = z.object({ anoLectivo: uuid.optional() });
export const queryCiclo = z.object({ ciclo: z.enum(['primario', 'i_ciclo']) });
export const certificado = z.object({
  ciclo: z.enum(['primario', 'i_ciclo']), livroRegisto: texto(1, 30).optional(), conferidoPor: texto(3).optional(),
  rascunho: z.boolean().default(false),
});

// ---------------------------------------------------------------- Faltas
export const queryData = z.object({ data });
export const faltasLote = z.array(uuid).max(100);
export const filtroFaltas = z.object({ aluno: uuid.optional(), trimestre: trimestre.optional() });

// ---------------------------------------------------------------- Estágio e TFC (RF40–RF43) e painel (RF38)
export const estagio = z.object({
  matricula: uuid, entidade: texto(2, 200), orientadorEntidade: texto(2, 120).optional(),
  orientadorEscola: uuid.optional(), inicio: data, fim: data.optional(),
});
export const actualizarEstagio = z.object({
  entidade: texto(2, 200).optional(), orientadorEntidade: texto(2, 120).optional(), orientadorEscola: uuid.optional(),
  inicio: data.optional(), fim: data.nullable().optional(), estado: z.enum(['a_decorrer', 'concluido']).optional(),
  nota: nota.nullable().optional(),
});
export const tfc = z.object({
  tema: texto(3, 300).optional(), orientador: uuid.optional(), dataDefesa: data.optional(),
  juri: z.array(texto(2, 120)).max(5).optional(), nota: nota.nullable().optional(),
});
export const filtroAno = z.object({ anoLectivo: uuid.optional() });
export const acessoPortal = z.object({ email });
export const paramsHistorico = z.object({ id: uuid, classe: z.enum(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']) });
export const historicoClasse = z.object({
  anoLectivo: z.string().regex(/^\d{4}\/\d{4}$/, 'Formato 2024/2025.'),
  escolaOrigem: texto(3, 200).optional(),
  notas: z.array(z.object({ disciplina: uuid, notaFinal: z.number().int('Nota final inteira.').min(0).max(20) })).min(1).max(30),
});

// ---------------------------------------------------------------- Auditoria
export const filtroAuditoria = z.object({
  utilizador: uuid.optional(),
  entidade: z.enum(['nota', 'matricula', 'falta', 'aluno', 'utilizador', 'classe', 'turma', 'escola', 'ano_lectivo', 'plano_curricular', 'estagio']).optional(),
  de: data.optional(), ate: data.optional(),
  pagina: z.coerce.number().int().min(1).default(1), limite: z.coerce.number().int().min(1).max(100).default(20),
});
