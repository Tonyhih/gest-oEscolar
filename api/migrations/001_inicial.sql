-- =====================================================================
-- Sistema de Gestão Escolar (Angola) – esquema inicial
-- PostgreSQL 16
--
-- Convenções:
--   * Chaves primárias UUID (gen_random_uuid()).
--   * Todas as tabelas de uma escola têm escola_id e UNIQUE (escola_id, id).
--     As chaves estrangeiras levam (escola_id, x_id): a própria base de dados
--     impede ligar um registo da Escola A a um registo da Escola B (RNF01).
--   * Os dados académicos não se apagam: usam estado (RNF04).
--   * Os valores de domínio usam CHECK em vez de ENUM (mais fáceis de alterar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Função genérica: actualiza actualizado_em em cada UPDATE
-- ---------------------------------------------------------------------
CREATE FUNCTION definir_actualizado_em() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- M1. Plataforma e escolas
-- =====================================================================
CREATE TABLE escolas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text NOT NULL UNIQUE,
  nome            text NOT NULL,
  provincia       text NOT NULL,
  municipio       text NOT NULL,
  natureza        text NOT NULL CHECK (natureza IN ('publica', 'privada', 'comparticipada')),
  ciclos          text[] NOT NULL DEFAULT '{}'
                  CHECK (ciclos <@ ARRAY['primario', 'i_ciclo', 'ii_ciclo_geral', 'ii_ciclo_tecnico']),
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- M2. Utilizadores
-- =====================================================================
CREATE TABLE utilizadores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id             uuid REFERENCES escolas (id),
  nome                  text NOT NULL,
  email                 text NOT NULL,
  palavra_passe_hash    text NOT NULL,
  perfil                text NOT NULL
                        CHECK (perfil IN ('admin_plataforma', 'director', 'secretaria', 'coordenador', 'professor')),
  trocar_palavra_passe  boolean NOT NULL DEFAULT true,
  estado                text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  actualizado_em        timestamptz NOT NULL DEFAULT now(),
  -- Só o administrador da plataforma não pertence a uma escola
  CONSTRAINT utilizador_escola_conforme_perfil
    CHECK ((perfil = 'admin_plataforma') = (escola_id IS NULL)),
  UNIQUE (escola_id, id)
);
-- O login é só por email, por isso o email é único em toda a plataforma
CREATE UNIQUE INDEX utilizadores_email_unico ON utilizadores (lower(email));

-- =====================================================================
-- M3. Estrutura de ensino e ano lectivo
-- =====================================================================
CREATE TABLE anos_lectivos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL REFERENCES escolas (id),
  designacao      text NOT NULL CHECK (designacao ~ '^\d{4}/\d{4}$'),
  activo          boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, designacao),
  UNIQUE (escola_id, id)
);
-- Só um ano lectivo activo por escola (RF10)
CREATE UNIQUE INDEX anos_lectivos_um_activo ON anos_lectivos (escola_id) WHERE activo;

CREATE TABLE trimestres (
  escola_id       uuid NOT NULL,
  ano_lectivo_id  uuid NOT NULL,
  numero          smallint NOT NULL CHECK (numero BETWEEN 1 AND 3),
  inicio          date NOT NULL,
  fim             date NOT NULL,
  aberto          boolean NOT NULL DEFAULT false,   -- permite lançar notas
  PRIMARY KEY (ano_lectivo_id, numero),
  FOREIGN KEY (escola_id, ano_lectivo_id) REFERENCES anos_lectivos (escola_id, id),
  CHECK (fim > inicio)
);

-- Catálogo nacional: igual para todas as escolas
CREATE TABLE classes_catalogo (
  codigo      text PRIMARY KEY,
  designacao  text NOT NULL,
  ciclo       text NOT NULL CHECK (ciclo IN ('primario', 'i_ciclo', 'ii_ciclo')),
  ordem       smallint NOT NULL UNIQUE
);

