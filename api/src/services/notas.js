import { camel } from '../util/sql.js';
import { ErroAplicacao, conflito, naoEncontrado, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { decidirTransicao } from './avaliacao.js';
import { disciplinasDaTurma, exigirProfessorDaDisciplina, obterTurmaAcessivel } from './turmas.js';

// ======================================================================
// Verificações comuns
// ======================================================================

async function estadoTrimestre(bd, turma, trimestre) {
  const { rows } = await bd.query(`
    SELECT t.aberto, EXISTS (SELECT 1 FROM publicacoes p WHERE p.turma_id = $2 AND p.trimestre = $3) AS publicado
    FROM trimestres t WHERE t.ano_lectivo_id = $1 AND t.numero = $3`, [turma.ano_lectivo_id, turma.id, trimestre]);
  return rows[0] ?? { aberto: false, publicado: false };
}

/** Lançamento livre: trimestre aberto e ainda não publicado (RF24, RF30). */
async function exigirTrimestreEditavel(bd, turma, trimestre) {
  const e = await estadoTrimestre(bd, turma, trimestre);
  if (e.publicado) throw regra('As notas deste trimestre já foram publicadas. Peça uma correcção ao director.');
  if (!e.aberto) throw regra('O trimestre está fechado para lançamento.');
}

/** RN12 e RN16: a Iniciação não tem notas numéricas e a 13.ª é só de estágio. */
function exigirClasseNumerica(turma) {
  if (turma.avaliacao_qualitativa) throw regra('Na Iniciação a avaliação é descritiva, sem notas numéricas.');
  if (turma.apenas_estagio) throw regra('A 13.ª classe é só de estágio e TFC, sem notas de disciplinas.');
}

async function exigirDisciplinaDoPlano(bd, turma, disciplinaId) {
  const d = (await disciplinasDaTurma(bd, turma)).find((x) => x.id === disciplinaId);
  if (!d) throw naoEncontrado('Disciplina da turma');
  return d;
}

/** RN05: as notas respeitam a escala da classe (0–10 ou 0–20). */
function exigirEscala(turma, itens, campos) {
  const max = turma.escala_maxima;
  const detalhes = [];
  itens.forEach((it, i) => {
    for (const campo of campos) {
      if (it[campo] != null && it[campo] > max) detalhes.push({ campo: `body.${i}.${campo}`, mensagem: `Máximo ${max}.` });
    }
  });
  if (detalhes.length) throw new ErroAplicacao(`Há notas acima da escala da classe (0–${max}).`, 422, 'ESCALA', detalhes);
}

async function exigirMatriculasDaTurma(bd, turma, matriculas) {
  const { rows } = await bd.query(
    `SELECT id FROM matriculas WHERE turma_id = $1 AND estado = 'activa' AND id = ANY($2::uuid[])`, [turma.id, matriculas]);
  if (rows.length !== new Set(matriculas).size) throw regra('Há matrículas que não pertencem a esta turma ou não estão activas.');
}

/** Quem pode ver as notas de uma disciplina: direcção, secretaria, coordenação, DT e o professor da disciplina. */
function exigirLeituraDisciplina(u, turma, disciplinaId) {
  if (u.perfil !== 'professor') return;
  if (!turma.ehDirectorTurma && !turma.disciplinasDoProfessor.includes(disciplinaId)) {
    throw proibido('Só pode ver as notas das disciplinas que lecciona.');
  }
}

// ======================================================================
// Notas trimestrais (RF24, RF25)
// ======================================================================

async function grelhaNotas(bd, turma, disciplinaId, trimestre) {
  const { publicado } = await estadoTrimestre(bd, turma, trimestre);
  const { rows } = await bd.query(`
    SELECT n.id, m.id AS matricula,
           json_build_object('id', a.id, 'numeroProcesso', a.numero_processo, 'nome', a.nome) AS aluno,
           $3::int AS trimestre, n.mac, n.npp, n.npt, n.mt
    FROM matriculas m
    JOIN alunos a ON a.id = m.aluno_id
    LEFT JOIN notas n ON n.matricula_id = m.id AND n.disciplina_id = $2 AND n.trimestre = $3
    WHERE m.turma_id = $1 AND m.estado = 'activa'
    ORDER BY a.nome`, [turma.id, disciplinaId, trimestre]);
  return camel(rows).map((r) => ({ ...r, publicada: publicado }));
}

export async function obterNotas(bd, u, turmaId, disciplinaId, trimestre) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  exigirLeituraDisciplina(u, turma, disciplinaId);
  await exigirDisciplinaDoPlano(bd, turma, disciplinaId);
  return grelhaNotas(bd, turma, disciplinaId, trimestre);
}

