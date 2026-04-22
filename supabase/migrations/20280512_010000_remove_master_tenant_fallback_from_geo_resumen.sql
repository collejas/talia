-- Remove master-tenant fallback from geo summary RPCs.
-- If auth.uid() cannot be mapped to an organization, these RPCs should return no rows
-- instead of leaking data from the master tenant.

DO $$
DECLARE
    v_new text := 'public.usuario_organizacion_id(auth.uid())';
    v_def text;
    r record;
BEGIN
    FOR r IN
        SELECT
            p.oid,
            p.oid::regprocedure AS signature,
            pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'panel_visitantes_geo_resumen_ext',
              'panel_visitantes_geo_resumen_v2',
              'panel_visitantes_geo_resumen_v3'
          )
    LOOP
        v_def := regexp_replace(
            r.definition,
            E'COALESCE\\(\\s*public\\.usuario_organizacion_id\\(auth\\.uid\\(\\)\\)\\s*,\\s*''00000000-0000-0000-0000-000000000001''::uuid\\s*\\)',
            v_new,
            'g'
        );

        IF v_def <> r.definition THEN
            EXECUTE v_def;
        END IF;
    END LOOP;
END
$$;
