-- Uma falta marcada por engano não se apaga (RNF04): passa a 'anulada'.
-- O registo das faltas de uma aula em lote (PUT) anula as que o professor desmarcou.
ALTER TABLE faltas DROP CONSTRAINT faltas_estado_check;
ALTER TABLE faltas ADD CONSTRAINT faltas_estado_check
  CHECK (estado IN ('injustificada', 'justificada', 'anulada'));

-- A regra "justificada tem motivo e autor" passa a aplicar-se só às justificadas
ALTER TABLE faltas DROP CONSTRAINT faltas_check;
ALTER TABLE faltas ADD CONSTRAINT faltas_justificada_com_motivo
  CHECK (estado <> 'justificada' OR (coalesce(length(motivo), 0) >= 3 AND justificada_por IS NOT NULL));