export async function lancarNotas(bd, u, turmaId, disciplinaId, trimestre, itens) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  exigirProfessorDaDisciplina(u, turma, disciplinaId);
  exigirClasseNumerica(turma);
  await exigirDisciplinaDoPlano(bd, turma, disciplinaId);
  await exigirTrimestreEditavel(bd, turma, trimestre);
  exigirEscala(turma, itens, ['mac', 'npp', 'npt']);
  await exigirMatriculasDaTurma(bd, turma, itens.map((i) => i.matricula));

  await bd.transaccao(async (c) => {
    for (const it of itens) {
      await c.query(`
        INSERT INTO notas (escola_id, matricula_id, disciplina_id, trimestre, mac, npp, npt, lancada_por)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (matricula_id, disciplina_id, trimestre)
        DO UPDATE SET mac = EXCLUDED.mac, npp = EXCLUDED.npp, npt = EXCLUDED.npt, lancada_por = EXCLUDED.lancada_por`,
        [u.escolaId, it.matricula, disciplinaId, trimestre, it.mac ?? null, it.npp ?? null, it.npt ?? null, u.id]);
    }
    await registar(c, u, { entidade: 'nota', entidadeId: turmaId, accao: 'lancar',
                           depois: { disciplina: disciplinaId, trimestre, itens } });
  });
  return grelhaNotas(bd, turma, disciplinaId, trimestre);
}

// ======================================================================
// Exames (RF27, RF28) e resultados finais
// ======================================================================

const SQL_RESULTADO = `
  SELECT v.matricula_id AS matricula, v.disciplina_id AS disciplina, v.mfd, v.exame, v.cf, v.nota_final,
         CASE WHEN v.nota_final IS NULL THEN NULL ELSE v.nota_final >= v.nota_minima_aprovacao END AS aprovado
  FROM v_resultados_disciplina v`;

export async function lancarExames(bd, u, turmaId, disciplinaId, itens) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  if (u.perfil === 'professor') exigirProfessorDaDisciplina(u, turma, disciplinaId);
  if (!turma.classe_de_exame) throw regra('Esta classe não é classe de exame (só a 6.ª, a 9.ª e a 12.ª).');
  await exigirDisciplinaDoPlano(bd, turma, disciplinaId);
  exigirEscala(turma, itens, ['exame']);
  await exigirMatriculasDaTurma(bd, turma, itens.map((i) => i.matricula));

  await bd.transaccao(async (c) => {
    for (const it of itens) {
      await c.query(`
        INSERT INTO exames (escola_id, matricula_id, disciplina_id, nota, lancada_por) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (matricula_id, disciplina_id) DO UPDATE SET nota = EXCLUDED.nota, lancada_por = EXCLUDED.lancada_por`,
        [u.escolaId, it.matricula, disciplinaId, it.exame, u.id]);
    }
    await registar(c, u, { entidade: 'nota', entidadeId: turmaId, accao: 'lancar_exame', depois: { disciplina: disciplinaId, itens } });
  });
  const { rows } = await bd.query(
    `${SQL_RESULTADO} WHERE v.turma_id = $1 AND v.disciplina_id = $2 AND v.matricula_id = ANY($3::uuid[])`,
    [turmaId, disciplinaId, itens.map((i) => i.matricula)]);
  return camel(rows);
}

