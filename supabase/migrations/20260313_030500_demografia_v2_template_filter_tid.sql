BEGIN;

DO $$
DECLARE
    ddl text;
    needle_sig text := 'p_utm_campaign text DEFAULT NULL::text)';
    replacement_sig text := 'p_utm_campaign text DEFAULT NULL::text, p_tid uuid DEFAULT NULL::uuid)';
    needle_where text := 'AND (p_utm_campaign IS NULL OR lower(COALESCE(w.utm_campaign, '''')) = lower(p_utm_campaign))';
    replacement_where text := 'AND (p_utm_campaign IS NULL OR lower(COALESCE(w.utm_campaign, '''')) = lower(p_utm_campaign))
      AND (p_tid IS NULL OR w.tid = p_tid)';
BEGIN
    SELECT pg_get_functiondef(
        'public.panel_visitantes_geo_resumen_v2(text,timestamp with time zone,timestamp with time zone,text,text,text,text,text)'::regprocedure
    )
    INTO ddl;

    IF ddl IS NULL OR position(needle_sig in ddl) = 0 OR position(needle_where in ddl) = 0 THEN
        RAISE EXCEPTION 'No se pudo preparar DDL de panel_visitantes_geo_resumen_v2 para agregar p_tid';
    END IF;

    ddl := replace(ddl, needle_sig, replacement_sig);
    ddl := replace(ddl, needle_where, replacement_where);

    EXECUTE 'DROP FUNCTION IF EXISTS public.panel_visitantes_geo_resumen_v2(text,timestamp with time zone,timestamp with time zone,text,text,text,text,text)';
    EXECUTE ddl;
END $$;

REVOKE ALL ON FUNCTION public.panel_visitantes_geo_resumen_v2(
    text,
    timestamp with time zone,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    text,
    uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_geo_resumen_v2(
    text,
    timestamp with time zone,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    text,
    uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_geo_resumen_v2(
    text,
    timestamp with time zone,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    text,
    uuid
) TO service_role;

COMMIT;
