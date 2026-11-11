import { ErroAplicacao, proibido, regra } from '../middleware/erros.js';
import { registar } from './auditoria.js';
import { disciplinasDaTurma, obterTurmaAcessivel } from './turmas.js';
import { SQL_DESIGNACAO_TURMA } from './pessoas.js';

// Horários (RF52–RF54): tempos lectivos por turno e aulas semanais de cada turma.

export const DIAS = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };

/** Tempos típicos de 45 min (40 min à noite), com intervalo a meio. A escola pode ajustá-los. */
const PREDEFINIDOS = {
  manha: [['07:00', '07:45'], ['07:50', '08:35'], ['08:40', '09:25'], ['09:40', '10:25'], ['10:30', '11:15'], ['11:20', '12:05']],
  tarde: [['12:30', '13:15'], ['13:20', '14:05'], ['14:10', '14:55'], ['15:10', '15:55'], ['16:00', '16:45'], ['16:50', '17:35']],
  noite: [['18:00', '18:40'], ['18:45', '19:25'], ['19:30', '20:10'], ['20:15', '20:55'], ['21:00', '21:40']],
};
const hm = (t) => String(t).slice(0, 5);

// ======================================================================
// Tempos lectivos (RF52)
// ======================================================================

/** Tempos do turno. Sem tempos gravados, devolve os predefinidos (predefinidos: true). */
export async function obterTempos(bd, escolaId, turno) {
  const { rows } = await bd.query('SELECT numero, inicio, fim FROM tempos WHERE escola_id = $1 AND turno = $2 ORDER BY numero',
    [escolaId, turno]);
  if (rows.length) return { turno, predefinidos: false, tempos: rows.map((r) => ({ numero: r.numero, inicio: hm(r.inicio), fim: hm(r.fim) })) };
  return { turno, predefinidos: true, tempos: PREDEFINIDOS[turno].map(([inicio, fim], i) => ({ numero: i + 1, inicio, fim })) };
}

/** Grava os predefinidos se a escola ainda não tiver tempos nesse turno (dentro de uma transacção). */
async function garantirTempos(c, escolaId, turno) {
  const t = await obterTempos(c, escolaId, turno);
  if (!t.predefinidos) return t;
  for (const x of t.tempos) {
    await c.query('INSERT INTO tempos (escola_id, turno, numero, inicio, fim) VALUES ($1, $2, $3, $4, $5)',
      [escolaId, turno, x.numero, x.inicio, x.fim]);
  }
  return { ...t, predefinidos: false };
}

