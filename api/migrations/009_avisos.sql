-- Avisos no portal do encarregado e do aluno, e faltas vermelhas (disciplinares).

-- Falta vermelha: o professor marca-a por indisciplina na aula, com a descrição da ocorrência.
-- Não se justifica; só o director a anula, com motivo.
ALTER TABLE faltas ADD COLUMN tipo text NOT NULL DEFAULT 'presenca' CHECK (tipo IN ('presenca', 'disciplinar'));
ALTER TABLE faltas ADD COLUMN ocorrencia text;
ALTER TABLE faltas ADD CONSTRAINT faltas_disciplinar_com_ocorrencia
  CHECK (tipo <> 'disciplinar' OR coalesce(length(ocorrencia), 0) >= 3);
ALTER TABLE faltas ADD CONSTRAINT faltas_disciplinar_nao_justificada
  CHECK (tipo <> 'disciplinar' OR estado <> 'justificada');

-- A partir de quantas faltas injustificadas (numa disciplina, num trimestre) o encarregado é avisado
ALTER TABLE escolas ADD COLUMN limite_aviso_faltas smallint NOT NULL DEFAULT 3 CHECK (limite_aviso_faltas BETWEEN 1 AND 30);

CREATE TABLE avisos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id   uuid NOT NULL,
  aluno_id    uuid NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('notas_publicadas', 'faltas_injustificadas', 'falta_disciplinar', 'propina_atraso', 'recibo')),
  titulo      text NOT NULL,
  mensagem    text NOT NULL,
  chave       text NOT NULL,                  -- evita o mesmo aviso duas vezes (ex.: "propina:<cobrança>")
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, chave),
  FOREIGN KEY (escola_id, aluno_id) REFERENCES alunos (escola_id, id)
);
CREATE INDEX avisos_aluno ON avisos (aluno_id, criado_em DESC);

-- Cada conta (encarregado ou aluno) marca os seus avisos como lidos
CREATE TABLE avisos_lidos (
  aviso_id       uuid NOT NULL REFERENCES avisos (id),
  utilizador_id  uuid NOT NULL REFERENCES utilizadores (id),
  lido_em        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aviso_id, utilizador_id)
);
