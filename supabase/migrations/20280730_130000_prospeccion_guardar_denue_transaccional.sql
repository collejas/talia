BEGIN;

CREATE OR REPLACE FUNCTION public.prospeccion_guardar_denue_transaccional(
    p_tenant_id uuid,
    p_created_by uuid,
    p_operation_id uuid,
    p_resultado_ids uuid[],
    p_segmento text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_plan_id uuid;
    v_access_status text;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_credits_limit integer;
    v_raw_results_limit integer;
    v_contact_mode text;
    v_period public.tenant_prospeccion_usage_periods%ROWTYPE;
    v_existing_operation public.tenant_prospeccion_credit_operations%ROWTYPE;
    v_request_hash text;
    v_requested_count integer;
    v_found_count integer;
    v_eligible_count integer;
    v_missing_count integer;
    v_batch_duplicate_count integer;
    v_tenant_duplicate_count integer;
    v_saved_count integer;
    v_omitted_by_limit_count integer;
    v_available_credits integer;
    v_prospectos jsonb := '[]'::jsonb;
BEGIN
    IF p_tenant_id IS NULL OR p_operation_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_request_invalid';
    END IF;
    IF p_resultado_ids IS NULL OR cardinality(p_resultado_ids) = 0
       OR cardinality(p_resultado_ids) > 5000 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_result_ids_invalid';
    END IF;
    IF p_segmento IS NOT NULL AND length(btrim(p_segmento)) > 120 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_segment_invalid';
    END IF;
    IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_metadata_invalid';
    END IF;
    IF p_created_by IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.usuarios AS u
        WHERE u.id = p_created_by
          AND u.organizacion_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_actor_not_allowed';
    END IF;

    v_requested_count := cardinality(p_resultado_ids);
    v_request_hash := encode(
        sha256(
            convert_to(
                jsonb_build_object(
                    'fuente', 'denue',
                    'resultado_ids', to_jsonb(p_resultado_ids),
                    'segmento', nullif(btrim(p_segmento), ''),
                    'metadata', p_metadata
                )::text,
                'UTF8'
            )
        ),
        'hex'
    );

    -- Un único orden de locks por tenant evita sobregiros y deadlocks entre lotes.
    PERFORM pg_advisory_xact_lock(hashtext('prospeccion_credits_' || p_tenant_id::text));

    SELECT operation.*
    INTO v_existing_operation
    FROM public.tenant_prospeccion_credit_operations AS operation
    WHERE operation.tenant_id = p_tenant_id
      AND operation.id = p_operation_id;

    IF FOUND THEN
        IF v_existing_operation.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'prospeccion_operation_payload_conflict';
        END IF;
        IF v_existing_operation.status <> 'completed' THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'prospeccion_operation_incomplete';
        END IF;

        SELECT period.*
        INTO v_period
        FROM public.tenant_prospeccion_usage_periods AS period
        WHERE period.tenant_id = p_tenant_id
          AND period.id = v_existing_operation.usage_period_id;

        IF v_period.id IS NULL THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'prospeccion_usage_period_invalid';
        END IF;

        SELECT coalesce(jsonb_agg(to_jsonb(prospecto) ORDER BY ledger.created_at, ledger.id), '[]'::jsonb)
        INTO v_prospectos
        FROM public.tenant_prospeccion_credit_ledger AS ledger
        JOIN public.prospeccion_prospectos AS prospecto
          ON prospecto.id = ledger.prospecto_id
         AND prospecto.organizacion_id = ledger.tenant_id
        WHERE ledger.tenant_id = p_tenant_id
          AND ledger.operation_id = p_operation_id
          AND ledger.movement_type = 'consume';

        RETURN jsonb_build_object(
            'ok', true,
            'replayed', true,
            'operation_id', v_existing_operation.id,
            'solicitados', v_existing_operation.requested_count,
            'cumplen_criterio_contacto', v_existing_operation.eligible_contact_count,
            'sin_contacto_requerido', v_existing_operation.missing_required_contact_count,
            'duplicados_lote', v_existing_operation.batch_duplicate_count,
            'duplicados_tenant', v_existing_operation.tenant_duplicate_count,
            'nuevos_guardados', v_existing_operation.saved_count,
            'total', v_existing_operation.saved_count,
            'creditos_consumidos', v_existing_operation.credits_consumed,
            'creditos_restantes', v_existing_operation.credits_remaining,
            'omitidos_por_limite', v_existing_operation.omitted_by_limit_count,
            'required_contact_mode', v_existing_operation.required_contact_mode,
            'period_start', v_period.period_start,
            'period_end', v_period.period_end,
            'prospectos', v_prospectos
        );
    END IF;

    SELECT billing.plan_id, billing.access_status,
           CASE
               WHEN billing.current_period_start IS NOT NULL
                AND billing.current_period_end IS NOT NULL
                AND billing.current_period_start <= v_now
                AND v_now < billing.current_period_end
               THEN billing.current_period_start
               ELSE date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
           END,
           CASE
               WHEN billing.current_period_start IS NOT NULL
                AND billing.current_period_end IS NOT NULL
                AND billing.current_period_start <= v_now
                AND v_now < billing.current_period_end
               THEN billing.current_period_end
               ELSE (
                   date_trunc('month', v_now AT TIME ZONE 'UTC') + interval '1 month'
               ) AT TIME ZONE 'UTC'
           END
    INTO v_plan_id, v_access_status, v_period_start, v_period_end
    FROM public.tenant_billing_accounts AS billing
    JOIN public.commercial_plans AS plan
      ON plan.id = billing.plan_id
     AND plan.active = true
    WHERE billing.tenant_id = p_tenant_id;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_plan_not_configured';
    END IF;
    IF v_access_status NOT IN ('active', 'grace', 'internal_free') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_access_blocked';
    END IF;

    SELECT coalesce(policy.required_contact_mode, 'any')
    INTO v_contact_mode
    FROM (SELECT 1) AS singleton
    LEFT JOIN public.tenant_prospeccion_policies AS policy
      ON policy.tenant_id = p_tenant_id;

    SELECT coalesce(
        (
            SELECT override.override_value::integer
            FROM public.tenant_plan_overrides AS override
            WHERE override.tenant_id = p_tenant_id
              AND override.override_key = 'limit.prospeccion.credits_month'
              AND override.override_value ~ '^[0-9]+$'
              AND (override.starts_at IS NULL OR override.starts_at <= v_now)
              AND (override.ends_at IS NULL OR v_now < override.ends_at)
            ORDER BY override.created_at DESC, override.id DESC
            LIMIT 1
        ),
        (
            SELECT entitlement.limit_value::integer
            FROM public.commercial_plan_entitlements AS entitlement
            WHERE entitlement.plan_id = v_plan_id
              AND entitlement.entitlement_key = 'limit.prospeccion.credits_month'
              AND entitlement.enabled = true
              AND entitlement.limit_value >= 0
              AND entitlement.limit_value = trunc(entitlement.limit_value)
            ORDER BY entitlement.created_at DESC, entitlement.id DESC
            LIMIT 1
        )
    )
    INTO v_credits_limit;

    SELECT coalesce(
        (
            SELECT override.override_value::integer
            FROM public.tenant_plan_overrides AS override
            WHERE override.tenant_id = p_tenant_id
              AND override.override_key = 'limit.prospeccion.denue_raw_results_month'
              AND override.override_value ~ '^[0-9]+$'
              AND (override.starts_at IS NULL OR override.starts_at <= v_now)
              AND (override.ends_at IS NULL OR v_now < override.ends_at)
            ORDER BY override.created_at DESC, override.id DESC
            LIMIT 1
        ),
        (
            SELECT entitlement.limit_value::integer
            FROM public.commercial_plan_entitlements AS entitlement
            WHERE entitlement.plan_id = v_plan_id
              AND entitlement.entitlement_key = 'limit.prospeccion.denue_raw_results_month'
              AND entitlement.enabled = true
              AND entitlement.limit_value >= 0
              AND entitlement.limit_value = trunc(entitlement.limit_value)
            ORDER BY entitlement.created_at DESC, entitlement.id DESC
            LIMIT 1
        )
    )
    INTO v_raw_results_limit;

    IF v_credits_limit IS NULL OR v_raw_results_limit IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_credits_not_configured';
    END IF;

    INSERT INTO public.tenant_prospeccion_usage_periods (
        tenant_id,
        period_start,
        period_end,
        credits_limit,
        raw_results_limit
    )
    VALUES (
        p_tenant_id,
        v_period_start,
        v_period_end,
        v_credits_limit,
        v_raw_results_limit
    )
    ON CONFLICT (tenant_id, period_start, period_end) DO NOTHING;

    SELECT period.*
    INTO v_period
    FROM public.tenant_prospeccion_usage_periods AS period
    WHERE period.tenant_id = p_tenant_id
      AND period.period_start = v_period_start
      AND period.period_end = v_period_end
    FOR UPDATE;

    IF v_period.id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_usage_period_invalid';
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS pg_temp.prospeccion_denue_candidates (
        requested_order bigint NOT NULL,
        resultado_id uuid NOT NULL,
        email_norm text,
        phone_norm text,
        eligible boolean NOT NULL DEFAULT false,
        batch_rank bigint,
        tenant_duplicate boolean NOT NULL DEFAULT false,
        selected_for_insert boolean NOT NULL DEFAULT false,
        prospecto_id uuid,
        PRIMARY KEY (requested_order)
    ) ON COMMIT DROP;
    TRUNCATE TABLE pg_temp.prospeccion_denue_candidates;

    INSERT INTO pg_temp.prospeccion_denue_candidates (
        requested_order,
        resultado_id,
        email_norm,
        phone_norm,
        eligible
    )
    SELECT
        requested.ordinality,
        result.id,
        normalized.email_norm,
        normalized.phone_norm,
        CASE v_contact_mode
            WHEN 'any' THEN normalized.email_norm IS NOT NULL OR normalized.phone_norm IS NOT NULL
            WHEN 'phone' THEN normalized.phone_norm IS NOT NULL
            WHEN 'email' THEN normalized.email_norm IS NOT NULL
            WHEN 'both' THEN normalized.email_norm IS NOT NULL AND normalized.phone_norm IS NOT NULL
            ELSE false
        END
    FROM unnest(p_resultado_ids) WITH ORDINALITY AS requested(resultado_id, ordinality)
    JOIN public.resultados AS result
      ON result.id = requested.resultado_id
     AND result.organizacion_id = p_tenant_id
     AND result.fuente = 'denue'
    CROSS JOIN LATERAL (
        SELECT
            nullif(
                lower(
                    btrim(
                        coalesce(
                            result.correo_principal,
                            result.email,
                            result.correo_secundario
                        )
                    )
                ),
                ''
            ) AS email_norm,
            nullif(
                CASE
                    WHEN phone_source.cleaned IS NULL THEN NULL
                    WHEN phone_source.cleaned LIKE '00%' THEN
                        '+' || substr(phone_source.cleaned, 3)
                    WHEN phone_source.cleaned LIKE '521%' THEN
                        '+' || phone_source.cleaned
                    WHEN phone_source.cleaned LIKE '52%' THEN
                        '+521' || substr(phone_source.cleaned, 3)
                    WHEN length(phone_source.cleaned) = 10 THEN
                        '+521' || phone_source.cleaned
                    ELSE '+' || phone_source.cleaned
                END,
                ''
            ) AS phone_norm
        FROM (
            SELECT nullif(
                regexp_replace(
                    coalesce(
                        result.telefono_principal_e164,
                        result.telefono_movil_1_e164,
                        result.phone_e164,
                        result.phone
                    ),
                    '[^0-9]',
                    '',
                    'g'
                ),
                ''
            ) AS cleaned
        ) AS phone_source
    ) AS normalized;

    GET DIAGNOSTICS v_found_count = ROW_COUNT;
    IF v_found_count <> v_requested_count THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_results_not_owned';
    END IF;

    WITH ranked AS (
        SELECT
            candidate.requested_order,
            row_number() OVER (
                PARTITION BY CASE
                    WHEN candidate.email_norm IS NOT NULL THEN 'email:' || candidate.email_norm
                    ELSE 'phone:' || candidate.phone_norm
                END
                ORDER BY candidate.requested_order, candidate.resultado_id
            ) AS batch_rank
        FROM pg_temp.prospeccion_denue_candidates AS candidate
        WHERE candidate.eligible = true
    )
    UPDATE pg_temp.prospeccion_denue_candidates AS candidate
    SET batch_rank = ranked.batch_rank
    FROM ranked
    WHERE ranked.requested_order = candidate.requested_order;

    UPDATE pg_temp.prospeccion_denue_candidates AS candidate
    SET tenant_duplicate = true
    FROM public.resultados AS result
    WHERE result.id = candidate.resultado_id
      AND candidate.eligible = true
      AND candidate.batch_rank = 1
      AND EXISTS (
          SELECT 1
          FROM public.prospeccion_prospectos AS prospecto
          WHERE prospecto.organizacion_id = p_tenant_id
            AND (
                prospecto.resultado_id = result.id
                OR (
                    result.external_id IS NOT NULL
                    AND prospecto.fuente = 'denue'
                    AND prospecto.external_id = result.external_id
                )
                OR (
                    candidate.email_norm IS NOT NULL
                    AND candidate.email_norm IN (
                        nullif(lower(btrim(prospecto.email)), ''),
                        nullif(lower(btrim(prospecto.correo_principal)), ''),
                        nullif(lower(btrim(prospecto.correo_secundario)), '')
                    )
                )
                OR (
                    candidate.email_norm IS NULL
                    AND candidate.phone_norm IS NOT NULL
                    AND candidate.phone_norm IN (
                        nullif(btrim(prospecto.phone_e164), ''),
                        nullif(btrim(prospecto.telefono_principal_e164), ''),
                        nullif(btrim(prospecto.telefono_movil_1_e164), '')
                    )
                )
            )
      );

    v_available_credits := greatest(v_period.credits_limit - v_period.credits_consumed, 0);

    WITH candidates_to_insert AS (
        SELECT candidate.requested_order
        FROM pg_temp.prospeccion_denue_candidates AS candidate
        WHERE candidate.eligible = true
          AND candidate.batch_rank = 1
          AND candidate.tenant_duplicate = false
        ORDER BY candidate.requested_order, candidate.resultado_id
        LIMIT v_available_credits
    )
    UPDATE pg_temp.prospeccion_denue_candidates AS candidate
    SET selected_for_insert = true
    FROM candidates_to_insert
    WHERE candidates_to_insert.requested_order = candidate.requested_order;

    WITH inserted AS (
        INSERT INTO public.prospeccion_prospectos (
            busqueda_id,
            resultado_id,
            fuente,
            fuente_busqueda,
            display_name,
            name,
            razon_social,
            nombre_comercial,
            actividad,
            estrato,
            phone,
            phone_e164,
            telefono_principal_e164,
            telefono_principal_tipo_linea,
            telefono_principal_extension,
            telefono_movil_1_e164,
            telefono_movil_1_tipo_linea,
            email,
            correo_principal,
            correo_secundario,
            website,
            address,
            address_full,
            tipo_vialidad,
            nombre_vialidad,
            numero_exterior,
            numero_interior,
            colonia,
            codigo_postal,
            estado_cve,
            estado_nombre,
            municipio_cve,
            municipio_nombre,
            localidad_cve,
            localidad,
            cvegeo,
            asentamiento,
            entre_calles,
            referencia,
            lat,
            lng,
            rating,
            segmento,
            metadata,
            creado_por,
            actualizado_por,
            organizacion_id,
            external_id,
            busqueda_ref,
            query_sort
        )
        SELECT
            result.busqueda_id,
            result.id,
            'denue',
            search.fuente::text,
            coalesce(nullif(btrim(result.name), ''), nullif(btrim(result.razon_social), ''), result.external_id),
            result.name,
            result.razon_social,
            coalesce(nullif(btrim(result.name), ''), nullif(btrim(result.razon_social), ''), result.external_id),
            result.actividad,
            result.estrato,
            coalesce(nullif(btrim(result.phone), ''), candidate.phone_norm),
            candidate.phone_norm,
            candidate.phone_norm,
            result.telefono_principal_tipo_linea,
            result.telefono_principal_extension,
            coalesce(nullif(btrim(result.telefono_movil_1_e164), ''), candidate.phone_norm),
            result.telefono_movil_1_tipo_linea,
            candidate.email_norm,
            coalesce(nullif(lower(btrim(result.correo_principal)), ''), candidate.email_norm),
            nullif(lower(btrim(result.correo_secundario)), ''),
            nullif(btrim(result.website), ''),
            coalesce(nullif(btrim(result.address_full), ''), nullif(btrim(result.address), '')),
            coalesce(nullif(btrim(result.address_full), ''), nullif(btrim(result.address), '')),
            result.tipo_vialidad,
            result.nombre_vialidad,
            result.numero_exterior,
            result.numero_interior,
            result.colonia,
            result.codigo_postal,
            result.estado_cve,
            result.estado_nombre,
            result.municipio_cve,
            result.municipio_nombre,
            result.localidad_cve,
            result.localidad,
            result.cvegeo,
            result.asentamiento,
            result.entre_calles,
            result.referencia,
            result.lat,
            result.lng,
            result.rating,
            nullif(btrim(p_segmento), ''),
            jsonb_build_object('busqueda_meta', search.meta) || p_metadata,
            p_created_by,
            p_created_by,
            p_tenant_id,
            result.external_id,
            result.busqueda_id::text,
            coalesce(nullif(btrim(search.query), ''), result.busqueda_id::text)
        FROM pg_temp.prospeccion_denue_candidates AS candidate
        JOIN public.resultados AS result
          ON result.id = candidate.resultado_id
         AND result.organizacion_id = p_tenant_id
        JOIN public.busquedas AS search
          ON search.id = result.busqueda_id
         AND search.organizacion_id = p_tenant_id
        WHERE candidate.selected_for_insert = true
        ORDER BY candidate.requested_order, candidate.resultado_id
        ON CONFLICT DO NOTHING
        RETURNING id, resultado_id
    )
    UPDATE pg_temp.prospeccion_denue_candidates AS candidate
    SET prospecto_id = inserted.id
    FROM inserted
    WHERE inserted.resultado_id = candidate.resultado_id;

    UPDATE pg_temp.prospeccion_denue_candidates
    SET tenant_duplicate = true
    WHERE selected_for_insert = true
      AND prospecto_id IS NULL;

    SELECT count(*) FILTER (WHERE eligible),
           count(*) FILTER (WHERE NOT eligible),
           count(*) FILTER (WHERE eligible AND batch_rank > 1),
           count(*) FILTER (WHERE eligible AND batch_rank = 1 AND tenant_duplicate),
           count(*) FILTER (WHERE prospecto_id IS NOT NULL)
    INTO v_eligible_count,
         v_missing_count,
         v_batch_duplicate_count,
         v_tenant_duplicate_count,
         v_saved_count
    FROM pg_temp.prospeccion_denue_candidates;

    v_omitted_by_limit_count :=
        v_eligible_count
        - v_batch_duplicate_count
        - v_tenant_duplicate_count
        - v_saved_count;

    INSERT INTO public.tenant_prospeccion_credit_operations (
        id,
        tenant_id,
        usage_period_id,
        request_hash,
        status,
        source,
        required_contact_mode,
        requested_count,
        eligible_contact_count,
        missing_required_contact_count,
        batch_duplicate_count,
        tenant_duplicate_count,
        saved_count,
        credits_consumed,
        omitted_by_limit_count,
        credits_remaining,
        created_by,
        completed_at
    )
    VALUES (
        p_operation_id,
        p_tenant_id,
        v_period.id,
        v_request_hash,
        'completed',
        'denue',
        v_contact_mode,
        v_requested_count,
        v_eligible_count,
        v_missing_count,
        v_batch_duplicate_count,
        v_tenant_duplicate_count,
        v_saved_count,
        v_saved_count,
        v_omitted_by_limit_count,
        v_available_credits - v_saved_count,
        p_created_by,
        v_now
    );

    INSERT INTO public.tenant_prospeccion_credit_ledger (
        tenant_id,
        usage_period_id,
        operation_id,
        prospecto_id,
        resultado_id,
        busqueda_id,
        source,
        source_external_id,
        movement_type,
        credits_delta,
        required_contact_mode,
        created_by
    )
    SELECT
        p_tenant_id,
        v_period.id,
        p_operation_id,
        candidate.prospecto_id,
        result.id,
        result.busqueda_id,
        'denue',
        result.external_id,
        'consume',
        1,
        v_contact_mode,
        p_created_by
    FROM pg_temp.prospeccion_denue_candidates AS candidate
    JOIN public.resultados AS result
      ON result.id = candidate.resultado_id
     AND result.organizacion_id = p_tenant_id
    WHERE candidate.prospecto_id IS NOT NULL
    ORDER BY candidate.requested_order, candidate.resultado_id;

    UPDATE public.tenant_prospeccion_usage_periods
    SET credits_consumed = credits_consumed + v_saved_count
    WHERE tenant_id = p_tenant_id
      AND id = v_period.id
    RETURNING * INTO v_period;

    SELECT coalesce(jsonb_agg(to_jsonb(prospecto) ORDER BY candidate.requested_order), '[]'::jsonb)
    INTO v_prospectos
    FROM pg_temp.prospeccion_denue_candidates AS candidate
    JOIN public.prospeccion_prospectos AS prospecto
      ON prospecto.id = candidate.prospecto_id
     AND prospecto.organizacion_id = p_tenant_id
    WHERE candidate.prospecto_id IS NOT NULL;

    RETURN jsonb_build_object(
        'ok', true,
        'replayed', false,
        'operation_id', p_operation_id,
        'solicitados', v_requested_count,
        'cumplen_criterio_contacto', v_eligible_count,
        'sin_contacto_requerido', v_missing_count,
        'duplicados_lote', v_batch_duplicate_count,
        'duplicados_tenant', v_tenant_duplicate_count,
        'nuevos_guardados', v_saved_count,
        'total', v_saved_count,
        'creditos_consumidos', v_saved_count,
        'creditos_restantes', v_period.credits_limit - v_period.credits_consumed,
        'omitidos_por_limite', v_omitted_by_limit_count,
        'required_contact_mode', v_contact_mode,
        'period_start', v_period.period_start,
        'period_end', v_period.period_end,
        'prospectos', v_prospectos
    );
END;
$function$;

COMMENT ON FUNCTION public.prospeccion_guardar_denue_transaccional(
    uuid,
    uuid,
    uuid,
    uuid[],
    text,
    jsonb
) IS
    'Guarda prospectos DENUE, deduplica y consume creditos en una sola transaccion idempotente por tenant.';

REVOKE ALL ON FUNCTION public.prospeccion_guardar_denue_transaccional(
    uuid,
    uuid,
    uuid,
    uuid[],
    text,
    jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prospeccion_guardar_denue_transaccional(
    uuid,
    uuid,
    uuid,
    uuid[],
    text,
    jsonb
) TO service_role;

COMMIT;
