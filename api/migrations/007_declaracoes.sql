-- Declarações numeradas (frequência e notas), na mesma tabela dos certificados.
-- O ciclo só se aplica aos certificados.
ALTER TABLE documentos DROP CONSTRAINT documentos_tipo_check;
ALTER TABLE documentos ADD CONSTRAINT documentos_tipo_check
  CHECK (tipo IN ('certificado', 'declaracao_frequencia', 'declaracao_notas'));
ALTER TABLE documentos ALTER COLUMN ciclo DROP NOT NULL;
ALTER TABLE documentos ADD CONSTRAINT documentos_ciclo_so_certificado CHECK ((tipo = 'certificado') = (ciclo IS NOT NULL));
