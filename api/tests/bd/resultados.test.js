import { describe, it, expect, beforeAll } from 'vitest';
import { criarBd } from './ajuda.js';
import { decidirTransicao } from '../../src/services/avaliacao.js';

let bd;
beforeAll(async () => { bd = await criarBd({ comSeed: true }); });

/** Resultados por aluno a partir da vista, prontos para decidirTransicao. */
async function situacoes() {
  const { rows } = await bd.query(`
    SELECT a.nome, c.codigo AS classe, c.nota_minima_aprovacao, c.minimo_negativa, c.max_negativas, c.classe_de_exame,
           v.nota_final, v.chave
    FROM v_resultados_disciplina v
    JOIN matriculas m ON m.id = v.matricula_id
    JOIN alunos a     ON a.id = m.aluno_id
    JOIN turmas t     ON t.id = m.turma_id
    JOIN classes c    ON c.id = t.classe_id`);
  const porAluno = new Map();
  for (const r of rows) {
    if (!porAluno.has(r.nome)) {
      porAluno.set(r.nome, {
        classe: { notaMinimaAprovacao: r.nota_minima_aprovacao, minimoNegativa: r.minimo_negativa,
                  maxNegativas: r.max_negativas, classeDeExame: r.classe_de_exame },
        resultados: [],
      });
    }
    porAluno.get(r.nome).resultados.push({ notaFinal: r.nota_final, chave: r.chave });
  }
  return new Map([...porAluno].map(([nome, { classe, resultados }]) => [nome, decidirTransicao(classe, resultados).situacao]));
}

describe('Vista v_resultados_disciplina', () => {
  it('RN01–RN04: MFD 9,5 arredonda para 10', async () => {
    const { rows } = await bd.query(`SELECT v.mfd, v.nota_final FROM v_resultados_disciplina v
      JOIN matriculas m ON m.id = v.matricula_id JOIN alunos a ON a.id = m.aluno_id
      JOIN disciplinas d ON d.id = v.disciplina_id WHERE a.nome = 'Luzia Kapinga' AND d.sigla = 'FIS'`);
    expect(rows[0]).toEqual({ mfd: 9.5, nota_final: 10 });
  });

  it('não sofre do erro de vírgula flutuante do JavaScript (MT 8,7 + 10,1 + 9,7)', async () => {
    // Em JavaScript, (8.7 + 10.1 + 9.7) / 3 dá 9,4999… e Math.round devolve 9
    expect(Math.round((8.7 + 10.1 + 9.7) / 3)).toBe(9);
    const n = (await bd.query(`SELECT * FROM notas n JOIN matriculas m ON m.id = n.matricula_id
      JOIN alunos a ON a.id = m.aluno_id WHERE a.nome = 'Graça Lukeny' LIMIT 1`)).rows[0];
    for (const [t, v] of [[1, 8.7], [2, 10.1], [3, 9.7]]) {
      await bd.query(`UPDATE notas SET mac = $1, npp = $1, npt = $1 WHERE matricula_id = $2 AND disciplina_id = $3 AND trimestre = $4`,
        [v, n.matricula_id, n.disciplina_id, t]);
    }
    const r = (await bd.query(`SELECT mfd, nota_final FROM v_resultados_disciplina WHERE matricula_id = $1 AND disciplina_id = $2`,
      [n.matricula_id, n.disciplina_id])).rows[0];
    expect(r).toEqual({ mfd: 9.5, nota_final: 10 });
  });

  it('RN03: classe de exame – MFD 12 e exame 9 dão CF 10,2 e nota final 10', async () => {
    const { rows } = await bd.query(`SELECT DISTINCT v.cf, v.nota_final FROM v_resultados_disciplina v
      JOIN matriculas m ON m.id = v.matricula_id JOIN alunos a ON a.id = m.aluno_id WHERE a.nome = 'Manuel Chissola'`);
    expect(rows).toEqual([{ cf: 10.2, nota_final: 10 }]);
  });

  it('sem nota de exame, a nota final fica por calcular', async () => {
    const { rows } = await bd.query(`SELECT DISTINCT v.nota_final FROM v_resultados_disciplina v
      JOIN matriculas m ON m.id = v.matricula_id JOIN alunos a ON a.id = m.aluno_id WHERE a.nome = 'Paula Samakuva'`);
    expect(rows).toEqual([{ nota_final: null }]);
  });
});

describe('Situação de cada aluno do seed (RF29)', () => {
  beforeAll(async () => { bd = await criarBd({ comSeed: true }); }); // base nova, sem as alterações acima

  const esperado = {
    // 7.ª classe (normal, 0–20)
    'Graça Lukeny': 'transita', 'Hélder Cassoma': 'transita', 'Isabel Ndala': 'nao_transita',
    'Joaquim Muteka': 'nao_transita', 'Luzia Kapinga': 'transita',
    // 10.ª classe técnico-profissional (disciplina-chave PROG)
    'Quintino Lussati': 'transita', 'Rosária Ngueve': 'transita', 'Sebastião Tchissola': 'nao_transita',
    'Telma Capamba': 'nao_transita', 'Ulisses Kaculo': 'transita',
    // 6.ª classe (exame, 0–10)
    'Celeste Tchipa': 'transita', 'Domingos Sapalo': 'nao_transita', 'Esperança Nzinga': 'transita', 'Fernando Mbala': 'pendente',
    // 9.ª e 12.ª classes (exame, 0–20)
    'Manuel Chissola': 'transita', 'Nádia Quissanga': 'nao_transita', 'Osvaldo Tchinguali': 'transita', 'Paula Samakuva': 'pendente',
    'Valdemar Huambo': 'transita', 'Wanda Chipenda': 'nao_transita', 'Xavier Ndongala': 'transita', 'Yolanda Kassoma': 'pendente',
  };

  it('cada aluno tem a situação esperada para o seu caso', async () => {
    const reais = await situacoes();
    expect(Object.fromEntries([...reais].sort())).toEqual(Object.fromEntries(Object.entries(esperado).sort()));
  });
});
