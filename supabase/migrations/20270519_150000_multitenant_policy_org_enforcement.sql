BEGIN;

-- Refuerzo final: agrega un guard-rail de tenant a *todas* las policies de tablas tenant-scoped.
-- Nota: en Postgres las policies se combinan con OR. Si existe alguna policy que no esté
-- limitada por tenant, puede filtrar datos entre organizaciones aunque haya otras policies correctas.

DO $$
DECLARE
    rec record;
    v_table text;
    v_using text;
    v_check text;
    v_org_guard text := '(organizacion_id = public.usuario_organizacion_id(auth.uid()))';
BEGIN
    FOR rec IN
        SELECT
            n.nspname as schema_name,
            c.relname as table_name,
            p.polname,
            pg_get_expr(p.polqual, p.polrelid) as using_expr,
            pg_get_expr(p.polwithcheck, p.polrelid) as check_expr,
            array_agg(r.rolname order by r.rolname) filter (where r.rolname is not null) as roles
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN LATERAL unnest(p.polroles) as role_oid ON true
        LEFT JOIN pg_roles r ON r.oid = role_oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND p.polname NOT ILIKE '%_service_role'
          AND EXISTS (
            SELECT 1
            FROM pg_attribute a
            WHERE a.attrelid = c.oid
              AND a.attname = 'organizacion_id'
              AND a.attisdropped = false
          )
        GROUP BY n.nspname, c.relname, p.polname, p.polqual, p.polwithcheck, p.polrelid
        ORDER BY n.nspname, c.relname, p.polname
    LOOP
        v_table := format('%I.%I', rec.schema_name, rec.table_name);

        IF rec.using_expr IS NOT NULL THEN
            v_using := format('(%s) AND %s', rec.using_expr, v_org_guard);
            EXECUTE format('ALTER POLICY %I ON %s USING (%s)', rec.polname, v_table, v_using);
        END IF;

        IF rec.check_expr IS NOT NULL THEN
            v_check := format('(%s) AND %s', rec.check_expr, v_org_guard);
            EXECUTE format('ALTER POLICY %I ON %s WITH CHECK (%s)', rec.polname, v_table, v_check);
        END IF;
    END LOOP;
END
$$;

COMMIT;

