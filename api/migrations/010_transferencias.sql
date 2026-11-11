-- Transferência de alunos entre escolas da plataforma.
-- A escola de origem emite a guia (com um código); a escola de destino aceita-a com esse código e escolhe a turma.
-- Só então o aluno é criado no destino (ficha, encarregados, histórico e notas do ano) e a matrícula de origem
-- passa a "transferida". Nada se apaga.

CREATE TABLE transferencias (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9]{8}$'),
  escola_origem_id      uuid NOT NULL,
  aluno_id              uuid NOT NULL,
  matricula_id          uuid NOT NULL,
  escola_destino_id     uuid NOT NULL REFERENCES escolas (id),
  motivo                text NOT NULL CHECK (length(motivo) >= 3),
  dados                 jsonb NOT NULL,          -- ficha, encarregados, histórico e notas no momento da emissão
  estado                text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aceite', 'recusada', 'cancelada')),
  resposta              text,                    -- motivo da recusa ou do cancelamento
  criado_por            uuid NOT NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  decidido_por          uuid REFERENCES utilizadores (id),
  decidido_em           timestamptz,
  aluno_destino_id      uuid,
  matricula_destino_id  uuid,
  FOREIGN KEY (escola_origem_id, aluno_id)            REFERENCES alunos (escola_id, id),
  FOREIGN KEY (escola_origem_id, matricula_id)        REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_origem_id, criado_por)          REFERENCES utilizadores (escola_id, id),
  FOREIGN KEY (escola_destino_id, aluno_destino_id)     REFERENCES alunos (escola_id, id),
  FOREIGN KEY (escola_destino_id, matricula_destino_id) REFERENCES matriculas (escola_id, id),
  CHECK (escola_origem_id <> escola_destino_id),
  CHECK (estado <> 'aceite' OR (aluno_destino_id IS NOT NULL AND matricula_destino_id IS NOT NULL)),
  CHECK (estado NOT IN ('recusada', 'cancelada') OR coalesce(length(resposta), 0) >= 3)
);
-- Uma só guia pendente por matrícula
CREATE UNIQUE INDEX transferencias_uma_pendente ON transferencias (matricula_id) WHERE estado = 'pendente';
CREATE INDEX transferencias_destino ON transferencias (escola_destino_id, estado);
CREATE TRIGGER transferencias_sem_delete BEFORE DELETE ON transferencias FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();

-- A matrícula de origem regista a transferência no seu histórico
ALTER TABLE matricula_historico DROP CONSTRAINT matricula_historico_accao_check;
ALTER TABLE matricula_historico ADD CONSTRAINT matricula_historico_accao_check
  CHECK (accao IN ('criar', 'confirmar', 'mudar_turma', 'anular', 'concluir', 'transferir'));