INSERT INTO classes_catalogo (codigo, designacao, ciclo, ordem) VALUES
  ('INI', 'Iniciação',    'primario', 0),
  ('1',   '1.ª classe',   'primario', 1),
  ('2',   '2.ª classe',   'primario', 2),
  ('3',   '3.ª classe',   'primario', 3),
  ('4',   '4.ª classe',   'primario', 4),
  ('5',   '5.ª classe',   'primario', 5),
  ('6',   '6.ª classe',   'primario', 6),
  ('7',   '7.ª classe',   'i_ciclo',  7),
  ('8',   '8.ª classe',   'i_ciclo',  8),
  ('9',   '9.ª classe',   'i_ciclo',  9),
  ('10',  '10.ª classe',  'ii_ciclo', 10),
  ('11',  '11.ª classe',  'ii_ciclo', 11),
  ('12',  '12.ª classe',  'ii_ciclo', 12),
  ('13',  '13.ª classe',  'ii_ciclo', 13);

-- Classes oferecidas por cada escola, com a configuração de avaliação (RF11, RF14)
CREATE TABLE classes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id               uuid NOT NULL REFERENCES escolas (id),
  codigo                  text NOT NULL REFERENCES classes_catalogo (codigo),
  ramo                    text NOT NULL DEFAULT 'geral' CHECK (ramo IN ('geral', 'tecnico_profissional')),
  escala_maxima           smallint NOT NULL CHECK (escala_maxima IN (10, 20)),
  nota_minima_aprovacao   numeric(4,2) NOT NULL,
  classe_de_exame         boolean NOT NULL DEFAULT false,
  avaliacao_qualitativa   boolean NOT NULL DEFAULT false,
  apenas_estagio          boolean NOT NULL DEFAULT false,
  max_negativas           smallint NOT NULL DEFAULT 2 CHECK (max_negativas >= 0),
  minimo_negativa         numeric(4,2) NOT NULL,
  estado                  text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  criado_em               timestamptz NOT NULL DEFAULT now(),
  actualizado_em          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, codigo, ramo),
  UNIQUE (escola_id, id),
  -- RN11: a 13.ª só existe no técnico-profissional e é só de estágio
  CONSTRAINT classe_13_tecnica CHECK (codigo <> '13' OR (ramo = 'tecnico_profissional' AND apenas_estagio)),
  CONSTRAINT classe_aprovacao_na_escala CHECK (nota_minima_aprovacao <= escala_maxima),
  CONSTRAINT classe_minimo_negativa CHECK (minimo_negativa < nota_minima_aprovacao),
  CONSTRAINT classe_um_modo CHECK (
    (classe_de_exame::int + avaliacao_qualitativa::int + apenas_estagio::int) <= 1
  )
);

CREATE TABLE cursos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL REFERENCES escolas (id),
  nome            text NOT NULL,
  sigla           text NOT NULL,
  ramo            text NOT NULL CHECK (ramo IN ('geral', 'tecnico_profissional')),
  coordenador_id  uuid,
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, sigla),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, coordenador_id) REFERENCES utilizadores (escola_id, id)
);

CREATE TABLE disciplinas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL REFERENCES escolas (id),
  nome            text NOT NULL,
  sigla           text NOT NULL,
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, sigla),
  UNIQUE (escola_id, id)
);

CREATE TABLE planos_curriculares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL REFERENCES escolas (id),
  classe_id       uuid NOT NULL,
  curso_id        uuid,                               -- NULL no Primário e no I Ciclo
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (escola_id, classe_id, curso_id),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, classe_id) REFERENCES classes (escola_id, id),
  FOREIGN KEY (escola_id, curso_id)  REFERENCES cursos (escola_id, id)
);

CREATE TABLE plano_disciplinas (
  escola_id               uuid NOT NULL,
  plano_id                uuid NOT NULL,
  disciplina_id           uuid NOT NULL,
  carga_horaria_semanal   smallint CHECK (carga_horaria_semanal > 0),
  chave                   boolean NOT NULL DEFAULT false,   -- disciplina-chave (nuclear)
  PRIMARY KEY (plano_id, disciplina_id),
  FOREIGN KEY (escola_id, plano_id)      REFERENCES planos_curriculares (escola_id, id) ON DELETE CASCADE,
  FOREIGN KEY (escola_id, disciplina_id) REFERENCES disciplinas (escola_id, id)
);

