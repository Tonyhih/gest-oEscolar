-- Documentos oficiais em PDF: termo de frequência e aproveitamento e certificados
-- (modelos do MED para o Ensino Primário e o I Ciclo do Ensino Secundário).

-- Dados do aluno pedidos pelos modelos
ALTER TABLE alunos
  ADD COLUMN nome_pai                text,
  ADD COLUMN nome_mae                text,
  ADD COLUMN municipio_naturalidade  text,
  ADD COLUMN provincia_naturalidade  text,
  ADD COLUMN documento_emissao_local text,      -- "passado pelo arquivo de Identificação de …"
  ADD COLUMN documento_emissao_data  date;

-- Decreto executivo de criação da escola (aparece no certificado)
ALTER TABLE escolas ADD COLUMN decreto_criacao text;

-- Documentos numerados emitidos pela escola (nunca se apagam)
CREATE TABLE documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL REFERENCES escolas (id),
  tipo            text NOT NULL CHECK (tipo IN ('certificado')),
  ciclo           text NOT NULL CHECK (ciclo IN ('primario', 'i_ciclo')),
  numero          integer,                       -- NULL nos rascunhos
  ano             smallint NOT NULL,
  aluno_id        uuid NOT NULL,
  rascunho        boolean NOT NULL DEFAULT false,
  dados           jsonb NOT NULL,                -- tudo o que foi impresso, para reimprimir igual
  emitido_por     uuid NOT NULL,
  emitido_em      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (escola_id, aluno_id)    REFERENCES alunos (escola_id, id),
  FOREIGN KEY (escola_id, emitido_por) REFERENCES utilizadores (escola_id, id),
  CHECK (rascunho = (numero IS NULL))
);
-- Numeração seguida por escola, tipo e ano: Nº 1/2026, 2/2026…
CREATE UNIQUE INDEX documentos_numero_unico ON documentos (escola_id, tipo, ano, numero) WHERE numero IS NOT NULL;
CREATE INDEX documentos_aluno ON documentos (aluno_id);

CREATE TRIGGER documentos_so_insercao
  BEFORE UPDATE OR DELETE ON documentos
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
