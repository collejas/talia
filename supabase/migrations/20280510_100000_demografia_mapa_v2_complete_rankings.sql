-- El mapa debe devolver todas las agrupaciones del rango, no solo las cinco primeras.
-- Se reconstruye la funcion existente para mantener sincronizada la migracion con
-- la correccion aplicada en Supabase sin duplicar su definicion completa.
DO $$
DECLARE
    function_definition text;
BEGIN
    SELECT pg_get_functiondef(p.oid)
      INTO function_definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'panel_visitantes_geo_resumen_v2'
       AND pg_get_function_identity_arguments(p.oid) =
           'p_nivel text, p_from timestamp with time zone, p_to timestamp with time zone, p_estado text, p_source_class text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_cid uuid, p_tid uuid, p_campaign_type text, p_wa_canal_publicitario text, p_wa_campana_publicitaria text, p_wa_regla_id uuid';

    IF function_definition IS NULL THEN
        RAISE EXCEPTION 'No existe public.panel_visitantes_geo_resumen_v2';
    END IF;

    function_definition := replace(function_definition, ' FILTER (WHERE r.rn <= 5)', '');
    EXECUTE function_definition;
END;
$$;