-- =====================================================================
-- M4. Pessoas
-- =====================================================================
CREATE TABLE encarregados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL REFERENCES escolas (id),
  nome            text NOT NULL,
  telefone        text NOT NULL,
  email           text,
  documento       text,
  profissao       text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, id)
);

CREATE TABLE alunos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id         uuid NOT NULL REFERENCES escolas (id),
  numero_processo   text NOT NULL,
  nome              text NOT NULL,
  data_nascimento   date NOT NULL CHECK (data_nascimento > DATE '1940-01-01'),
  sexo              char(1) NOT NULL CHECK (sexo IN ('M', 'F')),
  documento_tipo    text CHECK (documento_tipo IN ('bi', 'cedula', 'passaporte')),
  documento_numero  text,
  naturalidade      text,
  morada            text,
  telefone          text,
  estado            text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  actualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, numero_processo),     -- RF15
  UNIQUE (escola_id, id),
  CHECK ((documento_tipo IS NULL) = (documento_numero IS NULL))
);
CREATE INDEX alunos_pesquisa_nome ON alunos (escola_id, lower(nome));

CREATE TABLE aluno_encarregados (
  escola_id       uuid NOT NULL,
  aluno_id        uuid NOT NULL,
  encarregado_id  uuid NOT NULL,
  parentesco      text NOT NULL,
  principal       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (aluno_id, encarregado_id),
  FOREIGN KEY (escola_id, aluno_id)       REFERENCES alunos (escola_id, id),
  FOREIGN KEY (escola_id, encarregado_id) REFERENCES encarregados (escola_id, id)
);
-- No máximo um encarregado principal por aluno
CREATE UNIQUE INDEX aluno_um_encarregado_principal ON aluno_encarregados (aluno_id) WHERE principal;

CREATE TABLE professores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL REFERENCES escolas (id),
  utilizador_id   uuid NOT NULL UNIQUE,
  numero_agente   text,
  habilitacoes    text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, utilizador_id) REFERENCES utilizadores (escola_id, id)
);

CREATE TABLE professor_disciplinas (
  escola_id      uuid NOT NULL,
  professor_id   uuid NOT NULL,
  disciplina_id  uuid NOT NULL,
  PRIMARY KEY (professor_id, disciplina_id),
  FOREIGN KEY (escola_id, professor_id)  REFERENCES professores (escola_id, id),
  FOREIGN KEY (escola_id, disciplina_id) REFERENCES disciplinas (escola_id, id)
);

-- =====================================================================
-- M5. Turmas e matrículas
-- =====================================================================
CREATE TABLE turmas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id           uuid NOT NULL REFERENCES escolas (id),
  ano_lectivo_id      uuid NOT NULL,
  classe_id           uuid NOT NULL,
  curso_id            uuid,
  nome                text NOT NULL,
  turno               text NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  sala                text,
  capacidade          smallint NOT NULL CHECK (capacidade BETWEEN 1 AND 80),
  director_turma_id   uuid,
  estado              text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  actualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (ano_lectivo_id, classe_id, curso_id, nome, turno),
  UNIQUE (escola_id, id),
  UNIQUE (escola_id, id, ano_lectivo_id),
  FOREIGN KEY (escola_id, ano_lectivo_id)    REFERENCES anos_lectivos (escola_id, id),
  FOREIGN KEY (escola_id, classe_id)         REFERENCES classes (escola_id, id),
  FOREIGN KEY (escola_id, curso_id)          REFERENCES cursos (escola_id, id),
  FOREIGN KEY (escola_id, director_turma_id) REFERENCES professores (escola_id, id)
);
CREATE INDEX turmas_director ON turmas (director_turma_id);

