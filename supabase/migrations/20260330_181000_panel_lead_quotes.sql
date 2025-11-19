BEGIN;

-- ============================================================================
-- Función: panel_lead_quote_create
-- ============================================================================

DROP FUNCTION IF EXISTS public.panel_lead_quote_create(uuid, jsonb);

CREATE FUNCTION public.panel_lead_quote_create(
    p_tarjeta_id uuid,
    p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
    id uuid,
    tarjeta_id uuid,
    version integer,
    titulo text,
    descripcion text,
    conceptos jsonb,
    subtotal numeric,
    impuestos numeric,
    total numeric,
    moneda char(3),
    valido_hasta date,
    estado public.lead_cotizacion_estado,
    canal_envio text,
    enviada_por uuid,
    enviada_en timestamptz,
    aprobada_en timestamptz,
    rechazada_en timestamptz,
    pdf_path text,
    pdf_url text,
    metadatos jsonb,
    creado_en timestamptz,
    actualizado_en timestamptz
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_lead public.lead_tarjetas%ROWTYPE;
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_conceptos jsonb := '[]'::jsonb;
    v_subtotal numeric;
    v_impuestos numeric;
    v_total numeric;
    v_moneda char(3);
    v_valido date;
    v_titulo text;
    v_descripcion text;
    v_pdf_path text;
    v_pdf_url text;
    v_metadatos jsonb := '{}'::jsonb;
    v_prev_version integer;
    v_created public.lead_cotizaciones%ROWTYPE;
BEGIN
    SELECT *
    INTO v_lead
    FROM public.lead_tarjetas
    WHERE id = p_tarjeta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.puede_ver_lead(v_lead.id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    SELECT c.version
    INTO v_prev_version
    FROM public.lead_cotizaciones c
    WHERE c.tarjeta_id = p_tarjeta_id
    ORDER BY c.version DESC
    LIMIT 1
    FOR UPDATE;

    IF v_payload ? 'conceptos' THEN
        IF jsonb_typeof(v_payload->'conceptos') = 'array' THEN
            v_conceptos := COALESCE(v_payload->'conceptos', '[]'::jsonb);
        ELSIF jsonb_typeof(v_payload->'conceptos') = 'null' THEN
            v_conceptos := '[]'::jsonb;
        ELSE
            RAISE EXCEPTION 'invalid_concepts_payload' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF v_payload ? 'subtotal' THEN
        CASE jsonb_typeof(v_payload->'subtotal')
            WHEN 'number' THEN
                v_subtotal := (v_payload->>'subtotal')::numeric;
            WHEN 'string' THEN
                v_subtotal := NULLIF(v_payload->>'subtotal', '')::numeric;
            WHEN 'null' THEN
                v_subtotal := NULL;
            ELSE
                RAISE EXCEPTION 'invalid_subtotal_value' USING ERRCODE = '22023';
        END CASE;
    END IF;

    IF v_payload ? 'impuestos' THEN
        CASE jsonb_typeof(v_payload->'impuestos')
            WHEN 'number' THEN
                v_impuestos := (v_payload->>'impuestos')::numeric;
            WHEN 'string' THEN
                v_impuestos := NULLIF(v_payload->>'impuestos', '')::numeric;
            WHEN 'null' THEN
                v_impuestos := NULL;
            ELSE
                RAISE EXCEPTION 'invalid_tax_value' USING ERRCODE = '22023';
        END CASE;
    END IF;

    IF v_payload ? 'total' THEN
        CASE jsonb_typeof(v_payload->'total')
            WHEN 'number' THEN
                v_total := (v_payload->>'total')::numeric;
            WHEN 'string' THEN
                v_total := NULLIF(v_payload->>'total', '')::numeric;
            WHEN 'null' THEN
                v_total := NULL;
            ELSE
                RAISE EXCEPTION 'invalid_total_value' USING ERRCODE = '22023';
        END CASE;
    END IF;

    v_moneda := upper(COALESCE(NULLIF(v_payload->>'moneda', ''), v_lead.moneda, 'MXN'));
    v_moneda := SUBSTRING(v_moneda FROM 1 FOR 3);
    IF char_length(v_moneda) <> 3 THEN
        v_moneda := 'MXN';
    END IF;

    IF v_payload ? 'valido_hasta' THEN
        CASE jsonb_typeof(v_payload->'valido_hasta')
            WHEN 'string' THEN
                v_valido := NULLIF(v_payload->>'valido_hasta', '')::date;
            WHEN 'null' THEN
                v_valido := NULL;
            ELSE
                RAISE EXCEPTION 'invalid_valido_hasta' USING ERRCODE = '22023';
        END CASE;
    END IF;

    v_titulo := NULLIF(v_payload->>'titulo', '');
    v_descripcion := NULLIF(v_payload->>'descripcion', '');
    v_pdf_path := NULLIF(v_payload->>'pdf_path', '');
    v_pdf_url := NULLIF(v_payload->>'pdf_url', '');

    IF v_payload ? 'metadatos' THEN
        IF jsonb_typeof(v_payload->'metadatos') = 'object' THEN
            v_metadatos := v_payload->'metadatos';
        ELSIF jsonb_typeof(v_payload->'metadatos') = 'null' THEN
            v_metadatos := '{}'::jsonb;
        ELSE
            RAISE EXCEPTION 'invalid_metadatos_payload' USING ERRCODE = '22023';
        END IF;
    END IF;

    INSERT INTO public.lead_cotizaciones (
        tarjeta_id,
        version,
        titulo,
        descripcion,
        conceptos,
        subtotal,
        impuestos,
        total,
        moneda,
        valido_hasta,
        estado,
        pdf_path,
        pdf_url,
        metadatos
    )
    VALUES (
        p_tarjeta_id,
        COALESCE(v_prev_version, 0) + 1,
        v_titulo,
        v_descripcion,
        v_conceptos,
        v_subtotal,
        v_impuestos,
        v_total,
        v_moneda,
        v_valido,
        'borrador',
        v_pdf_path,
        v_pdf_url,
        v_metadatos
    )
    RETURNING * INTO v_created;

    RETURN QUERY SELECT
        v_created.id,
        v_created.tarjeta_id,
        v_created.version,
        v_created.titulo,
        v_created.descripcion,
        v_created.conceptos,
        v_created.subtotal,
        v_created.impuestos,
        v_created.total,
        v_created.moneda,
        v_created.valido_hasta,
        v_created.estado,
        v_created.canal_envio,
        v_created.enviada_por,
        v_created.enviada_en,
        v_created.aprobada_en,
        v_created.rechazada_en,
        v_created.pdf_path,
        v_created.pdf_url,
        v_created.metadatos,
        v_created.creado_en,
        v_created.actualizado_en;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_quote_create(uuid, jsonb)
    TO postgres, service_role, authenticated;

-- ============================================================================
-- Función: panel_lead_quote_mark
-- ============================================================================

DROP FUNCTION IF EXISTS public.panel_lead_quote_mark(uuid, public.lead_cotizacion_estado, text, jsonb);

CREATE FUNCTION public.panel_lead_quote_mark(
    p_quote_id uuid,
    p_estado public.lead_cotizacion_estado,
    p_canal text DEFAULT NULL,
    p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
    id uuid,
    tarjeta_id uuid,
    version integer,
    titulo text,
    descripcion text,
    conceptos jsonb,
    subtotal numeric,
    impuestos numeric,
    total numeric,
    moneda char(3),
    valido_hasta date,
    estado public.lead_cotizacion_estado,
    canal_envio text,
    enviada_por uuid,
    enviada_en timestamptz,
    aprobada_en timestamptz,
    rechazada_en timestamptz,
    pdf_path text,
    pdf_url text,
    metadatos jsonb,
    creado_en timestamptz,
    actualizado_en timestamptz
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_quote public.lead_cotizaciones%ROWTYPE;
    v_lead public.lead_tarjetas%ROWTYPE;
    v_updated public.lead_cotizaciones%ROWTYPE;
    v_now timestamptz := now();
    v_canal text;
    v_extra jsonb := COALESCE(p_extra, '{}'::jsonb);
    v_event text;
    v_metadata jsonb;
    v_stage_prep jsonb;
    v_negociacion jsonb;
    v_proposal text;
    v_actor uuid;
BEGIN
    IF p_estado = 'borrador' THEN
        RAISE EXCEPTION 'invalid_target_state' USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_quote
    FROM public.lead_cotizaciones
    WHERE id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT *
    INTO v_lead
    FROM public.lead_tarjetas
    WHERE id = v_quote.tarjeta_id
    FOR UPDATE;

    IF NOT public.puede_ver_lead(v_lead.id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    v_canal := lower(NULLIF(p_canal, ''));
    IF v_canal IS NOT NULL AND v_canal <> ALL (ARRAY['email','whatsapp','manual','otro']) THEN
        RAISE EXCEPTION 'invalid_channel';
    END IF;

    IF p_estado = 'enviada' AND v_canal IS NULL THEN
        v_canal := COALESCE(v_quote.canal_envio, 'manual');
    END IF;

    UPDATE public.lead_cotizaciones
    SET
        estado = p_estado,
        canal_envio = COALESCE(v_canal, canal_envio),
        enviada_por = CASE WHEN p_estado = 'enviada' THEN auth.uid() ELSE enviada_por END,
        enviada_en = CASE WHEN p_estado = 'enviada' THEN v_now ELSE enviada_en END,
        aprobada_en = CASE WHEN p_estado = 'aceptada' THEN v_now ELSE aprobada_en END,
        rechazada_en = CASE WHEN p_estado = 'rechazada' THEN v_now ELSE rechazada_en END,
        metadatos = CASE
            WHEN jsonb_typeof(v_extra) = 'object' AND v_extra <> '{}'::jsonb
                THEN COALESCE(metadatos, '{}'::jsonb) || v_extra
            ELSE metadatos
        END,
        actualizado_en = v_now
    WHERE id = p_quote_id
    RETURNING * INTO v_updated;

    IF p_estado = 'enviada' THEN
        v_metadata := COALESCE(v_lead.metadata, '{}'::jsonb);
        v_stage_prep := COALESCE(v_metadata->'stage_prep', '{}'::jsonb);
        v_negociacion := COALESCE(v_stage_prep->'negociacion', '{}'::jsonb);

        IF jsonb_typeof(v_extra->'proposal_sent_at') = 'string' THEN
            v_proposal := NULLIF(v_extra->>'proposal_sent_at', '');
        END IF;

        IF v_proposal IS NULL THEN
            v_proposal := to_char(v_updated.enviada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD');
        END IF;

        v_negociacion :=
            v_negociacion
            || jsonb_build_object(
                'proposal_sent_at', v_proposal,
                'quote_sent_at', to_char(v_updated.enviada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'quote_channel', v_updated.canal_envio,
                'quote_version', v_updated.version,
                'quote_total', v_updated.total,
                'quote_currency', v_updated.moneda,
                'quote_pdf_url', v_updated.pdf_url
            );

        v_stage_prep := jsonb_set(v_stage_prep, '{negociacion}', v_negociacion, true);
        v_metadata := jsonb_set(v_metadata, '{stage_prep}', v_stage_prep, true);

        UPDATE public.lead_tarjetas
        SET metadata = v_metadata, actualizado_en = v_now
        WHERE id = v_lead.id;
    END IF;

    v_event := CASE p_estado
        WHEN 'enviada' THEN 'quote_sent'
        WHEN 'aceptada' THEN 'quote_accepted'
        WHEN 'rechazada' THEN 'quote_rejected'
        WHEN 'cancelada' THEN 'quote_cancelled'
        ELSE 'quote_updated'
    END;

    v_actor := COALESCE(auth.uid(), v_lead.asignado_a_usuario_id, v_lead.propietario_usuario_id);

    INSERT INTO public.lead_movimientos (
        tarjeta_id,
        etapa_origen_id,
        etapa_destino_id,
        cambiado_por,
        cambiado_en,
        motivo,
        fuente,
        metadata
    )
    VALUES (
        v_lead.id,
        v_lead.etapa_id,
        v_lead.etapa_id,
        v_actor,
        v_now,
        NULL,
        'humano',
        jsonb_build_object(
            'event', v_event,
            'quote_id', v_updated.id,
            'version', v_updated.version,
            'estado', v_updated.estado,
            'canal', v_updated.canal_envio,
            'total', v_updated.total,
            'moneda', v_updated.moneda
        )
    );

    RETURN QUERY SELECT
        v_updated.id,
        v_updated.tarjeta_id,
        v_updated.version,
        v_updated.titulo,
        v_updated.descripcion,
        v_updated.conceptos,
        v_updated.subtotal,
        v_updated.impuestos,
        v_updated.total,
        v_updated.moneda,
        v_updated.valido_hasta,
        v_updated.estado,
        v_updated.canal_envio,
        v_updated.enviada_por,
        v_updated.enviada_en,
        v_updated.aprobada_en,
        v_updated.rechazada_en,
        v_updated.pdf_path,
        v_updated.pdf_url,
        v_updated.metadatos,
        v_updated.creado_en,
        v_updated.actualizado_en;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_quote_mark(uuid, public.lead_cotizacion_estado, text, jsonb)
    TO postgres, service_role, authenticated;

COMMIT;