export async function definirTempos(bd, u, turno, tempos) {
  const ordenados = [...tempos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  ordenados.forEach((t, i) => {
    if (t.fim <= t.inicio) throw regra(`O ${i + 1}.º tempo termina antes de começar.`);
    if (i > 0 && t.inicio < ordenados[i - 1].fim) throw regra('Os tempos não se podem sobrepor.');
  });
  await bd.transaccao(async (c) => {
    const usados = (await c.query('SELECT DISTINCT tempo FROM aulas WHERE escola_id = $1 AND turno = $2 AND tempo > $3',
      [u.escolaId, turno, ordenados.length])).rows;
    if (usados.length) {
      throw regra(`Há aulas marcadas no ${usados.map((r) => `${r.tempo}.º`).join(', ')} tempo; retire-as dos horários antes de reduzir os tempos.`);
    }
    for (const [i, t] of ordenados.entries()) {
      await c.query(`INSERT INTO tempos (escola_id, turno, numero, inicio, fim) VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (escola_id, turno, numero) DO UPDATE SET inicio = EXCLUDED.inicio, fim = EXCLUDED.fim`,
      [u.escolaId, turno, i + 1, t.inicio, t.fim]);
    }
    await c.query('DELETE FROM tempos WHERE escola_id = $1 AND turno = $2 AND numero > $3', [u.escolaId, turno, ordenados.length]);
    await registar(c, u, { entidade: 'escola', entidadeId: u.escolaId, accao: 'definir_tempos', depois: { turno, tempos: ordenados } });
  });
  return obterTempos(bd, u.escolaId, turno);
}

// ======================================================================
// Horário da turma (RF53)
// ======================================================================

const SQL_AULA = `
  SELECT a.dia, a.tempo, a.turno, a.sala, d.id AS disciplina_id, d.sigla, d.nome AS disciplina, p.id AS professor_id, us.nome AS professor,
         t.id AS turma_id, ${SQL_DESIGNACAO_TURMA} AS turma
  FROM aulas a
  JOIN disciplinas d ON d.id = a.disciplina_id
  JOIN professores p ON p.id = a.professor_id JOIN utilizadores us ON us.id = p.utilizador_id
  JOIN turmas t ON t.id = a.turma_id JOIN classes c ON c.id = t.classe_id JOIN classes_catalogo cc ON cc.codigo = c.codigo`;

const formatarAula = (r) => ({
  dia: r.dia, tempo: r.tempo, turno: r.turno, sala: r.sala,
  disciplina: { id: r.disciplina_id, sigla: r.sigla, nome: r.disciplina },
  professor: { id: r.professor_id, nome: r.professor },
  turma: { id: r.turma_id, designacao: r.turma },
});

export async function horarioDaTurma(bd, u, turmaId, { verificarAcesso = true } = {}) {
  const turma = verificarAcesso
    ? await obterTurmaAcessivel(bd, u, turmaId)
    : (await bd.query('SELECT * FROM turmas WHERE id = $1', [turmaId])).rows[0];
  const tempos = await obterTempos(bd, turma.escola_id, turma.turno);
  const { rows } = await bd.query(`${SQL_AULA} WHERE a.turma_id = $1 ORDER BY a.dia, a.tempo`, [turmaId]);
  return { turma: { id: turma.id, turno: turma.turno, sala: turma.sala }, ...tempos, aulas: rows.map(formatarAula) };
}

/** Quem edita o horário: o director, e o coordenador nas turmas dos cursos que coordena. */
async function exigirEdicao(bd, u, turma) {
  if (u.perfil === 'director') return;
  if (u.perfil === 'coordenador') {
    const { rows } = await bd.query('SELECT 1 FROM cursos WHERE id = $1 AND coordenador_id = $2', [turma.curso_id, u.id]);
    if (rows[0]) return;
  }
  throw proibido('Só o director (ou o coordenador do curso) edita o horário.');
}

/**
 * Substitui o horário da turma. Cada aula: dia, tempo, disciplina (e sala opcional; por omissão, a sala da turma).
 * O professor vem da atribuição da disciplina na turma. Recusa conflitos de professor e de sala com outras turmas.
 */
export async function definirHorario(bd, u, turmaId, aulas) {
  const turma = await obterTurmaAcessivel(bd, u, turmaId);
  await exigirEdicao(bd, u, turma);

  const doPlano = new Map((await disciplinasDaTurma(bd, turma)).map((d) => [d.id, d]));
  const atrib = new Map((await bd.query('SELECT disciplina_id, professor_id FROM atribuicoes WHERE turma_id = $1', [turmaId]))
    .rows.map((r) => [r.disciplina_id, r.professor_id]));
  const vistos = new Set();
  const detalhes = [];
  aulas.forEach((a, i) => {
    const chave = `${a.dia}|${a.tempo}`;
    if (vistos.has(chave)) detalhes.push({ campo: `body.${i}`, mensagem: `${DIAS[a.dia]}, ${a.tempo}.º tempo repetido.` });
    vistos.add(chave);
    if (!doPlano.has(a.disciplina)) detalhes.push({ campo: `body.${i}.disciplina`, mensagem: 'A disciplina não faz parte do plano da turma.' });
    else if (!atrib.has(a.disciplina)) {
      detalhes.push({ campo: `body.${i}.disciplina`, mensagem: `Atribua primeiro um professor a ${doPlano.get(a.disciplina).sigla}.` });
    }
  });
  if (detalhes.length) throw new ErroAplicacao('O horário tem erros.', 422, 'HORARIO', detalhes);

  return bd.transaccao(async (c) => {
    const tempos = await garantirTempos(c, u.escolaId, turma.turno);
    const max = tempos.tempos.length;
    const fora = aulas.filter((a) => a.tempo > max);
    if (fora.length) throw regra(`O turno da ${turma.designacao_curta} só tem ${max} tempos.`);

    // Conflitos com outras turmas (mensagem clara antes de a base de dados recusar)
    const conflitos = [];
    for (const a of aulas) {
      const prof = atrib.get(a.disciplina);
      const sala = a.sala ?? turma.sala ?? null;
      const { rows } = await c.query(`
        SELECT ${SQL_DESIGNACAO_TURMA} AS turma, a.professor_id = $5 AS mesmo_professor, us.nome AS professor
        FROM aulas a JOIN turmas t ON t.id = a.turma_id JOIN classes cl ON cl.id = t.classe_id
        JOIN classes_catalogo cc ON cc.codigo = cl.codigo
        JOIN professores p ON p.id = a.professor_id JOIN utilizadores us ON us.id = p.utilizador_id
        WHERE a.escola_id = $1 AND a.ano_lectivo_id = $2 AND a.turno = $3 AND a.dia = $4 AND a.tempo = $6 AND a.turma_id <> $7
          AND (a.professor_id = $5 OR ($8::text IS NOT NULL AND lower(a.sala) = lower($8)))`,
      [u.escolaId, turma.ano_lectivo_id, turma.turno, a.dia, prof, a.tempo, turmaId, sala]);
      for (const r of rows) {
        conflitos.push({ campo: `${DIAS[a.dia]}, ${a.tempo}.º tempo`,
          mensagem: r.mesmo_professor ? `${r.professor} já tem aula na ${r.turma}.` : `A sala ${sala} já está ocupada pela ${r.turma}.` });
      }
    }
    if (conflitos.length) throw new ErroAplicacao('Há conflitos com o horário de outras turmas.', 409, 'CONFLITO_HORARIO', conflitos);

    await c.query('DELETE FROM aulas WHERE turma_id = $1', [turmaId]);
    for (const a of aulas) {
      await c.query(`
        INSERT INTO aulas (escola_id, turma_id, ano_lectivo_id, turno, dia, tempo, disciplina_id, professor_id, sala)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [u.escolaId, turmaId, turma.ano_lectivo_id, turma.turno, a.dia, a.tempo, a.disciplina, atrib.get(a.disciplina), a.sala ?? turma.sala ?? null]);
    }
    await registar(c, u, { entidade: 'turma', entidadeId: turmaId, accao: 'definir_horario', depois: { aulas: aulas.length } });
    return horarioDaTurma(c, u, turmaId, { verificarAcesso: false });
  });
}

/**
 * Depois de mudar as atribuições de uma turma: as aulas passam para o novo professor, e as aulas
 * de disciplinas sem professor saem do horário. Chamado dentro da transacção das atribuições.
 */
export async function sincronizarAtribuicoes(c, turmaId) {
  await c.query(`DELETE FROM aulas a WHERE a.turma_id = $1
                 AND NOT EXISTS (SELECT 1 FROM atribuicoes t WHERE t.turma_id = a.turma_id AND t.disciplina_id = a.disciplina_id)`, [turmaId]);
  await c.query(`UPDATE aulas a SET professor_id = t.professor_id FROM atribuicoes t
                 WHERE a.turma_id = $1 AND t.turma_id = a.turma_id AND t.disciplina_id = a.disciplina_id AND a.professor_id <> t.professor_id`,
  [turmaId]);
}

// ======================================================================
// Horário do professor (RF54)
// ======================================================================

export async function horarioDoProfessor(bd, u) {
  if (!u.professorId) throw regra('Esta conta não tem ficha de professor.');
  const { rows } = await bd.query(`${SQL_AULA}
    WHERE a.professor_id = $1 AND a.ano_lectivo_id = (SELECT id FROM anos_lectivos WHERE escola_id = $2 AND activo)
    ORDER BY a.turno, a.dia, a.tempo`, [u.professorId, u.escolaId]);
  const tempos = {};
  for (const t of new Set(rows.map((r) => r.turno))) tempos[t] = (await obterTempos(bd, u.escolaId, t)).tempos;
  return { tempos, aulas: rows.map(formatarAula) };
}
