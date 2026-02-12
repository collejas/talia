BEGIN;

DROP FUNCTION IF EXISTS public.panel_inbox_threads_debug(uuid, text, uuid, integer, integer, integer);
DROP FUNCTION IF EXISTS public.crm_contact_restart_stats_debug(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.panel_inbox_threads_debug(
    p_actor_user_id uuid,
    p_estado text DEFAULT NULL,
    p_asignado uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_message_limit integer DEFAULT 20
)
RETURNS TABLE(
    conversacion_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    canal text,
    estado text,
    prioridad integer,
    iniciada_en timestamptz,
    ultimo_mensaje_en timestamptz,
    no_leidos integer,
    asignado_id uuid,
    asignado_nombre text,
    tags text[],
    manual_override boolean,
    oportunidad_id uuid,
    parent_opportunity_id uuid,
    restart_sequence integer,
    conversation_history text[],
    last_message_preview text,
    last_message_at timestamptz,
    messages jsonb,
    total_rows bigint,
    reengage_attempts integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'actor_user_required' USING ERRCODE = '22023';
    END IF;

    IF v_role <> 'service_role'
       AND NOT public.es_admin(auth.uid())
       AND NOT EXISTS (
           SELECT 1
           FROM public.platform_admins pa
           WHERE pa.user_id = auth.uid()
       ) THEN
        RAISE EXCEPTION 'debug_forbidden' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

    RETURN QUERY
    SELECT *
    FROM public.panel_inbox_threads(
        p_estado,
        p_asignado,
        p_limit,
        p_offset,
        p_message_limit
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_contact_restart_stats_debug(
    p_actor_user_id uuid,
    p_organizacion_id uuid,
    p_min_restart_sequence integer DEFAULT 2,
    p_limit integer DEFAULT 200
)
RETURNS TABLE(
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    total_ciclos integer,
    ciclo_actual integer,
    monto_total numeric,
    monto_ciclo_actual numeric,
    monto_ciclos_previos numeric,
    oportunidad_id uuid,
    etapa_id uuid,
    etapa_nombre text,
    estado text,
    vendedor_id uuid,
    vendedor_nombre text,
    actualizado_en timestamptz,
    primer_ciclo_en timestamptz,
    ultimo_reinicio_en timestamptz,
    metadata jsonb,
    ciclos_detalle jsonb,
    reengage_attempts integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'actor_user_required' USING ERRCODE = '22023';
    END IF;

    IF v_role <> 'service_role'
       AND NOT public.es_admin(auth.uid())
       AND NOT EXISTS (
           SELECT 1
           FROM public.platform_admins pa
           WHERE pa.user_id = auth.uid()
       ) THEN
        RAISE EXCEPTION 'debug_forbidden' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

    RETURN QUERY
    SELECT *
    FROM public.crm_contact_restart_stats(
        p_organizacion_id,
        p_min_restart_sequence,
        p_limit
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.panel_inbox_threads_debug(uuid, text, uuid, integer, integer, integer)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_contact_restart_stats_debug(uuid, uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.panel_inbox_threads_debug(uuid, text, uuid, integer, integer, integer)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_contact_restart_stats_debug(uuid, uuid, integer, integer)
    TO service_role;

COMMIT;
