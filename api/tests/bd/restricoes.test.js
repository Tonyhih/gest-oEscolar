import { describe, it, expect, beforeAll } from 'vitest';
import { criarBd, esperarErro } from './ajuda.js';

let bd;
const um = async (sql, p) => (await bd.query(sql, p)).rows[0];

// Dados de apoio tirados do seed
let escolaA, escolaB, alunoA, turmaA7, turmaB10, anoA, secretariaA, notaQualquer;

beforeAll(async () => {
  bd = await criarBd({ comSeed: true });
  escolaA = await um(`SELECT * FROM escolas WHERE codigo = 'LDA-101'`);
  escolaB = await um(`SELECT * FROM escolas WHERE codigo = 'HBO-201'`);
  anoA = await um(`SELECT * FROM anos_lectivos WHERE escola_id = $1`, [escolaA.id]);
  alunoA = await um(`SELECT * FROM alunos WHERE nome = 'Graça Lukeny'`);
  turmaA7 = await um(`SELECT t.* FROM turmas t JOIN classes c ON c.id = t.classe_id WHERE c.escola_id = $1 AND c.codigo = '7'`, [escolaA.id]);
  turmaB10 = await um(`SELECT t.* FROM turmas t JOIN classes c ON c.id = t.classe_id WHERE c.escola_id = $1 AND c.codigo = '10'`, [escolaB.id]);
  secretariaA = await um(`SELECT * FROM utilizadores WHERE email = 'secretaria@lda101.test'`);
  notaQualquer = await um(`SELECT * FROM notas LIMIT 1`);
});

describe('Isolamento entre escolas (RNF01)', () => {
  it('não deixa matricular um aluno da Escola A numa turma da Escola B', async () => {
    await esperarErro(
      bd.query(`INSERT INTO matriculas (escola_id, aluno_id, turma_id, ano_lectivo_id, tipo)
                VALUES ($1, $2, $3, $4, 'matricula')`, [escolaA.id, alunoA.id, turmaB10.id, turmaB10.ano_lectivo_id]),
      'violates foreign key constraint',
    );
  });
  it('não deixa a matrícula apontar para um ano lectivo diferente do da turma', async () => {
    const outroAno = await um(`INSERT INTO anos_lectivos (escola_id, designacao) VALUES ($1, '2027/2028') RETURNING *`, [escolaA.id]);
    const novoAluno = await um(`INSERT INTO alunos (escola_id, numero_processo, nome, data_nascimento, sexo)
                                VALUES ($1, 'TESTE-ANO', 'Aluno Teste', '2013-01-01', 'M') RETURNING *`, [escolaA.id]);
    await esperarErro(
      bd.query(`INSERT INTO matriculas (escola_id, aluno_id, turma_id, ano_lectivo_id, tipo)
                VALUES ($1, $2, $3, $4, 'matricula')`, [escolaA.id, novoAluno.id, turmaA7.id, outroAno.id]),
      'violates foreign key constraint',
    );
  });
});

describe('Matrículas', () => {
  it('RN06: uma só matrícula activa por aluno e ano lectivo', async () => {
    await esperarErro(
      bd.query(`INSERT INTO matriculas (escola_id, aluno_id, turma_id, ano_lectivo_id, tipo)
                VALUES ($1, $2, $3, $4, 'matricula')`, [escolaA.id, alunoA.id, turmaA7.id, anoA.id]),
      'matriculas_uma_activa',
    );
  });
  it('mudar de turma ou anular exige motivo', async () => {
    const m = await um(`SELECT * FROM matriculas WHERE aluno_id = $1`, [alunoA.id]);
    await esperarErro(
      bd.query(`INSERT INTO matricula_historico (escola_id, matricula_id, accao, utilizador_id)
                VALUES ($1, $2, 'anular', $3)`, [escolaA.id, m.id, secretariaA.id]),
      'matricula_historico_check',
    );
  });
  it('RNF04: matrículas não se apagam', async () => {
    await esperarErro(bd.query(`DELETE FROM matriculas WHERE aluno_id = $1`, [alunoA.id]), 'só aceita inserções');
  });
});

