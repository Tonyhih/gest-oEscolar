import { camel } from '../util/sql.js';
import { ErroAplicacao, naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { decidirTransicao } from './avaliacao.js';
import { obterNotas, pautaFinal, pautaTrimestral } from './notas.js';
import { disciplinasDaTurma, obterTurmaAcessivel } from './turmas.js';
import { obterAluno, SQL_DESIGNACAO_TURMA } from './pessoas.js';
import * as pdf from '../pdf/documentos.js';
import { notasDaClasse } from './historico.js';

const TURNOS = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const hoje = () => new Date().toISOString().slice(0, 10);
const arredondar = (x) => Math.round(Math.round(x * 100) / 100);

/** Dados da escola para os cabeçalhos, com o nome do director activo. */
async function dadosEscola(bd, escolaId) {
  const { rows } = await bd.query(`
    SELECT e.nome, e.codigo, e.provincia, e.municipio, e.natureza, e.decreto_criacao,
           (SELECT nome FROM utilizadores WHERE escola_id = e.id AND perfil = 'director' AND estado = 'activo'
             ORDER BY criado_em LIMIT 1) AS director
    FROM escolas e WHERE e.id = $1`, [escolaId]);
  const e = camel(rows[0]);
  return { ...e, privada: e.natureza !== 'publica' };
}

async function contexto(bd, u, turma) {
  const [escola, ano, dt] = await Promise.all([
    dadosEscola(bd, u.escolaId),
    bd.query('SELECT designacao FROM anos_lectivos WHERE id = $1', [turma.ano_lectivo_id]),
    bd.query('SELECT us.nome FROM professores p JOIN utilizadores us ON us.id = p.utilizador_id WHERE p.id = $1', [turma.director_turma_id]),
  ]);
  return {
    escola, anoLectivo: ano.rows[0]?.designacao, directorTurma: dt.rows[0]?.nome ?? null, hoje: hoje(),
    turma: turma.designacao_curta + (turma.curso_sigla ? ` – ${turma.curso_sigla}` : ''), turno: TURNOS[turma.turno],
  };
}

// ======================================================================
// Mini-pauta e pautas
// ======================================================================

export async function miniPauta(bd, u, turmaId, disciplinaId, trimestre) {
  const linhas = await obterNotas(bd, u, turmaId, disciplinaId, trimestre); // verifica o acesso
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  const disciplina = (await disciplinasDaTurma(bd, turma)).find((x) => x.id === disciplinaId);
  const [ctx, prof, faltas] = await Promise.all([
    contexto(bd, u, turma),
    bd.query(`SELECT us.nome FROM atribuicoes a JOIN professores p ON p.id = a.professor_id
              JOIN utilizadores us ON us.id = p.utilizador_id WHERE a.turma_id = $1 AND a.disciplina_id = $2`, [turmaId, disciplinaId]),
    bd.query(`SELECT matricula_id, count(*)::int AS n FROM faltas
              WHERE disciplina_id = $1 AND trimestre = $2 AND estado <> 'anulada'
                AND matricula_id IN (SELECT id FROM matriculas WHERE turma_id = $3) GROUP BY matricula_id`, [disciplinaId, trimestre, turmaId]),
  ]);
  const nFaltas = new Map(faltas.rows.map((f) => [f.matricula_id, f.n]));
  return pdf.miniPauta({
    ...ctx, trimestre, disciplina, professor: prof.rows[0]?.nome ?? '', escala: turma.escala_maxima,
    notaMinima: turma.nota_minima_aprovacao,
    linhas: linhas.map((l) => ({ nome: l.aluno.nome, mac: l.mac, npp: l.npp, npt: l.npt, mt: l.mt, faltas: nFaltas.get(l.matricula) ?? 0 })),
  });
}

export async function pautaPdf(bd, u, turmaId, trimestre) {
  const p = trimestre ? await pautaTrimestral(bd, u, turmaId, trimestre) : await pautaFinal(bd, u, turmaId);
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  if (turma.avaliacao_qualitativa) throw regra('A Iniciação não tem pauta com notas; use a avaliação descritiva.');
  return pdf.pauta({
    ...(await contexto(bd, u, turma)), final: !trimestre, trimestre,
    disciplinas: p.disciplinas.length ? p.disciplinas : Object.keys(p.linhas[0]?.notas ?? {}).map((s) => ({ sigla: s, chave: false })),
    notaMinima: p.turma.notaMinimaAprovacao, classeDeExame: p.turma.classeDeExame,
    linhas: p.linhas.map((l) => ({ nome: l.aluno.nome, notas: l.notas, negativas: l.negativas, situacao: l.situacao })),
  });
}

// ======================================================================
// Termo de frequência e aproveitamento
// ======================================================================

/** Uma metade do termo: um ano lectivo do aluno. */
async function blocoTermo(bd, m) {
  const turma = (await bd.query(`
    SELECT t.*, c.codigo AS classe_codigo, c.nota_minima_aprovacao, c.minimo_negativa, c.max_negativas, c.classe_de_exame,
           ${SQL_DESIGNACAO_TURMA} AS designacao_curta, al.designacao AS ano, us.nome AS dt
    FROM turmas t JOIN classes c ON c.id = t.classe_id JOIN classes_catalogo cc ON cc.codigo = c.codigo
    JOIN anos_lectivos al ON al.id = t.ano_lectivo_id
    LEFT JOIN professores p ON p.id = t.director_turma_id LEFT JOIN utilizadores us ON us.id = p.utilizador_id
    WHERE t.id = $1`, [m.turma_id])).rows[0];
  const numero = (await bd.query(`
    SELECT n FROM (SELECT m.id, row_number() OVER (ORDER BY a.nome) AS n FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
                   WHERE m.turma_id = $1 AND m.estado <> 'anulada') x WHERE id = $2`, [m.turma_id, m.id])).rows[0]?.n;
  const disciplinas = await disciplinasDaTurma(bd, turma);
  const [notas, faltas, finais] = await Promise.all([
    bd.query('SELECT disciplina_id, trimestre, mt FROM notas WHERE matricula_id = $1', [m.id]),
    bd.query(`SELECT disciplina_id, trimestre, count(*)::int AS n FROM faltas WHERE matricula_id = $1 AND estado <> 'anulada'
              GROUP BY disciplina_id, trimestre`, [m.id]),
    bd.query('SELECT disciplina_id, mfd, exame, nota_final, nota_minima_aprovacao FROM v_resultados_disciplina WHERE matricula_id = $1', [m.id]),
  ]);
  const mt = new Map(notas.rows.map((n) => [`${n.disciplina_id}|${n.trimestre}`, n.mt]));
  const f = new Map(faltas.rows.map((n) => [`${n.disciplina_id}|${n.trimestre}`, n.n]));
  const fin = new Map(finais.rows.map((n) => [n.disciplina_id, n]));
  const linhas = disciplinas.map((d) => {
    const r = fin.get(d.id);
    return {
      nome: d.nome, chave: d.chave,
      ct: [1, 2, 3].map((t) => mt.get(`${d.id}|${t}`) ?? null), f: [1, 2, 3].map((t) => f.get(`${d.id}|${t}`) ?? 0),
      cap: r?.mfd ?? null, cpe: r?.exame ?? null, cf: r?.nota_final ?? null,
      obs: r?.nota_final == null ? '' : r.nota_final >= turma.nota_minima_aprovacao ? 'Aprovado' : 'Reprovado',
    };
  });
  const situacao = disciplinas.length ? decidirTransicao({
    notaMinimaAprovacao: turma.nota_minima_aprovacao, minimoNegativa: turma.minimo_negativa,
    maxNegativas: turma.max_negativas, classeDeExame: turma.classe_de_exame,
  }, linhas.map((l) => ({ notaFinal: l.cf, chave: l.chave }))).situacao : null;
  return {
    anoLectivo: turma.ano, classe: turma.classe_codigo === 'INI' ? 'Iniciação' : `${turma.classe_codigo}.ª`, turma: turma.nome,
    numero, directorTurma: turma.dt, disciplinas: linhas, situacao,
  };
}

export async function termo(bd, u, alunoId, { anoLectivo }) {
  const aluno = await obterAluno(bd, u, alunoId);
  const matriculas = (await bd.query(`
    SELECT m.* FROM matriculas m JOIN anos_lectivos al ON al.id = m.ano_lectivo_id
    WHERE m.aluno_id = $1 AND m.estado <> 'anulada' ORDER BY al.designacao DESC`, [alunoId])).rows;
  if (!matriculas.length) throw regra('O aluno ainda não tem matrículas.');
  const i = anoLectivo ? matriculas.findIndex((m) => m.ano_lectivo_id === anoLectivo) : 0;
  if (i < 0) throw naoEncontrado('Matrícula nesse ano lectivo');
  // O ano escolhido à esquerda e o anterior à direita (como no livro de termos)
  const anos = [await blocoTermo(bd, matriculas[i]), matriculas[i + 1] ? await blocoTermo(bd, matriculas[i + 1]) : null];
  const encarregado = aluno.encarregados.find((e) => e.principal)?.encarregado ?? aluno.encarregados[0]?.encarregado;
  await registar(bd, u, { entidade: 'aluno', entidadeId: alunoId, accao: 'emitir_termo' });
  return pdf.termo({
    escola: await dadosEscola(bd, u.escolaId), aluno, encarregado, anos, hoje: hoje(),
    disciplinasVazias: anos[0].disciplinas.map((d) => ({ ...d, ct: [null, null, null], f: [0, 0, 0], cap: null, cpe: null, cf: null, obs: '' })),
  });
}

// ======================================================================
// Certificados (Ensino Primário: 2.ª, 4.ª e 6.ª; I Ciclo: 7.ª, 8.ª e 9.ª)
// ======================================================================

const CLASSES_CICLO = { primario: ['2', '4', '6'], i_ciclo: ['7', '8', '9'] };
const CAMPOS_ALUNO = {
  nomePai: 'nome do pai', nomeMae: 'nome da mãe', naturalidade: 'naturalidade',
  municipioNaturalidade: 'município de naturalidade', provinciaNaturalidade: 'província de naturalidade',
  documentoNumero: 'número do B.I./passaporte', documentoEmissaoLocal: 'local de emissão do B.I.', documentoEmissaoData: 'data de emissão do B.I.',
};

/**
 * Prepara o certificado e diz o que falta: as notas finais de cada classe do ciclo e os dados pessoais.
 * A média de cada disciplina é a média das notas finais das três classes, arredondada à unidade;
 * a média geral é a média das médias das disciplinas, também arredondada à unidade.
 */
export async function previaCertificado(bd, u, alunoId, ciclo) {
  const aluno = await obterAluno(bd, u, alunoId);
  const codigos = CLASSES_CICLO[ciclo];
  const { rows } = await bd.query(`
    SELECT DISTINCT ON (c.codigo) c.codigo, m.id AS matricula, al.designacao AS ano, t.id AS turma_id
    FROM matriculas m
    JOIN turmas t ON t.id = m.turma_id JOIN classes c ON c.id = t.classe_id
    JOIN anos_lectivos al ON al.id = m.ano_lectivo_id
    WHERE m.aluno_id = $1 AND m.estado <> 'anulada' AND c.codigo = ANY($2::text[])
    ORDER BY c.codigo, al.designacao DESC`, [alunoId, codigos]);
  const porClasse = new Map(rows.map((r) => [r.codigo, r]));

  // Disciplinas: as dos planos das classes do ciclo, pela ordem da última classe
  const ordem = new Map();
  const notas = new Map();
  for (const codigo of [...codigos].reverse()) {
    const r = porClasse.get(codigo);
    if (!r) continue;
    const res = await bd.query(`
      SELECT d.id, d.nome, v.nota_final FROM v_resultados_disciplina v JOIN disciplinas d ON d.id = v.disciplina_id
      WHERE v.matricula_id = $1`, [r.matricula]);
    const turma = (await bd.query('SELECT classe_id, curso_id FROM turmas WHERE id = $1', [r.turma_id])).rows[0];
    for (const d of await disciplinasDaTurma(bd, turma)) if (!ordem.has(d.id)) ordem.set(d.id, d.nome);
    for (const n of res.rows) notas.set(`${n.id}|${codigo}`, n.nota_final);
  }
  // Classes que não estão no sistema: notas do histórico escolar (anos anteriores ou outra escola)
  const doHistorico = new Map();
  for (const codigo of [...codigos].reverse()) {
    if (porClasse.has(codigo)) continue;
    const h = await notasDaClasse(bd, alunoId, codigo);
    if (!h.notas.length) continue;
    doHistorico.set(codigo, h.ano);
    for (const n of h.notas) {
      if (!ordem.has(n.disciplina_id)) ordem.set(n.disciplina_id, n.nome);
      notas.set(`${n.disciplina_id}|${codigo}`, n.nota_final);
    }
  }
  const disciplinas = [...ordem].map(([id, nome]) => {
    const valores = codigos.map((c) => notas.get(`${id}|${c}`) ?? null);
    const presentes = valores.filter((v) => v !== null);
    return { id, nome, notas: valores, media: presentes.length === codigos.length ? arredondar(presentes.reduce((s, v) => s + v, 0) / presentes.length) : null };
  });
  const completas = disciplinas.length > 0 && disciplinas.every((d) => d.media !== null);
  const mediaGeral = completas ? arredondar(disciplinas.reduce((s, d) => s + d.media, 0) / disciplinas.length) : null;

  const emFalta = [];
  for (const c of codigos) {
    if (!porClasse.has(c) && !doHistorico.has(c)) emFalta.push(`notas da ${c}.ª classe (matrícula no sistema ou histórico escolar)`);
  }
  if (!completas && emFalta.length === 0) emFalta.push('notas finais de todas as disciplinas, em todas as classes do ciclo');
  const dadosEmFalta = Object.entries(CAMPOS_ALUNO).filter(([k]) => !aluno[k]).map(([, v]) => v);
  const ultima = porClasse.get(codigos.at(-1));

  return {
    ciclo, aluno,
    classes: codigos.map((codigo) => ({
      codigo, ano: porClasse.get(codigo)?.ano ?? doHistorico.get(codigo) ?? null,
      origem: porClasse.has(codigo) ? 'sistema' : doHistorico.has(codigo) ? 'historico' : null,
    })),
    disciplinas, mediaGeral, anoConclusao: ultima?.ano ?? null,
    emFalta, dadosEmFalta, completo: emFalta.length === 0 && dadosEmFalta.length === 0,
  };
}

/** Emite o certificado. Sem rascunho, exige tudo completo e atribui o número seguinte (N.º x/ano). */
export async function emitirCertificado(bd, u, alunoId, { ciclo, livroRegisto, conferidoPor, rascunho }) {
  const p = await previaCertificado(bd, u, alunoId, ciclo);
  if (!rascunho && !p.completo) {
    throw new ErroAplicacao('O certificado não pode ser emitido: faltam dados.', 422, 'CERTIFICADO_INCOMPLETO',
      [...p.emFalta, ...p.dadosEmFalta].map((m) => ({ campo: 'certificado', mensagem: m })));
  }
  const escola = await dadosEscola(bd, u.escolaId);
  const dataEmissao = hoje();
  const ano = Number(dataEmissao.slice(0, 4));
  const id = await bd.transaccao(async (c) => {
    let numero = null;
    if (!rascunho) {
      // Bloqueia a escola para que dois pedidos em simultâneo não recebam o mesmo número
      await c.query('SELECT id FROM escolas WHERE id = $1 FOR UPDATE', [u.escolaId]);
      numero = (await c.query(`SELECT coalesce(max(numero), 0) + 1 AS n FROM documentos
                               WHERE escola_id = $1 AND tipo = 'certificado' AND ano = $2`, [u.escolaId, ano])).rows[0].n;
    }
    const dados = {
      ciclo, escola, aluno: p.aluno, classes: p.classes, disciplinas: p.disciplinas, mediaGeral: p.mediaGeral,
      anoConclusao: p.anoConclusao, livroRegisto: livroRegisto ?? null, conferidoPor: conferidoPor ?? null,
      dataEmissao, rascunho: Boolean(rascunho), numeroTexto: numero ? `${numero}/${ano}` : 'RASCUNHO',
    };
    const { rows } = await c.query(`
      INSERT INTO documentos (escola_id, tipo, ciclo, numero, ano, aluno_id, rascunho, dados, emitido_por)
      VALUES ($1, 'certificado', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [u.escolaId, ciclo, numero, ano, alunoId, Boolean(rascunho), JSON.stringify(dados), u.id]);
    await registar(c, u, { entidade: 'aluno', entidadeId: alunoId, accao: rascunho ? 'rascunho_certificado' : 'emitir_certificado',
                           depois: { documento: rows[0].id, numero: dados.numeroTexto, ciclo } });
    return rows[0].id;
  });
  return obterDocumento(bd, u, id);
}

export async function obterDocumento(bd, u, id) {
  const { rows } = await bd.query(`
    SELECT d.id, d.tipo, d.ciclo, d.numero, d.ano, d.rascunho, d.emitido_em, d.aluno_id AS aluno, us.nome AS emitido_por,
           d.dados->>'numeroTexto' AS numero_texto
    FROM documentos d JOIN utilizadores us ON us.id = d.emitido_por WHERE d.id = $1 AND d.escola_id = $2`, [id, u.escolaId]);
  if (!rows[0]) throw naoEncontrado('Documento');
  return camel(rows[0]);
}

export async function listarDocumentos(bd, u, alunoId) {
  await obterAluno(bd, u, alunoId);
  const { rows } = await bd.query(`
    SELECT d.id, d.tipo, d.ciclo, d.numero, d.ano, d.rascunho, d.emitido_em, us.nome AS emitido_por, d.dados->>'numeroTexto' AS numero_texto
    FROM documentos d JOIN utilizadores us ON us.id = d.emitido_por
    WHERE d.aluno_id = $1 AND d.escola_id = $2 ORDER BY d.emitido_em DESC`, [alunoId, u.escolaId]);
  return camel(rows);
}

/** Reimprime o documento exactamente como foi emitido (a partir dos dados guardados). */
export async function documentoPdf(bd, u, id) {
  const { rows } = await bd.query('SELECT tipo, dados FROM documentos WHERE id = $1 AND escola_id = $2', [id, u.escolaId]);
  if (!rows[0]) throw naoEncontrado('Documento');
  if (u.perfil === 'professor') throw proibido();
  return { nome: `certificado-${rows[0].dados.numeroTexto.replace('/', '-')}.pdf`, pdf: await pdf.certificado(rows[0].dados) };
}

// ======================================================================
// Dados da escola (decreto de criação)
// ======================================================================

export async function obterEscola(bd, u) {
  return camel((await bd.query(`SELECT id, nome, codigo, provincia, municipio, natureza, ciclos, decreto_criacao
                                FROM escolas WHERE id = $1`, [u.escolaId])).rows[0]);
}

export async function actualizarEscola(bd, u, { decretoCriacao }) {
  await bd.transaccao(async (c) => {
    await c.query('UPDATE escolas SET decreto_criacao = $2 WHERE id = $1', [u.escolaId, decretoCriacao]);
    await registar(c, u, { entidade: 'escola', entidadeId: u.escolaId, accao: 'actualizar_dados', depois: { decretoCriacao } });
  });
  return obterEscola(bd, u);
}
