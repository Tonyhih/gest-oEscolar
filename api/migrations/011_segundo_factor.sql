-- Segundo factor de autenticação do director: código de 6 dígitos enviado por email, válido 10 minutos.
-- Guarda-se só o hash do código; cada desafio aceita no máximo 5 tentativas e 3 reenvios.
CREATE TABLE codigos_acesso (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- o "desafio" devolvido no login
  utilizador_id  uuid NOT NULL REFERENCES utilizadores (id),
  codigo_hash    text NOT NULL,
  expira_em      timestamptz NOT NULL,
  tentativas     smallint NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 5),
  reenvios       smallint NOT NULL DEFAULT 0 CHECK (reenvios BETWEEN 0 AND 3),
  enviado_em     timestamptz NOT NULL DEFAULT now(),
  usado_em       timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX codigos_acesso_utilizador ON codigos_acesso (utilizador_id, criado_em DESC);
