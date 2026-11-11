-- Horários: tempos lectivos por turno e aulas semanais de cada turma.

-- Tempos lectivos de cada turno, por escola (1.º tempo, 2.º tempo…)
CREATE TABLE tempos (
  escola_id  uuid NOT NULL REFERENCES escolas (id),
  turno      text NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  numero     smallint NOT NULL CHECK (numero BETWEEN 1 AND 10),
  inicio     time NOT NULL,
  fim        time NOT NULL,
  PRIMARY KEY (escola_id, turno, numero),
  CHECK (fim > inicio)
);

-- Para as aulas guardarem o turno e o ano lectivo da turma de forma consistente
ALTER TABLE turmas ADD CONSTRAINT turmas_id_turno_ano UNIQUE (id, turno, ano_lectivo_id);

CREATE TABLE aulas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid NOT NULL,
  turma_id        uuid NOT NULL,
  ano_lectivo_id  uuid NOT NULL,
  turno           text NOT NULL,
  dia             smallint NOT NULL CHECK (dia BETWEEN 1 AND 6),   -- 1 = segunda … 6 = sábado
  tempo           smallint NOT NULL,
  disciplina_id   uuid NOT NULL,
  professor_id    uuid NOT NULL,
  sala            text,
  UNIQUE (turma_id, dia, tempo),
  FOREIGN KEY (escola_id, turma_id)      REFERENCES turmas (escola_id, id),
  FOREIGN KEY (turma_id, turno, ano_lectivo_id) REFERENCES turmas (id, turno, ano_lectivo_id) ON UPDATE CASCADE,
  FOREIGN KEY (escola_id, disciplina_id) REFERENCES disciplinas (escola_id, id),
  FOREIGN KEY (escola_id, professor_id)  REFERENCES professores (escola_id, id),
  FOREIGN KEY (escola_id, turno, tempo)  REFERENCES tempos (escola_id, turno, numero)
);
-- Um professor não pode estar em duas turmas ao mesmo tempo
CREATE UNIQUE INDEX aulas_professor_sem_conflito ON aulas (professor_id, ano_lectivo_id, turno, dia, tempo);
-- Uma sala não pode ter duas turmas ao mesmo tempo
CREATE UNIQUE INDEX aulas_sala_sem_conflito ON aulas (escola_id, ano_lectivo_id, turno, dia, tempo, lower(sala)) WHERE sala IS NOT NULL;
CREATE INDEX aulas_turma ON aulas (turma_id);
