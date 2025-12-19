-- Hardens PostgREST exposure by stripping default/table-level grants from anon/authenticated.
-- Restores privileges only for the HR tables that are still managed directly from the panel.

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT format('%I.%I', n.nspname, c.relname) AS fqname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'v', 'm')
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM anon;', rec.fqname);
    END LOOP;
END$$;

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT format('%I.%I', n.nspname, c.relname) AS fqname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'S'
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM anon;', rec.fqname);
    END LOOP;
END$$;

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT format('%I.%I', n.nspname, c.relname) AS fqname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'v', 'm')
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM authenticated;', rec.fqname);
    END LOOP;
END$$;

DO $$DECLARE rec record; BEGIN
    FOR rec IN
        SELECT format('%I.%I', n.nspname, c.relname) AS fqname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'S'
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM authenticated;', rec.fqname);
    END LOOP;
END$$;

-- Allow authenticated panel users to continue managing HR entities directly.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.empleados TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.departamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.puestos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usuarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usuarios_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.roles_permisos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.permisos TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon, authenticated;
