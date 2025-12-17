BEGIN;

-- Endurece policies existentes: cualquier policy que use `es_admin()` sin restringir por tenant
-- queda vulnerable a que un admin de un tenant vea/modifique datos de otros tenants.
--
-- Este script agrega `AND organizacion_id = usuario_organizacion_id(auth.uid())` a USING y WITH CHECK
-- cuando corresponda, de forma dinámica.

DO $$
DECLARE
    rec record;
    v_table text;
    v_using text;
    v_check text;
BEGIN
    FOR rec IN
        WITH policy_src AS (
            SELECT
                p.oid as policy_oid,
                n.nspname as schema_name,
                c.relname as table_name,
                p.polname,
                pg_get_expr(p.polqual, p.polrelid) as using_expr,
                pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
            FROM pg_policy p
            JOIN pg_class c ON c.oid = p.polrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relkind = 'r'
              AND EXISTS (
                SELECT 1
                FROM pg_attribute a
                WHERE a.attrelid = c.oid
                  AND a.attname = 'organizacion_id'
                  AND a.attisdropped = false
              )
              AND (
                coalesce(pg_get_expr(p.polqual, p.polrelid), '') ILIKE '%es_admin%'
                OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%es_admin%'
              )
              AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') NOT ILIKE '%organizacion_id%'
              AND coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') NOT ILIKE '%organizacion_id%'
        )
        SELECT *
        FROM policy_src
        ORDER BY schema_name, table_name, polname
    LOOP
        v_table := format('%I.%I', rec.schema_name, rec.table_name);

        IF rec.using_expr IS NOT NULL THEN
            v_using := format('(%s) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))', rec.using_expr);
            EXECUTE format('ALTER POLICY %I ON %s USING (%s)', rec.polname, v_table, v_using);
        END IF;

        IF rec.check_expr IS NOT NULL THEN
            v_check := format('(%s) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))', rec.check_expr);
            EXECUTE format('ALTER POLICY %I ON %s WITH CHECK (%s)', rec.polname, v_table, v_check);
        END IF;
    END LOOP;
END
$$;

-- Asegura que `roles` y `usuarios_roles` queden tenant-safe incluso para admins.
-- (Esta parte se cubre por el bloque dinámico, pero la dejamos explícita por claridad).
ALTER POLICY roles_admin ON public.roles
    USING (es_admin(auth.uid()) AND organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (es_admin(auth.uid()) AND organizacion_id = public.usuario_organizacion_id(auth.uid()));

ALTER POLICY usuarios_roles_admin ON public.usuarios_roles
    USING (es_admin(auth.uid()) AND organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (es_admin(auth.uid()) AND organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Opcional pero recomendado: fuerza RLS en organizaciones para que incluso el owner respete policies.
ALTER TABLE public.organizaciones FORCE ROW LEVEL SECURITY;

COMMIT;

