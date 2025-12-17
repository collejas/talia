BEGIN;

-- Objetivo:
-- 1) Eliminar defaults "legacy" de organizacion_id para evitar inserciones accidentales en la org 000...001.
-- 2) Asegurar que todas las tablas tenant-scoped tengan un BEFORE INSERT trigger que complete organizacion_id
--    desde auth.uid() cuando no se envía explícitamente.
-- 3) Endurecer `tg_set_organizacion_id()` para que nunca invente un tenant: si no puede inferirlo y no viene
--    explícito, falla (evita contaminación silenciosa con service-role/background jobs).

CREATE OR REPLACE FUNCTION public.tg_set_organizacion_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    -- Si viene explícito, no lo tocamos.
    IF NEW.organizacion_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Intenta inferir desde el usuario autenticado.
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
            USING ERRCODE = '23514';
    END IF;

    NEW.organizacion_id := v_org;
    RETURN NEW;
END;
$$;

-- 1) Quita defaults de organizacion_id en todas las tablas tenant-scoped (public.* con esa columna).
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
          AND EXISTS (
            SELECT 1
            FROM pg_attribute a
            WHERE a.attrelid=c.oid
              AND a.attname='organizacion_id'
              AND a.attisdropped=false
          )
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN organizacion_id DROP DEFAULT', rec.schema_name, rec.table_name);
    END LOOP;
END
$$;

-- 2) Crea triggers faltantes (tablas tenant-scoped sin BEFORE INSERT trigger).
DO $$
DECLARE
    rec record;
    v_trigger text;
BEGIN
    FOR rec IN
        SELECT c.oid as relid, c.relname as table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public'
          AND c.relkind='r'
          AND EXISTS (
            SELECT 1
            FROM pg_attribute a
            WHERE a.attrelid=c.oid
              AND a.attname='organizacion_id'
              AND a.attisdropped=false
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_trigger tg
            WHERE tg.tgrelid=c.oid
              AND NOT tg.tgisinternal
              AND (tg.tgtype & 2) <> 0  -- BEFORE
              AND (tg.tgtype & 4) <> 0  -- INSERT
          )
        ORDER BY c.relname
    LOOP
        v_trigger := format('t_%s_set_org', rec.table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_trigger, rec.table_name);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id()',
            v_trigger,
            rec.table_name
        );
    END LOOP;
END
$$;

COMMIT;

