-- Histórico escolar: notas finais de classes feitas antes de a escola usar o sistema
-- (ou noutra escola). Usado nos certificados quando a classe não está registada no sistema.
CREATE TABLE historico_escolar (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid NOT NULL,
  aluno_id         uuid NOT NULL,
  classe_codigo    text NOT NULL REFERENCES classes_catalogo (codigo),
  ano_lectivo      text NOT NULL CHECK (ano_lectivo ~ '^\d{4}/\d{4}$'),
  escola_origem    text,                       -- NULL = esta escola
  disciplina_id    uuid NOT NULL,
  nota_final       smallint NOT NULL CHECK (nota_final BETWEEN 0 AND 20),
  lancado_por      uuid NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  actualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, classe_codigo, disciplina_id),
  FOREIGN KEY (escola_id, aluno_id)      REFERENCES alunos (escola_id, id),
  FOREIGN KEY (escola_id, disciplina_id) REFERENCES disciplinas (escola_id, id),
  FOREIGN KEY (escola_id, lancado_por)   REFERENCES utilizadores (escola_id, id),
  -- A Iniciação não tem notas e a 13.ª é de estágio
  CHECK (classe_codigo NOT IN ('INI', '13'))
);
CREATE INDEX historico_aluno ON historico_escolar (aluno_id, classe_codigo);

CREATE TRIGGER historico_escolar_actualizado_em BEFORE UPDATE ON historico_escolar
  FOR EACH ROW EXECUTE FUNCTION definir_actualizado_em();