// ======================================================================
// Avaliação descritiva da Iniciação (RF33)
// ======================================================================

export async function lancarDescritivas(bd, u, turmaId, trimestre, itens) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  if (u.perfil !== 'professor') throw proibido('Só os professores da turma lançam a avaliação descritiva.');
  if (!turma.avaliacao_qualitativa) throw regra('A avaliação descritiva só existe na Iniciação.');
  await exigirTrimestreEditavel(bd, turma, trimestre);
  await exigirMatriculasDaTurma(bd, turma, itens.map((i) => i.matricula));
  await bd.transaccao(async (c) => {
    for (const it of itens) {
      await c.query(`
        INSERT INTO avaliacoes_descritivas (escola_id, matricula_id, trimestre, texto, autor_id) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (matricula_id, trimestre) DO UPDATE SET texto = EXCLUDED.texto, autor_id = EXCLUDED.autor_id`,
        [u.escolaId, it.matricula, trimestre, it.texto, u.id]);
    }
    await registar(c, u, { entidade: 'nota', entidadeId: turmaId, accao: 'lancar_descritivas', depois: { trimestre, n: itens.length } });
  });
  return { gravadas: itens.length };
}

// ======================================================================
// Publicação (RF30) e correcção (RF31)
// ======================================================================

export async function publicar(bd, u, turmaId, trimestre) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  if (u.perfil !== 'director' && !turma.ehDirectorTurma) throw proibido('Só o director de turma ou o director publicam as notas.');
  if (turma.apenas_estagio) throw regra('A 13.ª classe não tem notas trimestrais para publicar.');
  const e = await estadoTrimestre(bd, turma, trimestre);
  if (e.publicado) throw conflito('Este trimestre já foi publicado.');

  // Faltam notas? Cada aluno activo tem de ter MT em todas as disciplinas (ou a descritiva, na Iniciação)
  const { rows } = turma.avaliacao_qualitativa
    ? await bd.query(`
        SELECT count(*)::int AS em_falta FROM matriculas m
        WHERE m.turma_id = $1 AND m.estado = 'activa'
          AND NOT EXISTS (SELECT 1 FROM avaliacoes_descritivas d WHERE d.matricula_id = m.id AND d.trimestre = $2)`,
      [turmaId, trimestre])
    : await bd.query(`
        SELECT count(*)::int AS em_falta
        FROM matriculas m
        CROSS JOIN (SELECT pd.disciplina_id FROM planos_curriculares p JOIN plano_disciplinas pd ON pd.plano_id = p.id
                    WHERE p.classe_id = $3 AND p.curso_id IS NOT DISTINCT FROM $4) d
        LEFT JOIN notas n ON n.matricula_id = m.id AND n.disciplina_id = d.disciplina_id AND n.trimestre = $2
        WHERE m.turma_id = $1 AND m.estado = 'activa' AND n.mt IS NULL`,
      [turmaId, trimestre, turma.classe_id, turma.curso_id]);
  if (rows[0].em_falta > 0) throw regra(`Faltam ${rows[0].em_falta} notas por lançar neste trimestre.`);

  await bd.transaccao(async (c) => {
    await c.query('INSERT INTO publicacoes (escola_id, turma_id, trimestre, publicado_por) VALUES ($1, $2, $3, $4)',
      [u.escolaId, turmaId, trimestre, u.id]);
    await registar(c, u, { entidade: 'nota', entidadeId: turmaId, accao: 'publicar', depois: { trimestre } });
  });
  return { turma: turmaId, trimestre, publicado: true };
}

