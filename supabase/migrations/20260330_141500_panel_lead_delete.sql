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
    v_lead public.lead_tarjetas%ROWTYPE;
    v_contact public.contactos%ROWTYPE;
    v_stage public.lead_etapas%ROWTYPE;
    v_now timestamptz := now();
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

    SELECT *
    INTO v_contact
    FROM public.contactos
    WHERE id = v_lead.contacto_id;

    SELECT *
    INTO v_stage
    FROM public.lead_etapas
    WHERE id = v_lead.etapa_id;

    -- Limpia dependencias que no estén en cascada.
    DELETE FROM public.lead_recordatorios
    WHERE tarjeta_id = v_lead.id;

    DELETE FROM public.lead_movimientos
    WHERE tarjeta_id = v_lead.id;

    DELETE FROM public.lead_tarjetas
    WHERE id = v_lead.id;

    RETURN QUERY
    SELECT
        v_lead.id AS tarjeta_id,
        v_lead.contacto_id,
        v_contact.nombre_completo AS contacto_nombre,
        v_contact.correo AS contacto_correo,
        v_contact.telefono_e164 AS contacto_telefono,
        v_lead.tablero_id,
        v_lead.etapa_id,
        v_stage.codigo AS etapa_codigo,
        v_now AS eliminado_en;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_delete(
    uuid,
    text
) TO postgres, service_role, authenticated;

COMMIT;
