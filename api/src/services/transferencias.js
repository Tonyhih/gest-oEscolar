// Transferência de alunos entre escolas da plataforma (guia de transferência).
import { randomInt } from 'node:crypto';
import { camel, inserir } from '../util/sql.js';
import { conflito, naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { inserirAluno, SQL_DESIGNACAO_TURMA } from './pessoas.js';
import { reservarLugar } from './matriculas.js';

const hoje = () => new Date().toISOString().slice(0, 10);
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, que se confundem ao escrever
const novoCodigo = () => Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const CAMPOS_ALUNO = ['nome', 'data_nascimento', 'sexo', 'documento_tipo', 'documento_numero', 'naturalidade', 'morada', 'telefone',
  'nome_pai', 'nome_mae', 'municipio_naturalidade', 'provincia_naturalidade', 'documento_emissao_local', 'documento_emissao_data'];

/** Escolas activas da plataforma para onde se pode transferir (todas menos a própria). */
export async function escolasDestino(bd, u) {
  const { rows } = await bd.query(`SELECT id, nome, codigo, municipio, provincia FROM escolas
                                   WHERE estado = 'activo' AND id <> $1 ORDER BY nome`, [u.escolaId]);
  return rows;
}

/** Notas finais das classes já feitas: histórico escolar e classes concluídas no sistema. */
async function historicoDoAluno(bd, alunoId, escolaNome, matriculaActual) {
  const classes = new Map();
  const juntar = (classe, ano, origem, d) => {
    if (!classes.has(classe)) classes.set(classe, { classe, anoLectivo: ano, escolaOrigem: origem, disciplinas: [] });
    classes.get(classe).disciplinas.push(d);
  };
  const h = (await bd.query(`
    SELECT h.classe_codigo, h.ano_lectivo, h.escola_origem, d.sigla, d.nome, h.nota_final, cc.ordem
    FROM historico_escolar h JOIN disciplinas d ON d.id = h.disciplina_id JOIN classes_catalogo cc ON cc.codigo = h.classe_codigo
    WHERE h.aluno_id = $1 ORDER BY cc.ordem, d.nome`, [alunoId])).rows;
  for (const r of h) juntar(r.classe_codigo, r.ano_lectivo, r.escola_origem ?? escolaNome, { sigla: r.sigla, nome: r.nome, notaFinal: r.nota_final });
  // Classes feitas no sistema (anos anteriores), com nota final em todas as disciplinas registadas
  const s = (await bd.query(`
    SELECT c.codigo, al.designacao, d.sigla, d.nome, v.nota_final
    FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN classes c ON c.id = t.classe_id
    JOIN anos_lectivos al ON al.id = m.ano_lectivo_id
    JOIN v_resultados_disciplina v ON v.matricula_id = m.id JOIN disciplinas d ON d.id = v.disciplina_id
    WHERE m.aluno_id = $1 AND m.id <> $2 AND m.estado IN ('concluida', 'activa') AND v.nota_final IS NOT NULL
      AND c.codigo NOT IN ('INI', '13')
    ORDER BY al.designacao, d.nome`, [alunoId, matriculaActual])).rows;
  for (const r of s) {
    if (classes.has(r.codigo) && classes.get(r.codigo).escolaOrigem !== escolaNome) continue;
    juntar(r.codigo, r.designacao, escolaNome, { sigla: r.sigla, nome: r.nome, notaFinal: r.nota_final });
  }
  return [...classes.values()];
}

/**
 * A escola de origem emite a guia de transferência. Exige matrícula activa no ano activo, sem propinas em atraso
 * e sem outra guia pendente. Guarda a ficha, os encarregados, o histórico e as notas dos trimestres publicados.
 */
export async function emitir(bd, u, alunoId, { escolaDestino, motivo }) {
  const a = (await bd.query(`SELECT * FROM alunos WHERE id = $1 AND escola_id = $2`, [alunoId, u.escolaId])).rows[0];
  if (!a) throw naoEncontrado('Aluno');
  const m = (await bd.query(`
    SELECT m.id, m.turma_id, c.codigo AS classe, al.designacao AS ano_lectivo, ${SQL_DESIGNACAO_TURMA} AS turma, cu.nome AS curso
    FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN classes c ON c.id = t.classe_id
    JOIN classes_catalogo cc ON cc.codigo = c.codigo JOIN anos_lectivos al ON al.id = m.ano_lectivo_id
    LEFT JOIN cursos cu ON cu.id = t.curso_id
    WHERE m.aluno_id = $1 AND m.estado = 'activa' AND al.activo`, [alunoId])).rows[0];
  if (!m) throw regra('O aluno não tem matrícula activa no ano lectivo activo.');
  const destino = (await bd.query(`SELECT id, nome FROM escolas WHERE id = $1 AND estado = 'activo'`, [escolaDestino])).rows[0];
  if (!destino || destino.id === u.escolaId) throw regra('Escolha uma escola de destino activa e diferente desta.');
  const divida = (await bd.query(`SELECT count(*)::int AS n, coalesce(sum(valor), 0) AS total FROM cobrancas
                                  WHERE aluno_id = $1 AND estado = 'pendente' AND vencimento < $2`, [alunoId, hoje()])).rows[0];
  if (divida.n) throw regra(`O aluno tem ${divida.n} ${divida.n === 1 ? 'cobrança' : 'cobranças'} em atraso. Regularize antes de transferir.`);

  const escola = (await bd.query('SELECT nome, codigo FROM escolas WHERE id = $1', [u.escolaId])).rows[0];
  const encarregados = (await bd.query(`
    SELECT e.nome, e.telefone, e.email, e.documento, e.profissao, ae.parentesco, ae.principal
    FROM aluno_encarregados ae JOIN encarregados e ON e.id = ae.encarregado_id WHERE ae.aluno_id = $1
    ORDER BY ae.principal DESC, e.nome`, [alunoId])).rows;
  const publicados = (await bd.query('SELECT trimestre FROM publicacoes WHERE turma_id = $1 ORDER BY trimestre', [m.turma_id])).rows.map((r) => r.trimestre);
  const notasAno = (await bd.query(`
    SELECT d.sigla, d.nome, n.trimestre, n.mac, n.npp, n.npt FROM notas n JOIN disciplinas d ON d.id = n.disciplina_id
    WHERE n.matricula_id = $1 AND n.trimestre = ANY($2::smallint[]) ORDER BY d.nome, n.trimestre`, [m.id, publicados])).rows
    .map((n) => ({ ...n, mac: n.mac === null ? null : Number(n.mac), npp: n.npp === null ? null : Number(n.npp), npt: n.npt === null ? null : Number(n.npt) }));
  const dados = {
    aluno: camel(Object.fromEntries([...CAMPOS_ALUNO, 'numero_processo'].map((k) => [k, a[k]]))),
    encarregados: camel(encarregados),
    escolaOrigem: escola,
    matricula: { classe: m.classe, anoLectivo: m.ano_lectivo, turma: m.turma, curso: m.curso },
    historico: await historicoDoAluno(bd, alunoId, escola.nome, m.id),
    trimestresPublicados: publicados,
    notasAno,
  };
  try {
    return await bd.transaccao(async (c) => {
      const t = (await c.query(`
        INSERT INTO transferencias (codigo, escola_origem_id, aluno_id, matricula_id, escola_destino_id, motivo, dados, criado_por)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [novoCodigo(), u.escolaId, alunoId, m.id, destino.id, motivo, JSON.stringify(dados), u.id])).rows[0];
      await registar(c, u, { entidade: 'aluno', entidadeId: alunoId, accao: 'emitir_guia_transferencia',
                             depois: { destino: destino.nome, motivo } });
      return obter(c, u, t.id);
    });
  } catch (e) {
    if (e.code === '23505' && String(e.message).includes('transferencias_uma_pendente')) {
      throw conflito('O aluno já tem uma guia de transferência pendente.');
    }
    throw e;
  }
}

const SQL_T = `
  SELECT t.id, t.codigo, t.estado, t.motivo, t.resposta, t.criado_em, t.decidido_em, t.dados, t.aluno_id, t.aluno_destino_id,
         t.escola_origem_id, t.escola_destino_id, eo.nome AS escola_origem, ed.nome AS escola_destino, u.nome AS criado_por
  FROM transferencias t JOIN escolas eo ON eo.id = t.escola_origem_id JOIN escolas ed ON ed.id = t.escola_destino_id
  JOIN utilizadores u ON u.id = t.criado_por`;

/** Vista de uma guia conforme o lado: o destino não vê o código (tem de o receber da origem) nem ids da origem. */
function vista(u, t) {
  const r = camel(t);
  const origem = r.escolaOrigemId === u.escolaId;
  return {
    id: r.id, estado: r.estado, motivo: r.motivo, resposta: r.resposta, criadoEm: r.criadoEm, decididoEm: r.decididoEm,
    escolaOrigem: r.escolaOrigem, escolaDestino: r.escolaDestino, criadoPor: r.criadoPor,
    sentido: origem ? 'enviada' : 'recebida',
    aluno: { nome: r.dados.aluno.nome, numeroProcesso: r.dados.aluno.numeroProcesso, id: origem ? r.alunoId : r.alunoDestinoId },
    matricula: r.dados.matricula,
    ...(origem ? { codigo: r.codigo } : {}),
  };
}

async function obter(bd, u, id) {
  const t = (await bd.query(`${SQL_T} WHERE t.id = $1 AND $2 IN (t.escola_origem_id, t.escola_destino_id)`, [id, u.escolaId])).rows[0];
  if (!t) throw naoEncontrado('Transferência');
  return vista(u, t);
}

/** Guias enviadas e recebidas pela escola. */
export async function listar(bd, u, { aluno }) {
  const { rows } = await bd.query(`${SQL_T}
    WHERE $1 IN (t.escola_origem_id, t.escola_destino_id) AND ($2::uuid IS NULL OR t.aluno_id = $2)
    ORDER BY t.criado_em DESC LIMIT 200`, [u.escolaId, aluno ?? null]);
  return rows.map((t) => vista(u, t));
}

/** Liga as disciplinas da origem às do destino pela sigla (ou, em alternativa, pelo nome). */
async function mapaDisciplinas(bd, escolaId) {
  const { rows } = await bd.query(`SELECT id, sigla, nome FROM disciplinas WHERE escola_id = $1 AND estado = 'activo'`, [escolaId]);
  const porSigla = new Map(rows.map((d) => [d.sigla.toUpperCase(), d.id]));
  const porNome = new Map(rows.map((d) => [d.nome.toLowerCase(), d.id]));
  return (d) => porSigla.get(d.sigla.toUpperCase()) ?? porNome.get(d.nome.toLowerCase()) ?? null;
}

async function guiaPendenteParaDestino(bd, u, codigo) {
  const t = (await bd.query(`${SQL_T} WHERE t.codigo = $1 AND t.escola_destino_id = $2`, [String(codigo).toUpperCase(), u.escolaId])).rows[0];
  if (!t) throw naoEncontrado('Guia de transferência');
  if (t.estado !== 'pendente') throw conflito(`Esta guia já foi ${t.estado}.`);
  return t;
}

/** O destino introduz o código e vê o que vai receber, com as disciplinas sem correspondência. */
export async function previa(bd, u, codigo) {
  const t = await guiaPendenteParaDestino(bd, u, codigo);
  const disciplina = await mapaDisciplinas(bd, u.escolaId);
  const semCorrespondencia = [...new Set([...t.dados.historico.flatMap((h) => h.disciplinas), ...t.dados.notasAno]
    .filter((d) => !disciplina(d)).map((d) => `${d.nome} (${d.sigla})`))];
  return { ...vista(u, t), dados: { ...t.dados, aluno: { ...t.dados.aluno } }, semCorrespondencia };
}

/**
 * O destino aceita: cria o aluno (novo n.º de processo), os encarregados, o histórico e a matrícula na turma escolhida,
 * copia as notas dos trimestres publicados e marca a matrícula de origem como transferida. Tudo numa transacção.
 */
export async function aceitar(bd, u, id, { codigo, turma }) {
  return bd.transaccao(async (c) => {
    const t = (await c.query('SELECT * FROM transferencias WHERE id = $1 AND escola_destino_id = $2 FOR UPDATE', [id, u.escolaId])).rows[0];
    if (!t) throw naoEncontrado('Transferência');
    if (t.estado !== 'pendente') throw conflito(`Esta guia já foi ${t.estado}.`);
    if (t.codigo !== String(codigo).toUpperCase()) throw regra('O código não corresponde ao da guia de transferência.');
    const d = t.dados;
    const tu = await reservarLugar(c, u, turma);
    const classe = (await c.query(`SELECT c.codigo, al.activo FROM turmas tu JOIN classes c ON c.id = tu.classe_id
                                   JOIN anos_lectivos al ON al.id = tu.ano_lectivo_id WHERE tu.id = $1`, [turma])).rows[0];
    if (!classe.activo) throw regra('Escolha uma turma do ano lectivo activo.');
    if (classe.codigo !== d.matricula.classe) {
      throw regra(`O aluno vem da ${d.matricula.classe === 'INI' ? 'Iniciação' : `${d.matricula.classe}.ª classe`}: escolha uma turma dessa classe.`);
    }

    // Ficha e encarregados
    const al = d.aluno;
    const aluno = await inserirAluno(c, u, {
      nome: al.nome, dataNascimento: String(al.dataNascimento).slice(0, 10), sexo: al.sexo,
      documento: al.documentoTipo ? { tipo: al.documentoTipo, numero: al.documentoNumero } : null,
      naturalidade: al.naturalidade ?? undefined, morada: al.morada ?? undefined, telefone: al.telefone ?? undefined,
      nomePai: al.nomePai ?? undefined, nomeMae: al.nomeMae ?? undefined, municipioNaturalidade: al.municipioNaturalidade ?? undefined,
      provinciaNaturalidade: al.provinciaNaturalidade ?? undefined, documentoEmissaoLocal: al.documentoEmissaoLocal ?? undefined,
      documentoEmissaoData: al.documentoEmissaoData ? String(al.documentoEmissaoData).slice(0, 10) : undefined,
    });
    for (const e of d.encarregados) {
      const ee = await inserir(c, 'encarregados', { escola_id: u.escolaId, nome: e.nome, telefone: e.telefone, email: e.email,
                                                    documento: e.documento, profissao: e.profissao });
      await inserir(c, 'aluno_encarregados', { escola_id: u.escolaId, aluno_id: aluno.id, encarregado_id: ee.id,
                                               parentesco: e.parentesco, principal: e.principal });
    }

    // Histórico escolar (classes anteriores), ligado às disciplinas do destino
    const disciplina = await mapaDisciplinas(c, u.escolaId);
    const semCorrespondencia = new Set();
    for (const h of d.historico) {
      if (h.classe === d.matricula.classe) continue;
      for (const x of h.disciplinas) {
        const disc = disciplina(x);
        if (!disc) { semCorrespondencia.add(`${x.nome} (${x.sigla})`); continue; }
        await c.query(`
          INSERT INTO historico_escolar (escola_id, aluno_id, classe_codigo, ano_lectivo, escola_origem, disciplina_id, nota_final, lancado_por)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (aluno_id, classe_codigo, disciplina_id) DO NOTHING`,
        [u.escolaId, aluno.id, h.classe, h.anoLectivo, h.escolaOrigem, disc, x.notaFinal, u.id]);
      }
    }

    // Matrícula e notas dos trimestres publicados na origem
    const m = await inserir(c, 'matriculas', { escola_id: u.escolaId, aluno_id: aluno.id, turma_id: turma,
                                                ano_lectivo_id: tu.ano_lectivo_id, tipo: 'matricula' });
    await inserir(c, 'matricula_historico', { escola_id: u.escolaId, matricula_id: m.id, accao: 'criar', utilizador_id: u.id,
                                              motivo: `Transferido(a) de ${d.escolaOrigem.nome}` });
    let notas = 0;
    for (const n of d.notasAno) {
      const disc = disciplina(n);
      if (!disc) { semCorrespondencia.add(`${n.nome} (${n.sigla})`); continue; }
      await c.query(`INSERT INTO notas (escola_id, matricula_id, disciplina_id, trimestre, mac, npp, npt, lancada_por)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [u.escolaId, m.id, disc, n.trimestre, n.mac, n.npp, n.npt, u.id]);
      notas += 1;
    }

    // Origem: a matrícula passa a transferida
    await c.query(`UPDATE matriculas SET estado = 'transferida' WHERE id = $1`, [t.matricula_id]);
    await c.query(`INSERT INTO matricula_historico (escola_id, matricula_id, accao, motivo, utilizador_id) VALUES ($1, $2, 'transferir', $3, $4)`,
      [t.escola_origem_id, t.matricula_id, `Para ${(await c.query('SELECT nome FROM escolas WHERE id = $1', [u.escolaId])).rows[0].nome}: ${t.motivo}`, t.criado_por]);
    await c.query(`UPDATE transferencias SET estado = 'aceite', decidido_por = $2, decidido_em = now(), aluno_destino_id = $3,
                   matricula_destino_id = $4 WHERE id = $1`, [id, u.id, aluno.id, m.id]);
    const resumo = { guia: t.codigo, alunoDestino: aluno.id, notas, semCorrespondencia: [...semCorrespondencia] };
    await registar(c, u, { entidade: 'aluno', entidadeId: aluno.id, accao: 'receber_transferencia', depois: resumo });
    await registar(c, { id: u.id, escolaId: t.escola_origem_id }, { entidade: 'aluno', entidadeId: t.aluno_id,
                                                                    accao: 'transferencia_aceite', depois: { guia: t.codigo } });
    return { ...resumo, aluno: { id: aluno.id, numeroProcesso: aluno.numero_processo, nome: aluno.nome } };
  });
}

/** O destino recusa, ou a origem cancela, com motivo. */
export async function encerrar(bd, u, id, { motivo }, accao) {
  return bd.transaccao(async (c) => {
    const t = (await c.query('SELECT * FROM transferencias WHERE id = $1 FOR UPDATE', [id])).rows[0];
    const lado = accao === 'recusada' ? t?.escola_destino_id : t?.escola_origem_id;
    if (!t || ![t.escola_origem_id, t.escola_destino_id].includes(u.escolaId)) throw naoEncontrado('Transferência');
    if (lado !== u.escolaId) throw proibido(accao === 'recusada' ? 'Só a escola de destino recusa a guia.' : 'Só a escola de origem cancela a guia.');
    if (t.estado !== 'pendente') throw conflito(`Esta guia já foi ${t.estado}.`);
    await c.query('UPDATE transferencias SET estado = $2, resposta = $3, decidido_por = $4, decidido_em = now() WHERE id = $1',
      [id, accao, motivo, u.id]);
    await registar(c, u, { entidade: 'aluno', entidadeId: t.aluno_id, accao: `transferencia_${accao}`, justificacao: motivo });
    return obter(c, u, id);
  });
}

/** Dados da guia em PDF (só a origem). */
export async function dadosGuia(bd, u, id) {
  const t = (await bd.query(`${SQL_T} WHERE t.id = $1 AND t.escola_origem_id = $2`, [id, u.escolaId])).rows[0];
  if (!t) throw naoEncontrado('Transferência');
  return { ...vista(u, t), dados: t.dados };
}