-- Um só professor por disciplina e turma (RF20)
CREATE TABLE atribuicoes (
  escola_id      uuid NOT NULL,
  turma_id       uuid NOT NULL,
  disciplina_id  uuid NOT NULL,
  professor_id   uuid NOT NULL,
  PRIMARY KEY (turma_id, disciplina_id),
  FOREIGN KEY (escola_id, turma_id)      REFERENCES turmas (escola_id, id),
  FOREIGN KEY (escola_id, disciplina_id) REFERENCES disciplinas (escola_id, id),
  FOREIGN KEY (escola_id, professor_id)  REFERENCES professores (escola_id, id)
);
CREATE INDEX atribuicoes_professor ON atribuicoes (professor_id);

-- Trimestres já publicados em cada turma (RF30)
CREATE TABLE publicacoes (
  escola_id       uuid NOT NULL,
  turma_id        uuid NOT NULL,
  trimestre       smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  publicado_por   uuid NOT NULL,
  publicado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (turma_id, trimestre),
  FOREIGN KEY (escola_id, turma_id)      REFERENCES turmas (escola_id, id),
  FOREIGN KEY (escola_id, publicado_por) REFERENCES utilizadores (escola_id, id)
);

CREATE TABLE matriculas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id               uuid NOT NULL REFERENCES escolas (id),
  aluno_id                uuid NOT NULL,
  turma_id                uuid NOT NULL,
  ano_lectivo_id          uuid NOT NULL,
  tipo                    text NOT NULL CHECK (tipo IN ('matricula', 'confirmacao')),
  estado                  text NOT NULL DEFAULT 'activa'
                          CHECK (estado IN ('activa', 'anulada', 'transferida', 'concluida')),
  matricula_anterior_id   uuid REFERENCES matriculas (id),
  criado_em               timestamptz NOT NULL DEFAULT now(),
  actualizado_em          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, aluno_id) REFERENCES alunos (escola_id, id),
  -- A turma tem de ser da mesma escola E do mesmo ano lectivo da matrícula
  FOREIGN KEY (escola_id, turma_id, ano_lectivo_id) REFERENCES turmas (escola_id, id, ano_lectivo_id),
  CHECK (tipo = 'matricula' OR matricula_anterior_id IS NOT NULL)
);
-- RN06: uma matrícula activa por aluno e ano lectivo
CREATE UNIQUE INDEX matriculas_uma_activa ON matriculas (aluno_id, ano_lectivo_id) WHERE estado = 'activa';
CREATE INDEX matriculas_turma ON matriculas (turma_id) WHERE estado = 'activa';

CREATE TABLE matricula_historico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL,
  matricula_id    uuid NOT NULL,
  accao           text NOT NULL CHECK (accao IN ('criar', 'confirmar', 'mudar_turma', 'anular', 'concluir')),
  turma_anterior  uuid,
  motivo          text,
  utilizador_id   uuid NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (escola_id, matricula_id)  REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_id, utilizador_id) REFERENCES utilizadores (escola_id, id),
  -- coalesce: num CHECK, NULL conta como verdadeiro; sem ele, um motivo NULL passaria
  CHECK (accao NOT IN ('mudar_turma', 'anular') OR coalesce(length(motivo), 0) >= 3)
);

-- =====================================================================
-- M6. Avaliação
-- =====================================================================
CREATE TABLE notas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL,
  matricula_id    uuid NOT NULL,
  disciplina_id   uuid NOT NULL,
  trimestre       smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  mac             numeric(4,2) CHECK (mac BETWEEN 0 AND 20),
  npp             numeric(4,2) CHECK (npp BETWEEN 0 AND 20),
  npt             numeric(4,2) CHECK (npt BETWEEN 0 AND 20),
  -- RF25: MT calculada pela base de dados, sem arredondar (NULL se faltar alguma nota)
  mt              numeric GENERATED ALWAYS AS ((mac + npp + npt) / 3) STORED,
  lancada_por     uuid NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matricula_id, disciplina_id, trimestre),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, matricula_id)  REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_id, disciplina_id) REFERENCES disciplinas (escola_id, id),
  FOREIGN KEY (escola_id, lancada_por)   REFERENCES utilizadores (escola_id, id)
);

