-- Conserva la atribución WhatsApp aunque la conversación todavía no tenga
-- un contacto visible. Se muestra en ubicación desconocida en vez de perderse.
DO $$
DECLARE
    function_definition text;
    scoped_start integer;
    rank_offset integer;
    rank_start integer;
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

    scoped_start := strpos(function_definition, 'wa_atribucion_scoped AS (');
    rank_offset := strpos(
        substr(function_definition, scoped_start),
        'wa_atribucion_rank AS'
    );
    rank_start := scoped_start + rank_offset - 1;
    IF scoped_start = 0 OR rank_offset = 0 THEN
        RAISE EXCEPTION 'No se encontró el bloque de atribución WhatsApp en panel_visitantes_geo_resumen_v2';
    END IF;

    function_definition :=
        substr(function_definition, 1, scoped_start - 1)
        || $function$wa_atribucion_scoped AS (
    SELECT
        cs.nivel AS location_level,
        cs.location_key,
        cs.location_name,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.canal_publicitario, ''))), ''), 'sin_canal') AS canal_publicitario,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.campana_publicitaria, ''))), ''), 'sin_campana') AS campana_publicitaria
    FROM wa_atribucion_raw r
    JOIN conversation_scoped cs ON cs.id = r.conversacion_id
    UNION ALL
    SELECT
        nl.nivel AS location_level,
        'UNK'::text AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN 'País desconocido'
            WHEN nl.nivel = 'municipio' THEN 'Municipio desconocido'
            ELSE 'Estado desconocido'
        END AS location_name,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.canal_publicitario, ''))), ''), 'sin_canal') AS canal_publicitario,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.campana_publicitaria, ''))), ''), 'sin_campana') AS campana_publicitaria
    FROM wa_atribucion_raw r
    CROSS JOIN normalized_level nl
    WHERE NOT EXISTS (
        SELECT 1
        FROM conversation_scoped cs
        WHERE cs.id = r.conversacion_id
    )
),
$function$
        || substr(function_definition, rank_start);

    EXECUTE function_definition;
END;
$$;