describe('Notas', () => {
  it('RN05: nota fora de 0–20 é recusada', async () => {
    await esperarErro(bd.query(`UPDATE notas SET npt = 21 WHERE id = $1`, [notaQualquer.id]), 'notas_npt_check');
  });
  it('RF25: a MT é calculada pela base de dados', async () => {
    const n = await um(`UPDATE notas SET mac = 12, npp = 14, npt = 10 WHERE id = $1 RETURNING mt`, [notaQualquer.id]);
    expect(n.mt).toBe(12);
  });
  it('a MT fica vazia enquanto faltar alguma nota', async () => {
    const n = await um(`UPDATE notas SET npt = NULL WHERE id = $1 RETURNING mt`, [notaQualquer.id]);
    expect(n.mt).toBeNull();
  });
  it('RNF04: notas não se apagam', async () => {
    await esperarErro(bd.query(`DELETE FROM notas WHERE id = $1`, [notaQualquer.id]), 'só aceita inserções');
  });
  it('não há duas notas para o mesmo aluno, disciplina e trimestre', async () => {
    const n = await um(`SELECT * FROM notas WHERE id <> $1 LIMIT 1`, [notaQualquer.id]);
    await esperarErro(
      bd.query(`INSERT INTO notas (escola_id, matricula_id, disciplina_id, trimestre, lancada_por)
                VALUES ($1, $2, $3, $4, $5)`, [n.escola_id, n.matricula_id, n.disciplina_id, n.trimestre, n.lancada_por]),
      'duplicate key',
    );
  });
});

describe('Estrutura de ensino', () => {
  it('RN11: a 13.ª classe só existe no técnico-profissional', async () => {
    await esperarErro(
      bd.query(`INSERT INTO classes (escola_id, codigo, ramo, escala_maxima, nota_minima_aprovacao, minimo_negativa, apenas_estagio)
                VALUES ($1, '13', 'geral', 20, 10, 7, true)`, [escolaA.id]),
      'classe_13_tecnica',
    );
  });
  it('a nota mínima de aprovação não pode passar a escala', async () => {
    await esperarErro(
      bd.query(`INSERT INTO classes (escola_id, codigo, escala_maxima, nota_minima_aprovacao, minimo_negativa)
                VALUES ($1, '8', 10, 12, 3.5)`, [escolaA.id]),
      'classe_aprovacao_na_escala',
    );
  });
  it('RF10: só um ano lectivo activo por escola', async () => {
    await esperarErro(
      bd.query(`INSERT INTO anos_lectivos (escola_id, designacao, activo) VALUES ($1, '2030/2031', true)`, [escolaA.id]),
      'anos_lectivos_um_activo',
    );
  });
});

describe('Utilizadores', () => {
  it('o email é único em toda a plataforma, sem distinguir maiúsculas', async () => {
    await esperarErro(
      bd.query(`INSERT INTO utilizadores (escola_id, nome, email, perfil, palavra_passe_hash)
                VALUES ($1, 'Cópia', 'SECRETARIA@lda101.test', 'secretaria', 'x')`, [escolaB.id]),
      'utilizadores_email_unico',
    );
  });
  it('só o administrador da plataforma não tem escola', async () => {
    await esperarErro(
      bd.query(`INSERT INTO utilizadores (nome, email, perfil, palavra_passe_hash)
                VALUES ('Sem escola', 'sem@escola.test', 'professor', 'x')`),
      'utilizador_escola_conforme_perfil',
    );
  });
});

describe('Faltas, estágio e auditoria', () => {
  it('RF36: uma falta justificada tem de ter motivo, mesmo com autor', async () => {
    const f = await um(`SELECT * FROM faltas WHERE estado = 'injustificada' LIMIT 1`);
    await esperarErro(bd.query(`UPDATE faltas SET estado = 'justificada' WHERE id = $1`, [f.id]), 'faltas_justificada_com_motivo');
    await esperarErro(
      bd.query(`UPDATE faltas SET estado = 'justificada', justificada_por = registada_por WHERE id = $1`, [f.id]),
      'faltas_justificada_com_motivo',
    );
  });
  it('RF43: curso concluído só com estágio e TFC aprovados', async () => {
    const { rows } = await bd.query(`SELECT a.nome, e.curso_concluido FROM estagios e
                                     JOIN matriculas m ON m.id = e.matricula_id JOIN alunos a ON a.id = m.aluno_id ORDER BY a.nome`);
    expect(rows).toEqual([
      { nome: 'Albertina Sakaita', curso_concluido: false },
      { nome: 'Zacarias Mbumba', curso_concluido: true },
    ]);
  });
  it('a auditoria só aceita inserções', async () => {
    await bd.query(`INSERT INTO auditoria (escola_id, utilizador_id, entidade, accao) VALUES ($1, $2, 'nota', 'teste')`,
      [escolaA.id, secretariaA.id]);
    await esperarErro(bd.query(`UPDATE auditoria SET accao = 'outra'`), 'só aceita inserções');
    await esperarErro(bd.query(`DELETE FROM auditoria`), 'só aceita inserções');
  });
});
