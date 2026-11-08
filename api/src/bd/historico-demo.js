// Dados de DEMONSTRAÇÃO (fictícios). Cria, para um aluno da 9.ª classe do seed, o percurso completo do I Ciclo:
// 7.ª em 2024/2025 e 8.ª em 2025/2026 (com notas nos três trimestres), além da 9.ª actual.
// Também preenche os dados pessoais pedidos pelo certificado.

/** @param {{ um: Function, todos: Function }} ctx consultas que devolvem a primeira linha / todas as linhas */
export async function criarHistoricoICiclo(ctx, nomeAluno, notaBase = 12) {
  const a = await ctx.um(`SELECT a.id, a.escola_id, m.turma_id FROM alunos a JOIN matriculas m ON m.aluno_id = a.id WHERE a.nome = $1`, [nomeAluno]);
  const t9 = await ctx.um('SELECT * FROM turmas WHERE id = $1', [a.turma_id]);
  const plano9 = await ctx.todos(`SELECT pd.* FROM planos_curriculares p JOIN plano_disciplinas pd ON pd.plano_id = p.id
                                  WHERE p.classe_id = $1`, [t9.classe_id]);
  const lancador = (await ctx.um(`SELECT id FROM utilizadores WHERE escola_id = $1 AND perfil = 'secretaria'`, [a.escola_id])).id;

  for (const [codigo, designacao, delta] of [['7', '2024/2025', 0], ['8', '2025/2026', 1]]) {
    const ano = await ctx.um(`INSERT INTO anos_lectivos (escola_id, designacao) VALUES ($1, $2)
                              ON CONFLICT (escola_id, designacao) DO UPDATE SET designacao = EXCLUDED.designacao RETURNING id`,
    [a.escola_id, designacao]);
    let classe = await ctx.um(`SELECT id FROM classes WHERE escola_id = $1 AND codigo = $2`, [a.escola_id, codigo]);
    if (!classe) {
      classe = await ctx.um(`INSERT INTO classes (escola_id, codigo, escala_maxima, nota_minima_aprovacao, minimo_negativa)
                             VALUES ($1, $2, 20, 10, 7) RETURNING id`, [a.escola_id, codigo]);
    }
    let plano = await ctx.um('SELECT id FROM planos_curriculares WHERE classe_id = $1 AND curso_id IS NULL', [classe.id]);
    if (!plano) {
      plano = await ctx.um('INSERT INTO planos_curriculares (escola_id, classe_id) VALUES ($1, $2) RETURNING id', [a.escola_id, classe.id]);
      for (const pd of plano9) {
        await ctx.um('INSERT INTO plano_disciplinas (escola_id, plano_id, disciplina_id, chave) VALUES ($1, $2, $3, $4)',
          [a.escola_id, plano.id, pd.disciplina_id, pd.chave]);
      }
    }
    const turma = await ctx.um(`INSERT INTO turmas (escola_id, ano_lectivo_id, classe_id, nome, turno, capacidade)
                                VALUES ($1, $2, $3, 'H', 'tarde', 40)
                                ON CONFLICT DO NOTHING RETURNING id`, [a.escola_id, ano.id, classe.id])
      ?? await ctx.um(`SELECT id FROM turmas WHERE ano_lectivo_id = $1 AND classe_id = $2 AND nome = 'H'`, [ano.id, classe.id]);
    const m = await ctx.um(`INSERT INTO matriculas (escola_id, aluno_id, turma_id, ano_lectivo_id, tipo, estado)
                            VALUES ($1, $2, $3, $4, 'matricula', 'concluida') RETURNING id`, [a.escola_id, a.id, turma.id, ano.id]);
    for (const pd of plano9) {
      for (const t of [1, 2, 3]) {
        const v = notaBase + delta;
        await ctx.um(`INSERT INTO notas (escola_id, matricula_id, disciplina_id, trimestre, mac, npp, npt, lancada_por)
                      VALUES ($1, $2, $3, $4, $5, $5, $5, $6)`, [a.escola_id, m.id, pd.disciplina_id, t, v, lancador]);
      }
    }
  }
  await ctx.um(`UPDATE alunos SET nome_pai = 'Pedro Chissola', nome_mae = 'Rita Chissola', naturalidade = 'Luanda',
                municipio_naturalidade = 'Viana', provincia_naturalidade = 'Luanda', documento_tipo = 'bi',
                documento_numero = '001234567LA041', documento_emissao_local = 'Luanda', documento_emissao_data = '2023-05-10'
                WHERE id = $1`, [a.id]);
  return a.id;
}
