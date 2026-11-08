import bcrypt from 'bcrypt';

/**
 * Dados de teste FICTÍCIOS: 2 escolas, utilizadores, estrutura de ensino, turmas, alunos e notas.
 * Os alunos têm "perfis" de notas escolhidos para exercitar cada regra de avaliação (RN01–RN18).
 *
 * @param {{ query: Function }} cliente  pg.Client ou PGlite, já dentro de uma transacção
 * @param {{ palavraPasse: string }} opcoes palavra-passe comum a todos os utilizadores de teste
 */
export async function semear(cliente, { palavraPasse }) {
  const { rows } = await cliente.query('SELECT count(*)::int AS n FROM escolas');
  if (rows[0].n > 0) throw new Error('A base de dados já tem escolas. O seed só corre numa base vazia.');

  const hash = await bcrypt.hash(palavraPasse, 12);

  // INSERT genérico que devolve a linha criada
  const inserir = async (tabela, dados) => {
    const colunas = Object.keys(dados);
    const valores = Object.values(dados);
    const sql = `INSERT INTO ${tabela} (${colunas.join(', ')})
                 VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
    return (await cliente.query(sql, valores)).rows[0];
  };

  const utilizador = (escola, nome, email, perfil) =>
    inserir('utilizadores', {
      escola_id: escola?.id ?? null, nome, email, perfil,
      palavra_passe_hash: hash, trocar_palavra_passe: false,
    });

  const admin = await utilizador(null, 'Administração da Plataforma', 'admin@plataforma.test', 'admin_plataforma');

  // ---------------------------------------------------------------- Escola A
  const escolaA = await inserir('escolas', {
    codigo: 'LDA-101', nome: 'Complexo Escolar Fictício n.º 101', provincia: 'Luanda', municipio: 'Viana',
    natureza: 'publica', ciclos: ['primario', 'i_ciclo'],
  });
  const escolaB = await inserir('escolas', {
    codigo: 'HBO-201', nome: 'Instituto Médio Técnico Fictício do Huambo', provincia: 'Huambo', municipio: 'Huambo',
    natureza: 'publica', ciclos: ['ii_ciclo_tecnico'],
  });

  const resumo = { admin: admin.email, escolas: [] };

  for (const config of [configEscolaA(escolaA), configEscolaB(escolaB)]) {
    const { escola } = config;
    const director   = await utilizador(escola, config.director.nome, config.director.email, 'director');
    const secretaria = await utilizador(escola, config.secretaria.nome, config.secretaria.email, 'secretaria');
    const coordenador = config.coordenador
      ? await utilizador(escola, config.coordenador.nome, config.coordenador.email, 'coordenador')
      : null;

    // Ano lectivo activo e trimestres
    const ano = await inserir('anos_lectivos', { escola_id: escola.id, designacao: '2026/2027', activo: true });
    const datas = [['2026-09-01', '2026-12-18'], ['2027-01-04', '2027-04-02'], ['2027-04-12', '2027-07-16']];
    for (const [i, [inicio, fim]] of datas.entries()) {
      await inserir('trimestres', {
        escola_id: escola.id, ano_lectivo_id: ano.id, numero: i + 1, inicio, fim, aberto: i === 0,
      });
    }

    // Disciplinas
    const disc = {};
    for (const [sigla, nome] of config.disciplinas) {
      disc[sigla] = await inserir('disciplinas', { escola_id: escola.id, sigla, nome });
    }

    // Professores
    const prof = {};
    for (const p of config.professores) {
      const u = await utilizador(escola, p.nome, p.email, 'professor');
      prof[p.chave] = await inserir('professores', { escola_id: escola.id, utilizador_id: u.id, numero_agente: p.agente });
      prof[p.chave].utilizador_id = u.id;
      for (const s of p.disciplinas) {
        await inserir('professor_disciplinas', { escola_id: escola.id, professor_id: prof[p.chave].id, disciplina_id: disc[s].id });
      }
    }

    // Curso (II Ciclo)
    const curso = config.curso
      ? await inserir('cursos', { escola_id: escola.id, ...config.curso, coordenador_id: coordenador?.id })
      : null;

    let numeroAluno = 0;
    const resumoEscola = {
      escola: escola.nome,
      utilizadores: [director.email, secretaria.email, coordenador?.email, ...config.professores.map((p) => p.email)].filter(Boolean),
      turmas: [],
    };

    for (const t of config.turmas) {
      const classe = await inserir('classes', { escola_id: escola.id, ...t.classe });

      // Plano curricular (as disciplinas marcadas com * são disciplinas-chave)
      if (t.plano) {
        const plano = await inserir('planos_curriculares', {
          escola_id: escola.id, classe_id: classe.id, curso_id: t.comCurso ? curso.id : null,
        });
        for (const item of t.plano) {
          const chave = item.endsWith('*');
          const sigla = item.replace('*', '');
          await inserir('plano_disciplinas', {
            escola_id: escola.id, plano_id: plano.id, disciplina_id: disc[sigla].id, carga_horaria_semanal: 4, chave,
          });
        }
      }

      const turma = await inserir('turmas', {
        escola_id: escola.id, ano_lectivo_id: ano.id, classe_id: classe.id, curso_id: t.comCurso ? curso.id : null,
        nome: t.nome, turno: t.turno, sala: t.sala, capacidade: 40, director_turma_id: prof[t.director].id,
      });

      const siglas = (t.plano ?? []).map((s) => s.replace('*', ''));
      for (const sigla of siglas) {
        await inserir('atribuicoes', {
          escola_id: escola.id, turma_id: turma.id, disciplina_id: disc[sigla].id, professor_id: prof[t.atribuicoes[sigla]].id,
        });
      }

      const resumoTurma = { turma: `${classe.codigo === 'INI' ? 'Iniciação' : classe.codigo + '.ª'} ${t.nome}`, alunos: [] };

      for (const a of t.alunos) {
        numeroAluno += 1;
        const aluno = await inserir('alunos', {
          escola_id: escola.id,
          numero_processo: `${escola.codigo}-${String(numeroAluno).padStart(4, '0')}`,
          nome: a.nome, sexo: a.sexo, data_nascimento: a.nascimento, naturalidade: escola.provincia,
        });
        const ee = await inserir('encarregados', {
          escola_id: escola.id, nome: a.encarregado, telefone: `+244 9${String(20000000 + numeroAluno * 7919).slice(0, 8)}`,
        });
        await inserir('aluno_encarregados', {
          escola_id: escola.id, aluno_id: aluno.id, encarregado_id: ee.id, parentesco: 'Encarregado(a)', principal: true,
        });
        const matricula = await inserir('matriculas', {
          escola_id: escola.id, aluno_id: aluno.id, turma_id: turma.id, ano_lectivo_id: ano.id, tipo: 'matricula',
        });
        await inserir('matricula_historico', {
          escola_id: escola.id, matricula_id: matricula.id, accao: 'criar', utilizador_id: secretaria.id,
        });

        // Notas trimestrais: a.notas = { SIGLA: [[mac, npp, npt] x3] | valorConstante }
        for (const [sigla, valor] of Object.entries(a.notas ?? {})) {
          const trimestres = Array.isArray(valor) ? valor : [[valor, valor, valor], [valor, valor, valor], [valor, valor, valor]];
          for (const [i, [mac, npp, npt]] of trimestres.entries()) {
            await inserir('notas', {
              escola_id: escola.id, matricula_id: matricula.id, disciplina_id: disc[sigla].id, trimestre: i + 1,
              mac, npp, npt, lancada_por: prof[t.atribuicoes[sigla]].utilizador_id,
            });
          }
        }
        for (const [sigla, nota] of Object.entries(a.exames ?? {})) {
          await inserir('exames', {
            escola_id: escola.id, matricula_id: matricula.id, disciplina_id: disc[sigla].id, nota,
            lancada_por: secretaria.id,
          });
        }
        if (a.descritiva) {
          await inserir('avaliacoes_descritivas', {
            escola_id: escola.id, matricula_id: matricula.id, trimestre: 1, texto: a.descritiva,
            autor_id: prof[t.director].utilizador_id,
          });
        }
        for (const f of a.faltas ?? []) {
          await inserir('faltas', {
            escola_id: escola.id, matricula_id: matricula.id, disciplina_id: disc[f.disciplina].id, data: f.data,
            trimestre: 1, registada_por: prof[t.atribuicoes[f.disciplina]].utilizador_id,
            ...(f.motivo ? { estado: 'justificada', motivo: f.motivo, justificada_por: prof[t.director].utilizador_id } : {}),
          });
        }
        if (a.estagio) {
          await inserir('estagios', {
            escola_id: escola.id, matricula_id: matricula.id, orientador_escola_id: prof[t.director].id, ...a.estagio,
          });
        }
        resumoTurma.alunos.push({ nome: a.nome, caso: a.caso });
      }
      resumoEscola.turmas.push(resumoTurma);
    }
    resumo.escolas.push(resumoEscola);
  }
  return resumo;
}

// ======================================================================
// Configuração das escolas fictícias
// ======================================================================

const escala20 = { escala_maxima: 20, nota_minima_aprovacao: 10, minimo_negativa: 7 };
const escala10 = { escala_maxima: 10, nota_minima_aprovacao: 5, minimo_negativa: 3.5 };

// MT de 9,5 em média: soma = 85,5 → MFD = 9,5 → nota final 10 (RN04)
const NOVE_E_MEIO = [[9, 10, 9], [10, 9, 9.5], [10, 10, 9]];

function configEscolaA(escola) {
  const atrib = { LP: 'lurdes', HIS: 'lurdes', EMC: 'lurdes', GEO: 'lurdes', MAT: 'adao', CN: 'adao', FIS: 'adao' };
  return {
    escola,
    director:   { nome: 'Beatriz Mavinga (fictícia)', email: 'director@lda101.test' },
    secretaria: { nome: 'Carlos Ndumba (fictício)',   email: 'secretaria@lda101.test' },
    disciplinas: [
      ['LP', 'Língua Portuguesa'], ['MAT', 'Matemática'], ['CN', 'Ciências da Natureza'], ['HIS', 'História'],
      ['EMC', 'Educação Moral e Cívica'], ['FIS', 'Física'], ['GEO', 'Geografia'],
    ],
    professores: [
      { chave: 'lurdes', nome: 'Lurdes Cambuta (fictícia)', email: 'lurdes@lda101.test', agente: 'AG-1001', disciplinas: ['LP', 'HIS', 'EMC', 'GEO'] },
      { chave: 'adao',   nome: 'Adão Ngola (fictício)',     email: 'adao@lda101.test',   agente: 'AG-1002', disciplinas: ['MAT', 'CN', 'FIS'] },
    ],
    turmas: [
      {
        nome: 'A', turno: 'manha', sala: 'Sala 1', director: 'lurdes', atribuicoes: atrib,
        classe: { codigo: 'INI', ...escala10, avaliacao_qualitativa: true },
        alunos: [
          { nome: 'Ana Domingos', sexo: 'F', nascimento: '2021-03-10', encarregado: 'Rosa Domingos', caso: 'Iniciação: avaliação descritiva',
            descritiva: 'Reconhece as vogais e participa com entusiasmo nas actividades de grupo.' },
          { nome: 'Bráulio Kiala', sexo: 'M', nascimento: '2021-07-22', encarregado: 'Pedro Kiala', caso: 'Iniciação: avaliação descritiva',
            descritiva: 'Conta até 20 e precisa de apoio na coordenação motora fina.' },
        ],
      },
      {
        nome: 'A', turno: 'manha', sala: 'Sala 6', director: 'lurdes', atribuicoes: atrib,
        classe: { codigo: '6', ...escala10, classe_de_exame: true },
        plano: ['LP*', 'MAT*', 'CN', 'HIS', 'EMC'],
        alunos: alunosExame(10, [
          ['Celeste Tchipa', 'F', '2014-02-03', 'Marta Tchipa'],
          ['Domingos Sapalo', 'M', '2014-05-19', 'José Sapalo'],
          ['Esperança Nzinga', 'F', '2014-09-30', 'Teresa Nzinga'],
          ['Fernando Mbala', 'M', '2014-11-11', 'Luís Mbala'],
        ], ['LP', 'MAT', 'CN', 'HIS', 'EMC']),
      },
      {
        nome: 'A', turno: 'tarde', sala: 'Sala 7', director: 'adao', atribuicoes: atrib,
        classe: { codigo: '7', ...escala20 },
        plano: ['LP*', 'MAT*', 'FIS', 'GEO', 'HIS'],
        alunos: alunosNormais([
          ['Graça Lukeny', 'F', '2013-01-15', 'Joana Lukeny'],
          ['Hélder Cassoma', 'M', '2013-04-02', 'António Cassoma'],
          ['Isabel Ndala', 'F', '2013-06-27', 'Celestina Ndala'],
          ['Joaquim Muteka', 'M', '2013-08-08', 'Francisco Muteka'],
          ['Luzia Kapinga', 'F', '2013-10-21', 'Helena Kapinga'],
        ], ['LP', 'MAT', 'FIS', 'GEO', 'HIS']),
      },
      {
        nome: 'A', turno: 'tarde', sala: 'Sala 9', director: 'adao', atribuicoes: atrib,
        classe: { codigo: '9', ...escala20, classe_de_exame: true },
        plano: ['LP*', 'MAT*', 'FIS', 'GEO', 'HIS'],
        alunos: alunosExame(20, [
          ['Manuel Chissola', 'M', '2011-03-12', 'Rita Chissola'],
          ['Nádia Quissanga', 'F', '2011-05-05', 'Paulo Quissanga'],
          ['Osvaldo Tchinguali', 'M', '2011-07-17', 'Ana Tchinguali'],
          ['Paula Samakuva', 'F', '2011-12-01', 'Jorge Samakuva'],
        ], ['LP', 'MAT', 'FIS', 'GEO', 'HIS']),
      },
    ],
  };
}

function configEscolaB(escola) {
  const atrib = { LP: 'rui', ING: 'rui', EF: 'rui', MAT: 'marta', TIC: 'marta', PROG: 'marta' };
  const plano = ['LP*', 'MAT*', 'PROG*', 'TIC', 'ING', 'EF'];
  const siglas = plano.map((s) => s.replace('*', ''));
  const tecnico = { ramo: 'tecnico_profissional' };
  return {
    escola,
    director:    { nome: 'Domingas Lutucuta (fictícia)', email: 'director@hbo201.test' },
    secretaria:  { nome: 'Evaristo Chilala (fictício)',  email: 'secretaria@hbo201.test' },
    coordenador: { nome: 'Paulo Cachimbombo (fictício)', email: 'coordenador@hbo201.test' },
    curso: { nome: 'Técnico de Informática', sigla: 'TI', ramo: 'tecnico_profissional' },
    disciplinas: [
      ['LP', 'Língua Portuguesa'], ['MAT', 'Matemática'], ['PROG', 'Técnicas e Linguagens de Programação'],
      ['TIC', 'Tecnologias de Informação e Comunicação'], ['ING', 'Inglês'], ['EF', 'Educação Física'],
    ],
    professores: [
      { chave: 'rui',   nome: 'Rui Tchiyevo (fictício)',     email: 'rui@hbo201.test',   agente: 'AG-2001', disciplinas: ['LP', 'ING', 'EF'] },
      { chave: 'marta', nome: 'Marta Kalandula (fictícia)',  email: 'marta@hbo201.test', agente: 'AG-2002', disciplinas: ['MAT', 'TIC', 'PROG'] },
    ],
    turmas: [
      {
        nome: 'A', turno: 'manha', sala: 'Lab 1', director: 'marta', atribuicoes: atrib, comCurso: true,
        classe: { codigo: '10', ...escala20, ...tecnico }, plano,
        alunos: alunosNormais([
          ['Quintino Lussati', 'M', '2010-02-14', 'Alberto Lussati'],
          ['Rosária Ngueve', 'F', '2010-03-30', 'Mariana Ngueve'],
          ['Sebastião Tchissola', 'M', '2010-06-09', 'Laurinda Tchissola'],
          ['Telma Capamba', 'F', '2010-08-25', 'Venâncio Capamba'],
          ['Ulisses Kaculo', 'M', '2010-11-03', 'Eva Kaculo'],
        ], siglas, { chave: 'PROG' }),
      },
      {
        nome: 'A', turno: 'manha', sala: 'Lab 2', director: 'marta', atribuicoes: atrib, comCurso: true,
        classe: { codigo: '12', ...escala20, ...tecnico, classe_de_exame: true }, plano,
        alunos: alunosExame(20, [
          ['Valdemar Huambo', 'M', '2008-01-20', 'Fátima Huambo'],
          ['Wanda Chipenda', 'F', '2008-04-16', 'Gaspar Chipenda'],
          ['Xavier Ndongala', 'M', '2008-07-07', 'Luísa Ndongala'],
          ['Yolanda Kassoma', 'F', '2008-09-29', 'Simão Kassoma'],
        ], siglas),
      },
      {
        nome: 'A', turno: 'manha', sala: 'Lab 3', director: 'marta', atribuicoes: atrib, comCurso: true,
        classe: { codigo: '13', ...escala20, ...tecnico, apenas_estagio: true },
        alunos: [
          { nome: 'Zacarias Mbumba', sexo: 'M', nascimento: '2007-02-11', encarregado: 'Joana Mbumba', caso: 'Estágio e TFC aprovados → curso concluído',
            estagio: { entidade: 'Empresa Fictícia de Sistemas, Lda.', inicio: '2026-09-15', fim: '2027-03-15', estado: 'concluido', nota: 15,
                       tfc_tema: 'Sistema de inventário para uma escola', tfc_data_defesa: '2027-06-20', tfc_juri: ['Júri 1', 'Júri 2'], tfc_nota: 14 } },
          { nome: 'Albertina Sakaita', sexo: 'F', nascimento: '2007-05-24', encarregado: 'Mário Sakaita', caso: 'Estágio a decorrer → curso por concluir',
            estagio: { entidade: 'Empresa Fictícia de Redes, Lda.', inicio: '2026-10-01', estado: 'a_decorrer' } },
        ],
      },
    ],
  };
}

/**
 * Classe normal (escala 0–20), 5+ disciplinas. A 2.ª e a 3.ª siglas são não-chave; MAT é chave.
 * Casos: transita · 2 negativas (9 e 8) transita · negativa de 7 não transita ·
 *        negativa em disciplina-chave não transita · MFD 9,5 arredonda para 10.
 */
function alunosNormais(pessoas, siglas, { chave = 'MAT' } = {}) {
  const naoChave = siglas.filter((s) => !['LP', 'MAT', chave].includes(s));
  const base = (v) => Object.fromEntries(siglas.map((s) => [s, v]));
  const casos = [
    { caso: 'Todas positivas → transita', notas: base(14) },
    { caso: 'Duas negativas (9 e 8) fora das disciplinas-chave → transita', notas: { ...base(12), [naoChave[0]]: 9, [naoChave[1]]: 8 } },
    { caso: 'Uma negativa de 7 → não transita', notas: { ...base(12), [naoChave[0]]: 7 } },
    { caso: `Negativa (9) na disciplina-chave ${chave} → não transita`, notas: { ...base(12), [chave]: 9 } },
    { caso: 'MFD 9,5 arredonda para 10 → transita', notas: { ...base(12), [naoChave[0]]: NOVE_E_MEIO } },
  ];
  return pessoas.map(([nome, sexo, nascimento, encarregado], i) => ({
    nome, sexo, nascimento, encarregado, ...casos[i],
    faltas: i === 0
      ? [{ disciplina: siglas[0], data: '2026-10-05' }, { disciplina: siglas[1], data: '2026-10-06', motivo: 'Doença, com atestado' }]
      : [],
  }));
}

/**
 * Classe de exame. Valores na escala 0–20; na escala 0–10 são divididos por 2.
 * Casos: CF 10,2 → 10 aprovado · uma CF negativa → não transita · MFD 8 + exame 12 → aprovado · sem exame.
 */
function alunosExame(escala, pessoas, siglas) {
  const k = escala === 20 ? 1 : 0.5;
  const todas = (v) => Object.fromEntries(siglas.map((s) => [s, v * k]));
  const casos = [
    { caso: 'MFD 12, exame 9 → CF 10,2 → 10 → aprovado', notas: todas(12), exames: todas(9) },
    { caso: `Uma CF negativa (${siglas.at(-1)}) → não transita (classe de exame)`, notas: { ...todas(12), [siglas.at(-1)]: 10 * k },
      exames: { ...todas(11), [siglas.at(-1)]: 8 * k } },
    { caso: 'MFD 8, exame 12 → CF 10,4 → 10 → aprovado', notas: todas(8), exames: todas(12) },
    { caso: 'Sem nota de exame → nota final por calcular', notas: todas(13) },
  ];
  return pessoas.map(([nome, sexo, nascimento, encarregado], i) => ({ nome, sexo, nascimento, encarregado, ...casos[i] }));
}
