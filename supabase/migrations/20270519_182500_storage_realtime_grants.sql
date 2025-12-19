-- Revokes anon/authenticated access to storage/* and realtime/* tables/sequences.
-- Supabase services use privileged roles (supabase_storage_admin, supabase_realtime_admin),
-- so application clients should go through FastAPI or signed URLs instead of direct SQL.

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT format('%I.%I', n.nspname, c.relname) AS fqname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('storage','realtime')
          AND c.relkind IN ('r','v','m')
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM anon;', rec.fqname);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM authenticated;', rec.fqname);
    END LOOP;
END$$;

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT format('%I.%I', n.nspname, c.relname) AS fqname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('storage','realtime')
          AND c.relkind = 'S'
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM anon;', rec.fqname);
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM authenticated;', rec.fqname);
    END LOOP;
END$$;