/** Correcção de uma nota (normalmente já publicada), com justificação obrigatória e auditoria. */
export async function corrigir(bd, u, notaId, { campo, valor, justificacao }) {
  const n = (await bd.query('SELECT * FROM notas WHERE id = $1 AND escola_id = $2', [notaId, u.escolaId])).rows[0];
  if (!n) throw naoEncontrado('Nota');
  const turma = await obterTurmaAcessivel(bd, u, (await bd.query('SELECT turma_id FROM matriculas WHERE id = $1', [n.matricula_id])).rows[0].turma_id);
  exigirEscala(turma, [{ valor }], ['valor']);

  await bd.transaccao(async (c) => {
    let antes;
    if (campo === 'exame') {
      if (!turma.classe_de_exame) throw regra('Esta classe não tem exame.');
      const e = (await c.query('SELECT * FROM exames WHERE matricula_id = $1 AND disciplina_id = $2 FOR UPDATE',
        [n.matricula_id, n.disciplina_id])).rows[0];
      if (!e) throw naoEncontrado('Nota de exame');
      antes = { exame: e.nota };
      await c.query('UPDATE exames SET nota = $2, lancada_por = $3 WHERE id = $1', [e.id, valor, u.id]);
    } else {
      antes = { [campo]: n[campo] };
      // campo vem de um enum Zod (mac, npp, npt): seguro para usar como nome de coluna
      await c.query(`UPDATE notas SET ${campo} = $2, lancada_por = $3 WHERE id = $1`, [notaId, valor, u.id]);
    }
    await registar(c, u, { entidade: 'nota', entidadeId: notaId, accao: 'corrigir_nota',
                           antes: { trimestre: n.trimestre, ...antes }, depois: { [campo]: valor }, justificacao });
  });
  const r = (await bd.query(`${SQL_RESULTADO} WHERE v.matricula_id = $1 AND v.disciplina_id = $2`,
    [n.matricula_id, n.disciplina_id])).rows[0];
  const mts = (await bd.query('SELECT mt FROM notas WHERE matricula_id = $1 AND disciplina_id = $2 ORDER BY trimestre',
    [n.matricula_id, n.disciplina_id])).rows.map((x) => x.mt);
  return { id: notaId, ...camel(r), mts };
}

// ======================================================================
// Pautas (RF32, RF26, RF28, RF29, RF34)
// ======================================================================

async function alunosDaTurma(bd, turmaId) {
  const { rows } = await bd.query(`
    SELECT m.id AS matricula, json_build_object('id', a.id, 'numeroProcesso', a.numero_processo, 'nome', a.nome) AS aluno
    FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
    WHERE m.turma_id = $1 AND m.estado = 'activa' ORDER BY a.nome`, [turmaId]);
  return rows;
}

const cabecalho = (turma, disciplinas) => ({
  turma: { id: turma.id, designacao: turma.designacao_curta, escalaMaxima: turma.escala_maxima,
           notaMinimaAprovacao: turma.nota_minima_aprovacao, classeDeExame: turma.classe_de_exame },
  disciplinas: disciplinas.map((d) => ({ id: d.id, sigla: d.sigla, nome: d.nome, chave: d.chave })),
});

export async function pautaTrimestral(bd, u, turmaId, trimestre) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  const disciplinas = await disciplinasDaTurma(bd, turma);
  const alunos = await alunosDaTurma(bd, turmaId);
  const { publicado } = await estadoTrimestre(bd, turma, trimestre);

  if (turma.avaliacao_qualitativa) {
    const { rows } = await bd.query(`SELECT matricula_id, texto FROM avaliacoes_descritivas
      WHERE trimestre = $2 AND matricula_id IN (SELECT id FROM matriculas WHERE turma_id = $1)`, [turmaId, trimestre]);
    const textos = new Map(rows.map((r) => [r.matricula_id, r.texto]));
    return { ...cabecalho(turma, []), trimestre, publicada: publicado,
             linhas: alunos.map((a) => ({ aluno: a.aluno, descritiva: textos.get(a.matricula) ?? null })) };
  }

  const { rows } = await bd.query(`SELECT n.matricula_id, n.disciplina_id, n.mt FROM notas n
    WHERE n.trimestre = $2 AND n.matricula_id IN (SELECT id FROM matriculas WHERE turma_id = $1)`, [turmaId, trimestre]);
  const mt = new Map(rows.map((r) => [`${r.matricula_id}|${r.disciplina_id}`, r.mt]));
  const linhas = alunos.map((a) => {
    const notas = Object.fromEntries(disciplinas.map((d) => [d.sigla, mt.get(`${a.matricula}|${d.id}`) ?? null]));
    const negativas = Object.values(notas).filter((v) => v !== null && v < turma.nota_minima_aprovacao).length;
    return { aluno: a.aluno, notas, negativas, situacao: null };
  });
  return { ...cabecalho(turma, disciplinas), trimestre, publicada: publicado, linhas };
}

