-- Evita que un resultado DENUE ya consumido historicamente vuelva a insertarse
-- y provoque un 23505 en tenant_prospeccion_credit_ledger_external_consume_uidx.

DO $migration$
DECLARE
    v_definition text;
    v_old text := $old$
    UPDATE pg_temp.prospeccion_denue_candidates AS candidate SET tenant_duplicate = true
    FROM public.resultados AS result
    WHERE result.id = candidate.resultado_id AND candidate.eligible = true AND candidate.batch_rank = 1
      AND EXISTS (
          SELECT 1 FROM public.prospeccion_prospectos AS prospecto
          WHERE prospecto.organizacion_id = p_tenant_id
            AND (prospecto.resultado_id = result.id
              OR (result.external_id IS NOT NULL AND prospecto.fuente = 'denue' AND prospecto.external_id = result.external_id)
              OR (candidate.email_norm IS NOT NULL AND candidate.email_norm IN (nullif(lower(btrim(prospecto.email)), ''), nullif(lower(btrim(prospecto.correo_principal)), ''), nullif(lower(btrim(prospecto.correo_secundario)), '')))
              OR (candidate.email_norm IS NULL AND candidate.phone_norm IS NOT NULL AND candidate.phone_norm IN (nullif(btrim(prospecto.phone_e164), ''), nullif(btrim(prospecto.telefono_principal_e164), ''), nullif(btrim(prospecto.telefono_movil_1_e164), ''))))
      );
$old$;
    v_new text := $new$
    UPDATE pg_temp.prospeccion_denue_candidates AS candidate SET tenant_duplicate = true
    FROM public.resultados AS result
    WHERE result.id = candidate.resultado_id AND candidate.eligible = true AND candidate.batch_rank = 1
      AND (EXISTS (
          SELECT 1 FROM public.prospeccion_prospectos AS prospecto
          WHERE prospecto.organizacion_id = p_tenant_id
            AND (prospecto.resultado_id = result.id
              OR (result.external_id IS NOT NULL AND prospecto.fuente = 'denue' AND prospecto.external_id = result.external_id)
              OR (candidate.email_norm IS NOT NULL AND candidate.email_norm IN (nullif(lower(btrim(prospecto.email)), ''), nullif(lower(btrim(prospecto.correo_principal)), ''), nullif(lower(btrim(prospecto.correo_secundario)), '')))
              OR (candidate.email_norm IS NULL AND candidate.phone_norm IS NOT NULL AND candidate.phone_norm IN (nullif(btrim(prospecto.phone_e164), ''), nullif(btrim(prospecto.telefono_principal_e164), ''), nullif(btrim(prospecto.telefono_movil_1_e164), ''))))
      ) OR EXISTS (
          SELECT 1 FROM public.tenant_prospeccion_credit_ledger AS ledger
          WHERE ledger.tenant_id = p_tenant_id
            AND ledger.source = 'denue'
            AND ledger.source_external_id = result.external_id
            AND ledger.movement_type = 'consume'
            AND result.external_id IS NOT NULL
      ));
$new$;
BEGIN
    SELECT pg_get_functiondef(p.oid)
    INTO v_definition
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prospeccion_guardar_denue_transaccional'
      AND p.prokind = 'f'
    LIMIT 1;

    IF v_definition IS NULL THEN
        RAISE EXCEPTION 'No existe prospeccion_guardar_denue_transaccional';
    END IF;
    IF position(v_old IN v_definition) = 0 THEN
        RAISE EXCEPTION 'No se encontro el bloque esperado de duplicados DENUE';
    END IF;

    EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
