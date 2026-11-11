-- Pagamentos: preçário (propinas e emolumentos), cobranças, pagamentos e recibos. Valores em Kwanzas (AOA).
-- Cobranças e pagamentos nunca se apagam: anulam-se com motivo.

CREATE TABLE rubricas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id          uuid NOT NULL REFERENCES escolas (id),
  ano_lectivo_id     uuid NOT NULL,
  nome               text NOT NULL,
  tipo               text NOT NULL CHECK (tipo IN ('propina', 'emolumento', 'outro')),
  valor              numeric(12,2) NOT NULL CHECK (valor > 0),
  classe_id          uuid,                                 -- NULL = todas as classes
  meses              smallint[],                           -- propinas: meses do ano lectivo (9 = Setembro…)
  dia_vencimento     smallint NOT NULL DEFAULT 10 CHECK (dia_vencimento BETWEEN 1 AND 28),
  multa_percentagem  numeric(5,2) NOT NULL DEFAULT 0 CHECK (multa_percentagem BETWEEN 0 AND 100),
  activa             boolean NOT NULL DEFAULT true,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  actualizado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, ano_lectivo_id) REFERENCES anos_lectivos (escola_id, id),
  FOREIGN KEY (escola_id, classe_id)      REFERENCES classes (escola_id, id),
  CHECK ((tipo = 'propina') = (meses IS NOT NULL AND cardinality(meses) > 0)),
  CHECK (meses IS NULL OR meses <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])
);

CREATE TABLE cobrancas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid NOT NULL,
  aluno_id         uuid NOT NULL,
  matricula_id     uuid,
  rubrica_id       uuid NOT NULL,
  descricao        text NOT NULL,
  mes_referencia   date,                                   -- propinas: 1.º dia do mês
  valor            numeric(12,2) NOT NULL CHECK (valor > 0),
  vencimento       date NOT NULL,
  estado           text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'paga', 'anulada')),
  anulada_motivo   text,
  criado_por       uuid NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  actualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, aluno_id)     REFERENCES alunos (escola_id, id),
  FOREIGN KEY (escola_id, matricula_id) REFERENCES matriculas (escola_id, id),
  FOREIGN KEY (escola_id, rubrica_id)   REFERENCES rubricas (escola_id, id),
  FOREIGN KEY (escola_id, criado_por)   REFERENCES utilizadores (escola_id, id),
  CHECK (estado <> 'anulada' OR coalesce(length(anulada_motivo), 0) >= 3)
);
-- A mesma propina não se gera duas vezes para a mesma matrícula e mês
CREATE UNIQUE INDEX cobrancas_propina_unica ON cobrancas (matricula_id, rubrica_id, mes_referencia) WHERE mes_referencia IS NOT NULL;
CREATE INDEX cobrancas_aluno ON cobrancas (aluno_id, estado);

CREATE TABLE pagamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid NOT NULL,
  aluno_id         uuid NOT NULL,
  numero           integer NOT NULL,                       -- recibo n.º numero/ano
  ano              smallint NOT NULL,
  valor_total      numeric(12,2) NOT NULL CHECK (valor_total > 0),
  metodo           text NOT NULL CHECK (metodo IN ('numerario', 'transferencia', 'multicaixa', 'deposito', 'outro')),
  referencia       text,                                   -- n.º da transferência, do talão…
  data_pagamento   date NOT NULL,
  estado           text NOT NULL DEFAULT 'valido' CHECK (estado IN ('valido', 'anulado')),
  anulado_motivo   text,
  anulado_por      uuid,
  registado_por    uuid NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, ano, numero),
  UNIQUE (escola_id, id),
  FOREIGN KEY (escola_id, aluno_id)      REFERENCES alunos (escola_id, id),
  FOREIGN KEY (escola_id, registado_por) REFERENCES utilizadores (escola_id, id),
  FOREIGN KEY (escola_id, anulado_por)   REFERENCES utilizadores (escola_id, id),
  CHECK (estado = 'valido' OR (coalesce(length(anulado_motivo), 0) >= 3 AND anulado_por IS NOT NULL))
);
CREATE INDEX pagamentos_aluno ON pagamentos (aluno_id);
CREATE INDEX pagamentos_data ON pagamentos (escola_id, data_pagamento);

CREATE TABLE pagamento_itens (
  escola_id     uuid NOT NULL,
  pagamento_id  uuid NOT NULL,
  cobranca_id   uuid NOT NULL,
  valor         numeric(12,2) NOT NULL CHECK (valor > 0),
  multa         numeric(12,2) NOT NULL DEFAULT 0 CHECK (multa >= 0),
  PRIMARY KEY (pagamento_id, cobranca_id),
  FOREIGN KEY (escola_id, pagamento_id) REFERENCES pagamentos (escola_id, id),
  FOREIGN KEY (escola_id, cobranca_id)  REFERENCES cobrancas (escola_id, id)
);

CREATE TRIGGER cobrancas_sem_delete       BEFORE DELETE ON cobrancas       FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER pagamentos_sem_delete      BEFORE DELETE ON pagamentos      FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER pagamento_itens_sem_delete BEFORE DELETE ON pagamento_itens FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER rubricas_actualizado_em  BEFORE UPDATE ON rubricas  FOR EACH ROW EXECUTE FUNCTION definir_actualizado_em();
CREATE TRIGGER cobrancas_actualizado_em BEFORE UPDATE ON cobrancas FOR EACH ROW EXECUTE FUNCTION definir_actualizado_em();
