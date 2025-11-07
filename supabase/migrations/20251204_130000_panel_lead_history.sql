BEGIN;

-- ============================================================================
-- Historial y notas de leads (panel_lead_movimientos / panel_lead_add_nota)
-- ============================================================================

CREATE FUNCTION public.panel_lead_movimientos(
    p_tarjeta_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
) RETURNS TABLE(
    movimiento_id uuid,
    tarjeta_id uuid,
    tipo text,
    cambiado_por uuid,
    cambiado_nombre text,
    cambiado_en timestamptz,
    fuente text,
    etapa_origen_id uuid,
    etapa_origen_nombre text,
    etapa_destino_id uuid,
    etapa_destino_nombre text,
    motivo text,
    nota text,
    metadata jsonb
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_limit integer := COALESCE(NULLIF(p_limit, 0), 50);
    v_offset integer := GREATEST(p_offset, 0);
BEGIN
    IF NOT public.puede_ver_lead(p_tarjeta_id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        lm.id AS movimiento_id,
        lm.tarjeta_id,
        COALESCE(NULLIF(lm.metadata ->> 'tipo', ''), 'movimiento') AS tipo,
        lm.cambiado_por,
        u.nombre_completo AS cambiado_nombre,
        lm.cambiado_en,
        lm.fuente,
        lm.etapa_origen_id,
        origen.nombre AS etapa_origen_nombre,
        lm.etapa_destino_id,
        destino.nombre AS etapa_destino_nombre,
        lm.motivo,
        NULLIF(lm.metadata ->> 'nota', '') AS nota,
        lm.metadata
    FROM public.lead_movimientos lm
    LEFT JOIN public.lead_etapas origen ON origen.id = lm.etapa_origen_id
    LEFT JOIN public.lead_etapas destino ON destino.id = lm.etapa_destino_id
    LEFT JOIN public.usuarios u ON u.id = lm.cambiado_por
    WHERE lm.tarjeta_id = p_tarjeta_id
    ORDER BY lm.cambiado_en DESC, lm.id DESC
    LIMIT v_limit
    OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_movimientos(uuid, integer, integer)
    TO postgres, service_role, authenticated;

CREATE FUNCTION public.panel_lead_add_nota(
    p_tarjeta_id uuid,
    p_texto text,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(
    movimiento_id uuid,
    tarjeta_id uuid,
    tipo text,
    cambiado_por uuid,
    cambiado_nombre text,
    cambiado_en timestamptz,
    fuente text,
    etapa_origen_id uuid,
    etapa_origen_nombre text,
    etapa_destino_id uuid,
    etapa_destino_nombre text,
    motivo text,
    nota text,
    metadata jsonb
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_trimmed text := btrim(COALESCE(p_texto, ''));
    v_lead public.lead_tarjetas%ROWTYPE;
    v_now timestamptz := now();
    v_actor uuid := auth.uid();
    v_inserted public.lead_movimientos%ROWTYPE;
BEGIN
    IF v_trimmed = '' THEN
        RAISE EXCEPTION 'note_empty' USING ERRCODE = '22023', MESSAGE = 'La nota no puede estar vacía.';
    END IF;

    SELECT *
    INTO v_lead
    FROM public.lead_tarjetas
    WHERE id = p_tarjeta_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.puede_ver_lead(v_lead.id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

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
            'tipo', 'nota',
            'nota', v_trimmed
        ) || COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING *
    INTO v_inserted;

    RETURN QUERY
    SELECT
        lm.id AS movimiento_id,
        lm.tarjeta_id,
        COALESCE(NULLIF(lm.metadata ->> 'tipo', ''), 'movimiento') AS tipo,
        lm.cambiado_por,
        u.nombre_completo AS cambiado_nombre,
        lm.cambiado_en,
        lm.fuente,
        lm.etapa_origen_id,
        origen.nombre AS etapa_origen_nombre,
        lm.etapa_destino_id,
        destino.nombre AS etapa_destino_nombre,
        lm.motivo,
        NULLIF(lm.metadata ->> 'nota', '') AS nota,
        lm.metadata
    FROM public.lead_movimientos lm
    LEFT JOIN public.lead_etapas origen ON origen.id = lm.etapa_origen_id
    LEFT JOIN public.lead_etapas destino ON destino.id = lm.etapa_destino_id
    LEFT JOIN public.usuarios u ON u.id = lm.cambiado_por
    WHERE lm.id = v_inserted.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_add_nota(uuid, text, jsonb)
    TO postgres, service_role, authenticated;

COMMIT;
