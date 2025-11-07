BEGIN;

DROP FUNCTION IF EXISTS public.panel_lead_move(
    uuid,
    uuid,
    uuid,
    text,
    text,
    jsonb,
    uuid
) CASCADE;

CREATE FUNCTION public.panel_lead_move(
    p_tarjeta_id uuid,
    p_etapa_destino uuid,
    p_cambiado_por uuid DEFAULT NULL,
    p_fuente text DEFAULT 'humano',
    p_motivo text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_expected_etapa uuid DEFAULT NULL
) RETURNS TABLE(
    tarjeta_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    contacto_estado text,
    canal text,
    etapa_id uuid,
    etapa_nombre text,
    etapa_orden smallint,
    categoria public.lead_categoria,
    creado_en timestamptz,
    actualizado_en timestamptz,
    cerrado_en timestamptz,
    monto_estimado numeric,
    moneda text,
    probabilidad numeric,
    lead_score integer,
    asignado_id uuid,
    asignado_nombre text,
    propietario_id uuid,
    propietario_nombre text,
    conversacion_id uuid,
    ultimo_mensaje_en timestamptz,
    motivo_cierre text,
    tags text[],
    metadata jsonb,
    total_rows bigint
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_lead public.lead_tarjetas%ROWTYPE;
    v_dest public.lead_etapas%ROWTYPE;
    v_origin public.lead_etapas%ROWTYPE;
    v_user uuid;
    v_now timestamptz := now();
    v_new_motivo text;
    v_new_cerrado timestamptz;
    v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
    IF p_fuente NOT IN ('humano', 'asistente', 'api') THEN
        RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
    END IF;

    SELECT lt.*
    INTO v_lead
    FROM public.lead_tarjetas lt
    WHERE lt.id = p_tarjeta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.puede_ver_lead(v_lead.id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    IF p_expected_etapa IS NOT NULL AND v_lead.etapa_id <> p_expected_etapa THEN
        RAISE EXCEPTION 'concurrency_conflict' USING ERRCODE = '40001';
    END IF;

    SELECT * INTO v_dest FROM public.lead_etapas WHERE id = p_etapa_destino;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'dest_stage_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.etapa_id = v_dest.id THEN
        RETURN QUERY
        SELECT
            lt.id AS tarjeta_id,
            lt.contacto_id,
            ct.nombre_completo AS contacto_nombre,
            ct.correo AS contacto_correo,
            ct.telefono_e164 AS contacto_telefono,
            COALESCE(NULLIF(ct.estado, ''), NULLIF(ct.captura_estado, '')) AS contacto_estado,
            COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, '')) AS canal,
            le.id AS etapa_id,
            le.nombre AS etapa_nombre,
            le.orden AS etapa_orden,
            le.categoria,
            lt.creado_en,
            lt.actualizado_en,
            lt.cerrado_en,
            lt.monto_estimado,
            lt.moneda,
            COALESCE(lt.probabilidad_override, le.probabilidad) AS probabilidad,
            lt.lead_score,
            lt.asignado_a_usuario_id AS asignado_id,
            asignado.nombre_completo AS asignado_nombre,
            lt.propietario_usuario_id AS propietario_id,
            propietario.nombre_completo AS propietario_nombre,
            lt.conversacion_id,
            conv.ultimo_mensaje_en,
            lt.motivo_cierre,
            lt.tags,
            lt.metadata,
            1::bigint AS total_rows
        FROM public.lead_tarjetas lt
        JOIN public.lead_etapas le ON le.id = lt.etapa_id
        JOIN public.contactos ct ON ct.id = lt.contacto_id
        LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
        LEFT JOIN public.usuarios asignado ON asignado.id = lt.asignado_a_usuario_id
        LEFT JOIN public.usuarios propietario ON propietario.id = lt.propietario_usuario_id
        WHERE lt.id = p_tarjeta_id;
        RETURN;
    END IF;

    SELECT * INTO v_origin FROM public.lead_etapas WHERE id = v_lead.etapa_id;

    v_user := COALESCE(auth.uid(), p_cambiado_por, v_lead.asignado_a_usuario_id, v_lead.propietario_usuario_id);

    IF v_dest.categoria = 'ganada' THEN
        v_new_cerrado := COALESCE(v_lead.cerrado_en, v_now);
        v_new_motivo := COALESCE(NULLIF(p_motivo, ''), v_lead.motivo_cierre);
    ELSIF v_dest.categoria = 'perdida' THEN
        v_new_cerrado := COALESCE(v_lead.cerrado_en, v_now);
        v_new_motivo := COALESCE(NULLIF(p_motivo, ''), v_lead.motivo_cierre);
    ELSE
        v_new_cerrado := NULL;
        v_new_motivo := NULLIF(p_motivo, '');
    END IF;

    UPDATE public.lead_tarjetas
    SET
        etapa_id = v_dest.id,
        actualizado_en = v_now,
        cerrado_en = v_new_cerrado,
        motivo_cierre = v_new_motivo
    WHERE id = p_tarjeta_id
    RETURNING * INTO v_lead;

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
        p_tarjeta_id,
        v_origin.id,
        v_dest.id,
        v_user,
        v_now,
        NULLIF(p_motivo, ''),
        p_fuente,
        COALESCE(v_metadata, '{}'::jsonb)
    );

    RETURN QUERY
    SELECT
        lt.id AS tarjeta_id,
        lt.contacto_id,
        ct.nombre_completo AS contacto_nombre,
        ct.correo AS contacto_correo,
        ct.telefono_e164 AS contacto_telefono,
        COALESCE(NULLIF(ct.estado, ''), NULLIF(ct.captura_estado, '')) AS contacto_estado,
        COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, '')) AS canal,
        le.id AS etapa_id,
        le.nombre AS etapa_nombre,
        le.orden AS etapa_orden,
        le.categoria,
        lt.creado_en,
        lt.actualizado_en,
        lt.cerrado_en,
        lt.monto_estimado,
        lt.moneda,
        COALESCE(lt.probabilidad_override, le.probabilidad) AS probabilidad,
        lt.lead_score,
        lt.asignado_a_usuario_id AS asignado_id,
        asignado.nombre_completo AS asignado_nombre,
        lt.propietario_usuario_id AS propietario_id,
        propietario.nombre_completo AS propietario_nombre,
        lt.conversacion_id,
        conv.ultimo_mensaje_en,
        lt.motivo_cierre,
        lt.tags,
        lt.metadata,
        1::bigint AS total_rows
    FROM public.lead_tarjetas lt
    JOIN public.lead_etapas le ON le.id = lt.etapa_id
    JOIN public.contactos ct ON ct.id = lt.contacto_id
    LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
    LEFT JOIN public.usuarios asignado ON asignado.id = lt.asignado_a_usuario_id
    LEFT JOIN public.usuarios propietario ON propietario.id = lt.propietario_usuario_id
    WHERE lt.id = p_tarjeta_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_move(
    uuid,
    uuid,
    uuid,
    text,
    text,
    jsonb,
    uuid
) TO postgres, service_role, authenticated;

COMMIT;
