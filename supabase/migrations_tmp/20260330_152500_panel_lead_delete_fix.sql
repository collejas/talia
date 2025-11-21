BEGIN;

DROP FUNCTION IF EXISTS public.panel_lead_delete(
    uuid,
    text
) CASCADE;

CREATE FUNCTION public.panel_lead_delete(
    p_tarjeta_id uuid,
    p_motivo text DEFAULT NULL
) RETURNS TABLE(
    tarjeta_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    tablero_id uuid,
    etapa_id uuid,
    etapa_codigo text,
    eliminado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_snapshot RECORD;
BEGIN
    SELECT
        lt.id AS tarjeta_id,
        lt.contacto_id,
        ct.nombre_completo AS contacto_nombre,
        ct.correo AS contacto_correo,
        ct.telefono_e164 AS contacto_telefono,
        lt.tablero_id,
        lt.etapa_id,
        le.codigo AS etapa_codigo
    INTO v_snapshot
    FROM public.lead_tarjetas AS lt
    JOIN public.contactos AS ct ON ct.id = lt.contacto_id
    JOIN public.lead_etapas AS le ON le.id = lt.etapa_id
    WHERE lt.id = p_tarjeta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.puede_ver_lead(v_snapshot.tarjeta_id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.lead_tarjetas AS lt
    WHERE lt.id = v_snapshot.tarjeta_id;

    RETURN QUERY
    SELECT
        v_snapshot.tarjeta_id,
        v_snapshot.contacto_id,
        v_snapshot.contacto_nombre,
        v_snapshot.contacto_correo,
        v_snapshot.contacto_telefono,
        v_snapshot.tablero_id,
        v_snapshot.etapa_id,
        v_snapshot.etapa_codigo,
        now() AS eliminado_en;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_delete(
    uuid,
    text
) TO postgres, service_role, authenticated;

COMMIT;
