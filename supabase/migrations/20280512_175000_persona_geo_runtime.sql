BEGIN;

CREATE OR REPLACE FUNCTION public.puede_ver_persona(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $function$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.es_owner(auth.uid()) AS es_owner,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
persona AS (
    SELECT
        p.id,
        p.propietario_usuario_id,
        p.organizacion_id
    FROM public.personas p
    WHERE p.id = p_persona_id
)
SELECT EXISTS (
    SELECT 1
    FROM persona p
    CROSS JOIN scope s
    WHERE p.id IS NOT NULL
      AND p.organizacion_id = s.organizacion_id
      AND (
            s.es_admin
        OR  s.es_owner
        OR  public.is_in_current_user_scope(p.propietario_usuario_id)
      )
);
$function$;

DO $$
DECLARE
    v_def text;
    v_oid oid;
BEGIN
    SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'panel_visitantes_geo_resumen_ext'
      AND pg_get_function_identity_arguments(p.oid) = 'p_nivel text, p_from timestamp with time zone, p_to timestamp with time zone'
    LIMIT 1;

    IF v_oid IS NOT NULL THEN
        v_def := pg_get_functiondef(v_oid);
        v_def := replace(v_def, 'public.contactos', 'public.personas');
        v_def := replace(v_def, 'contacto_datos', 'persona_datos');
        v_def := replace(v_def, 'puede_ver_contacto', 'puede_ver_persona');
        v_def := replace(v_def, 'telefono_e164', 'telefono_principal_e164');
        EXECUTE v_def;
    END IF;
END
$$;

DO $$
DECLARE
    v_def text;
    v_oid oid;
BEGIN
    SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'panel_visitantes_geo_resumen_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_nivel text, p_from timestamp with time zone, p_to timestamp with time zone, p_estado text, p_source_class text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_cid uuid, p_tid uuid, p_campaign_type text, p_wa_canal_publicitario text, p_wa_campana_publicitaria text, p_wa_regla_id uuid'
    LIMIT 1;

    IF v_oid IS NOT NULL THEN
        v_def := pg_get_functiondef(v_oid);
        v_def := replace(v_def, 'public.contactos', 'public.personas');
        v_def := replace(v_def, 'contacto_datos', 'persona_datos');
        v_def := replace(v_def, 'puede_ver_contacto', 'puede_ver_persona');
        v_def := replace(v_def, 'telefono_e164', 'telefono_principal_e164');
        EXECUTE v_def;
    END IF;
END
$$;

DO $$
DECLARE
    v_def text;
    v_oid oid;
BEGIN
    SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'panel_visitantes_geo_resumen_v3'
      AND pg_get_function_identity_arguments(p.oid) = 'p_nivel text, p_from timestamp with time zone, p_to timestamp with time zone, p_estado text, p_source_class text, p_utm_source text, p_utm_medium text, p_utm_campaign text'
    LIMIT 1;

    IF v_oid IS NOT NULL THEN
        v_def := pg_get_functiondef(v_oid);
        v_def := replace(v_def, 'public.contactos', 'public.personas');
        v_def := replace(v_def, 'contacto_datos', 'persona_datos');
        v_def := replace(v_def, 'puede_ver_contacto', 'puede_ver_persona');
        v_def := replace(v_def, 'telefono_e164', 'telefono_principal_e164');
        EXECUTE v_def;
    END IF;
END
$$;

DO $$
DECLARE
    v_def text;
    v_oid oid;
BEGIN
    SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'panel_webchat_visitas_detalle'
      AND pg_get_function_identity_arguments(p.oid) = 'p_from timestamp with time zone, p_to timestamp with time zone, p_has_chat boolean, p_country text, p_state text, p_city text, p_session text, p_ip text, p_visit_min integer, p_visit_max integer, p_first_from timestamp with time zone, p_first_to timestamp with time zone, p_last_from timestamp with time zone, p_last_to timestamp with time zone, p_stay_min double precision, p_stay_max double precision, p_avg_stay_min double precision, p_avg_stay_max double precision, p_contact_status text, p_device_types text[], p_referrer text, p_landing text, p_order_by text, p_order_dir text, p_search text, p_limit integer, p_offset integer'
    LIMIT 1;

    IF v_oid IS NOT NULL THEN
        v_def := pg_get_functiondef(v_oid);
        v_def := replace(v_def, 'public.contactos', 'public.personas');
        v_def := replace(v_def, 'contacto_datos', 'persona_datos');
        v_def := replace(v_def, 'puede_ver_contacto', 'puede_ver_persona');
        v_def := replace(v_def, 'telefono_e164', 'telefono_principal_e164');
        EXECUTE v_def;
    END IF;
END
$$;

COMMIT;