export async function pautaFinal(bd, u, turmaId) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  const alunos = await alunosDaTurma(bd, turmaId);

  if (turma.apenas_estagio) {
    const { rows } = await bd.query(`SELECT matricula_id, nota, tfc_nota, curso_concluido FROM estagios
      WHERE matricula_id IN (SELECT id FROM matriculas WHERE turma_id = $1)`, [turmaId]);
    const est = new Map(rows.map((r) => [r.matricula_id, r]));
    return { ...cabecalho(turma, []), trimestre: null, linhas: alunos.map((a) => {
      const e = est.get(a.matricula);
      return { aluno: a.aluno, notas: { ESTAGIO: e?.nota ?? null, TFC: e?.tfc_nota ?? null }, negativas: 0,
               situacao: e?.curso_concluido ? 'concluido' : 'pendente' };
    }) };
  }

  const disciplinas = await disciplinasDaTurma(bd, turma);
  const { rows } = await bd.query(
    'SELECT matricula_id, disciplina_id, nota_final FROM v_resultados_disciplina WHERE turma_id = $1', [turmaId]);
  const finais = new Map(rows.map((r) => [`${r.matricula_id}|${r.disciplina_id}`, r.nota_final]));
  const regraClasse = {
    notaMinimaAprovacao: turma.nota_minima_aprovacao, minimoNegativa: turma.minimo_negativa,
    maxNegativas: turma.max_negativas, classeDeExame: turma.classe_de_exame,
  };
  const linhas = alunos.map((a) => {
    const resultados = disciplinas.map((d) => ({ sigla: d.sigla, chave: d.chave, notaFinal: finais.get(`${a.matricula}|${d.id}`) ?? null }));
    const decisao = decidirTransicao(regraClasse, resultados);
    return {
      aluno: a.aluno,
      notas: Object.fromEntries(resultados.map((r) => [r.sigla, r.notaFinal])),
      negativas: decisao.negativas,
      situacao: decisao.situacao,
      motivos: decisao.motivos,
    };
  });
  return { ...cabecalho(turma, disciplinas), trimestre: null, linhas };
}

/** RF34: pauta final em CSV (separador ';' para abrir no Excel em português). A exportação fica registada. */
export async function pautaFinalCsv(bd, u, turmaId) {
  const pauta = await pautaFinal(bd, u, turmaId);
  const siglas = Object.keys(pauta.linhas[0]?.notas ?? Object.fromEntries(pauta.disciplinas.map((d) => [d.sigla, 0])));
  const esc = (v) => (v === null || v === undefined ? '' : /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const situacoes = { transita: 'Transita', nao_transita: 'Não transita', pendente: 'Pendente', concluido: 'Concluído' };
  const linhas = [
    ['N.º processo', 'Nome', ...siglas, 'Negativas', 'Situação'].join(';'),
    ...pauta.linhas.map((l) => [l.aluno.numeroProcesso, l.aluno.nome, ...siglas.map((s) => l.notas[s]), l.negativas,
                                situacoes[l.situacao] ?? ''].map(esc).join(';')),
  ];
  await registar(bd, u, { entidade: 'turma', entidadeId: turmaId, accao: 'exportar_pauta' });
  return `﻿${linhas.join('\r\n')}\r\n`; // BOM para o Excel reconhecer o UTF-8
}
