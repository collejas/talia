BEGIN;

-- Recomendado: asegura que incluso el owner respete RLS (no afecta roles con BYPASSRLS).
DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN
        SELECT n.nspname as schema_name, c.relname as table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public'
          AND c.relkind='r'
          -- PostGIS metadata table; owned by the extension, documented as an exception.
          AND c.relname not in ('spatial_ref_sys')
          AND c.relrowsecurity = true
    LOOP
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
    END LOOP;
END
$$;

COMMIT;