CREATE TABLE exames (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL,
  matricula_id    uuid NOT NULL,
  disciplina_id   uuid NOT NULL,
  nota            numeric(4,2) NOT NULL CHECK (nota BETWEEN 0 AND 20),
  lancada_por     uuid NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matricula_id, disciplina_id),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, matricula_id)  REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_id, disciplina_id) REFERENCES disciplinas (escola_id, id),
  FOREIGN KEY (escola_id, lancada_por)   REFERENCES utilizadores (escola_id, id)
);

-- RF33: Iniciação
CREATE TABLE avaliacoes_descritivas (
  escola_id       uuid NOT NULL,
  matricula_id    uuid NOT NULL,
  trimestre       smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  texto           text NOT NULL CHECK (length(texto) BETWEEN 1 AND 2000),
  autor_id        uuid NOT NULL,
  actualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (matricula_id, trimestre),
  FOREIGN KEY (escola_id, matricula_id) REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_id, autor_id)     REFERENCES utilizadores (escola_id, id)
);

-- =====================================================================
-- M7. Assiduidade
-- =====================================================================
CREATE TABLE faltas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id         uuid NOT NULL,
  matricula_id      uuid NOT NULL,
  disciplina_id     uuid NOT NULL,
  data              date NOT NULL,
  trimestre         smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  estado            text NOT NULL DEFAULT 'injustificada' CHECK (estado IN ('injustificada', 'justificada')),
  motivo            text,
  registada_por     uuid NOT NULL,
  justificada_por   uuid,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  actualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matricula_id, disciplina_id, data),     -- RF35: sem faltas repetidas
  FOREIGN KEY (escola_id, matricula_id)    REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_id, disciplina_id)   REFERENCES disciplinas (escola_id, id),
  FOREIGN KEY (escola_id, registada_por)   REFERENCES utilizadores (escola_id, id),
  FOREIGN KEY (escola_id, justificada_por) REFERENCES utilizadores (escola_id, id),
  -- RF36: uma falta justificada tem sempre motivo e autor
  CHECK (estado = 'injustificada' OR (coalesce(length(motivo), 0) >= 3 AND justificada_por IS NOT NULL))
);
CREATE INDEX faltas_matricula_trimestre ON faltas (matricula_id, trimestre);

-- =====================================================================
-- M9. Estágio e TFC (13.ª classe)
-- =====================================================================
CREATE TABLE estagios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id             uuid NOT NULL,
  matricula_id          uuid NOT NULL UNIQUE,
  entidade              text NOT NULL,
  orientador_entidade   text,
  orientador_escola_id  uuid,
  inicio                date NOT NULL,
  fim                   date,
  estado                text NOT NULL DEFAULT 'a_decorrer' CHECK (estado IN ('a_decorrer', 'concluido')),
  nota                  numeric(4,2) CHECK (nota BETWEEN 0 AND 20),
  tfc_tema              text,
  tfc_orientador_id     uuid,
  tfc_data_defesa       date,
  tfc_juri              text[],
  tfc_nota              numeric(4,2) CHECK (tfc_nota BETWEEN 0 AND 20),
  -- RF43: o curso fica concluído com o estágio e o TFC aprovados
  curso_concluido       boolean GENERATED ALWAYS AS (coalesce(nota >= 10 AND tfc_nota >= 10, false)) STORED,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  actualizado_em        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (escola_id, matricula_id)         REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_id, orientador_escola_id) REFERENCES professores (escola_id, id),
  FOREIGN KEY (escola_id, tfc_orientador_id)    REFERENCES professores (escola_id, id),
  CHECK (fim IS NULL OR fim >= inicio),
  CHECK (tfc_nota IS NULL OR tfc_data_defesa IS NOT NULL)
);

