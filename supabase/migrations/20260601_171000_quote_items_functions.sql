BEGIN;

DROP FUNCTION IF EXISTS public._apply_quote_items(uuid, jsonb, char(3));

CREATE FUNCTION public._apply_quote_items(
    p_cotizacion_id uuid,
    p_items jsonb,
    p_default_moneda char(3)
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r_item record;
    v_catalog_item uuid;
    v_titulo text;
    v_descripcion text;
    v_unidad text;
    v_cantidad numeric;
    v_precio_unitario numeric;
    v_descuento numeric;
    v_subtotal numeric;
    v_impuestos numeric;
    v_total numeric;
    v_moneda char(3);
    v_metadatos jsonb;
    v_orden integer;
    v_text text;
BEGIN
    IF p_cotizacion_id IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM public.lead_cotizacion_items WHERE cotizacion_id = p_cotizacion_id;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN;
    END IF;

    FOR r_item IN
        SELECT value, ordinality
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS elem(value, ordinality)
    LOOP
        v_catalog_item := NULL;
        v_titulo := NULLIF(r_item.value->>'titulo', '');
        v_descripcion := NULLIF(r_item.value->>'descripcion', '');
        v_unidad := NULLIF(r_item.value->>'unidad', '');
        IF v_unidad IS NULL THEN
            v_unidad := 'unidad';
        END IF;

        v_text := NULLIF(r_item.value->>'catalog_item_id', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_catalog_item := v_text::uuid;
            EXCEPTION WHEN invalid_text_representation THEN
                v_catalog_item := NULL;
            END;
        END IF;

        v_text := NULLIF(r_item.value->>'cantidad', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_cantidad := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_cantidad := NULL;
            END;
        ELSE
            v_cantidad := NULL;
        END IF;
        IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
            v_cantidad := 1;
        END IF;

        v_text := NULLIF(r_item.value->>'precio_unitario', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_precio_unitario := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_precio_unitario := NULL;
            END;
        ELSE
            v_precio_unitario := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'descuento', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_descuento := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_descuento := NULL;
            END;
        ELSE
            v_descuento := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'subtotal', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_subtotal := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_subtotal := NULL;
            END;
        ELSE
            v_subtotal := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'impuestos', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_impuestos := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_impuestos := NULL;
            END;
        ELSE
            v_impuestos := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'total', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_total := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_total := NULL;
            END;
        ELSE
            v_total := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'moneda', '');
        IF v_text IS NOT NULL THEN
            v_moneda := SUBSTRING(upper(v_text) FROM 1 FOR 3);
        ELSE
            v_moneda := NULL;
        END IF;
        IF v_moneda IS NULL OR char_length(v_moneda) <> 3 THEN
            v_moneda := COALESCE(p_default_moneda, 'MXN');
        END IF;

        v_metadatos := '{}'::jsonb;
        IF r_item.value ? 'metadatos' AND jsonb_typeof(r_item.value->'metadatos') = 'object' THEN
            v_metadatos := r_item.value->'metadatos';
        END IF;

        v_orden := r_item.ordinality;
        v_text := NULLIF(r_item.value->>'orden', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_orden := GREATEST(1, v_text::integer);
            EXCEPTION WHEN invalid_text_representation THEN
                v_orden := r_item.ordinality;
            END;
        END IF;

        IF v_catalog_item IS NULL AND v_titulo IS NULL AND v_descripcion IS NULL
           AND v_subtotal IS NULL AND v_total IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.lead_cotizacion_items (
            cotizacion_id,
            catalog_item_id,
            titulo,
            descripcion,
            unidad,
            cantidad,
            precio_unitario,
            descuento,
            subtotal,
            impuestos,
            total,
            moneda,
            orden,
            metadatos
        ) VALUES (
            p_cotizacion_id,
            v_catalog_item,
            v_titulo,
            v_descripcion,
            COALESCE(v_unidad, 'unidad'),
            v_cantidad,
            v_precio_unitario,
            v_descuento,
            v_subtotal,
            v_impuestos,
            v_total,
            v_moneda,
            v_orden,
            v_metadatos
        );
    END LOOP;
END;
$$;

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
AS $$
DECLARE
    v_lead public.lead_tarjetas%ROWTYPE;
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_conceptos jsonb := '[]'::jsonb;
    v_items jsonb := '[]'::jsonb;
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
    FROM public.lead_tarjetas t
    WHERE t.id = p_tarjeta_id
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

    IF v_payload ? 'items' THEN
        IF jsonb_typeof(v_payload->'items') = 'array' THEN
            v_items := COALESCE(v_payload->'items', '[]'::jsonb);
        ELSIF jsonb_typeof(v_payload->'items') = 'null' THEN
            v_items := '[]'::jsonb;
        ELSE
            RAISE EXCEPTION 'invalid_items_payload' USING ERRCODE = '22023';
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

    IF jsonb_typeof(v_items) <> 'array' THEN
        v_items := '[]'::jsonb;
    END IF;

    IF jsonb_array_length(v_items) = 0 AND jsonb_array_length(v_conceptos) > 0 THEN
        SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'titulo', NULLIF(elem.value->>'titulo', ''),
            'descripcion', NULLIF(elem.value->>'descripcion', ''),
            'total', CASE WHEN jsonb_typeof(elem.value->'total') = 'number' THEN (elem.value->>'total')::numeric ELSE NULL END,
            'orden', elem.ordinality
        ))), '[]'::jsonb)
        INTO v_items
        FROM jsonb_array_elements(v_conceptos) WITH ORDINALITY AS elem(value, ordinality);
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

    PERFORM public._apply_quote_items(v_created.id, v_items, v_moneda);

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
$$;

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
AS $$
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
    FROM public.lead_cotizaciones q
    WHERE q.id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT *
    INTO v_lead
    FROM public.lead_tarjetas t
    WHERE t.id = v_quote.tarjeta_id
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

    UPDATE public.lead_cotizaciones AS q
    SET
        estado = p_estado,
        canal_envio = COALESCE(v_canal, q.canal_envio),
        enviada_por = CASE WHEN p_estado = 'enviada' THEN auth.uid() ELSE q.enviada_por END,
        enviada_en = CASE WHEN p_estado = 'enviada' THEN v_now ELSE q.enviada_en END,
        aprobada_en = CASE WHEN p_estado = 'aceptada' THEN v_now ELSE q.aprobada_en END,
        rechazada_en = CASE WHEN p_estado = 'rechazada' THEN v_now ELSE q.rechazada_en END,
        metadatos = CASE
            WHEN jsonb_typeof(v_extra) = 'object' AND v_extra <> '{}'::jsonb
                THEN COALESCE(q.metadatos, '{}'::jsonb) || v_extra
            ELSE q.metadatos
        END,
        actualizado_en = v_now
    WHERE q.id = p_quote_id
    RETURNING * INTO v_updated;

    IF p_estado = 'aceptada' THEN
        DELETE FROM public.lead_tarjeta_items WHERE lead_tarjeta_id = v_lead.id;

        INSERT INTO public.lead_tarjeta_items (
            lead_tarjeta_id,
            cotizacion_item_id,
            catalog_item_id,
            titulo,
            descripcion,
            unidad,
            cantidad,
            precio_unitario,
            descuento,
            subtotal,
            impuestos,
            total,
            moneda,
            cerrado_en,
            metadatos
        )
        SELECT
            v_lead.id,
            ci.id,
            ci.catalog_item_id,
            ci.titulo,
            ci.descripcion,
            COALESCE(ci.unidad, 'unidad'),
            COALESCE(ci.cantidad, 1),
            ci.precio_unitario,
            ci.descuento,
            ci.subtotal,
            ci.impuestos,
            ci.total,
            COALESCE(ci.moneda, v_quote.moneda, 'MXN'),
            v_now,
            COALESCE(ci.metadatos, '{}'::jsonb)
        FROM public.lead_cotizacion_items ci
        WHERE ci.cotizacion_id = v_quote.id;
    END IF;

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

        UPDATE public.lead_tarjetas AS t
        SET metadata = v_metadata, actualizado_en = v_now
        WHERE t.id = v_lead.id;
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
$$;

GRANT EXECUTE ON FUNCTION public.panel_lead_quote_create(uuid, jsonb)
    TO postgres, service_role, authenticated;

GRANT EXECUTE ON FUNCTION public.panel_lead_quote_mark(uuid, public.lead_cotizacion_estado, text, jsonb)
    TO postgres, service_role, authenticated;

COMMIT;
