-- Revokes EXECUTE on app-defined RPCs/functions from anon/authenticated.
-- Keeps PostGIS/extension-owned functions untouched by filtering pg_depend.deptype = 'e'.

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT n.nspname AS schema_name,
               p.proname  AS func_name,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
          AND NOT EXISTS (
              SELECT 1
              FROM pg_depend d
              WHERE d.objid = p.oid
                AND d.deptype = 'e'
          )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon;',
            rec.schema_name,
            rec.func_name,
            rec.args
        );
    END LOOP;
END$$;

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT n.nspname AS schema_name,
               p.proname  AS func_name,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
          AND NOT EXISTS (
              SELECT 1
              FROM pg_depend d
              WHERE d.objid = p.oid
                AND d.deptype = 'e'
          )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated;',
            rec.schema_name,
            rec.func_name,
            rec.args
        );
    END LOOP;
END$$;