-- =====================================================================
-- M8. Auditoria (só se acrescenta; nunca se altera nem apaga)
-- =====================================================================
CREATE TABLE auditoria (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  escola_id       uuid REFERENCES escolas (id),          -- NULL nas acções da plataforma
  utilizador_id   uuid NOT NULL REFERENCES utilizadores (id),
  entidade        text NOT NULL,
  entidade_id     uuid,
  accao           text NOT NULL,
  antes           jsonb,
  depois          jsonb,
  justificacao    text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_escola_data ON auditoria (escola_id, criado_em DESC);
CREATE INDEX auditoria_entidade ON auditoria (entidade, entidade_id);

CREATE FUNCTION impedir_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A tabela % só aceita inserções.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_so_insercao
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();

-- RNF04: notas, exames, matrículas e faltas não se apagam
CREATE TRIGGER notas_sem_delete       BEFORE DELETE ON notas       FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER exames_sem_delete      BEFORE DELETE ON exames      FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER matriculas_sem_delete  BEFORE DELETE ON matriculas  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER faltas_sem_delete      BEFORE DELETE ON faltas      FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();

-- actualizado_em automático
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['escolas', 'utilizadores', 'anos_lectivos', 'classes', 'cursos', 'disciplinas',
                           'planos_curriculares', 'encarregados', 'alunos', 'professores', 'turmas',
                           'matriculas', 'notas', 'exames', 'avaliacoes_descritivas', 'faltas', 'estagios']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_actualizado_em BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION definir_actualizado_em()', t, t);
  END LOOP;
END;
$$;

-- =====================================================================
-- Vista: resultado final por aluno e disciplina (RF26, RF28)
--
-- MFD = média das 3 MT = soma(MAC + NPP + NPT) / 9 (uma só divisão, sem erros de arredondamento)
-- CF  = MFD × 0,4 + exame × 0,6 = (0,4 × soma + 5,4 × exame) / 9
-- Só a nota final é arredondada à unidade; round() em numeric arredonda 9,5 para 10.
-- =====================================================================
CREATE VIEW v_resultados_disciplina AS
WITH somas AS (
  SELECT n.escola_id, n.matricula_id, n.disciplina_id,
         count(n.mt)                       AS trimestres_completos,
         sum(n.mac + n.npp + n.npt)        AS soma
  FROM notas n
  GROUP BY n.escola_id, n.matricula_id, n.disciplina_id
)
SELECT s.escola_id,
       s.matricula_id,
       s.disciplina_id,
       m.turma_id,
       s.trimestres_completos,
       CASE WHEN s.trimestres_completos = 3 THEN s.soma / 9 END                      AS mfd,
       e.nota                                                                         AS exame,
       CASE WHEN s.trimestres_completos = 3 AND c.classe_de_exame AND e.nota IS NOT NULL
            THEN (0.4 * s.soma + 5.4 * e.nota) / 9 END                                AS cf,
       CASE
         WHEN s.trimestres_completos < 3 THEN NULL
         WHEN c.classe_de_exame THEN round((0.4 * s.soma + 5.4 * e.nota) / 9)        -- NULL até haver exame
         ELSE round(s.soma / 9)
       END::smallint                                                                  AS nota_final,
       c.nota_minima_aprovacao,
       c.classe_de_exame,
       coalesce(pd.chave, false)                                                      AS chave
FROM somas s
JOIN matriculas m              ON m.id = s.matricula_id
JOIN turmas t                  ON t.id = m.turma_id
JOIN classes c                 ON c.id = t.classe_id
LEFT JOIN exames e             ON e.matricula_id = s.matricula_id AND e.disciplina_id = s.disciplina_id
LEFT JOIN planos_curriculares p ON p.classe_id = t.classe_id AND p.curso_id IS NOT DISTINCT FROM t.curso_id
LEFT JOIN plano_disciplinas pd  ON pd.plano_id = p.id AND pd.disciplina_id = s.disciplina_id;
