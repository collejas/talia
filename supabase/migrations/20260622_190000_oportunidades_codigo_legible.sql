BEGIN;

ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS codigo_oportunidad text;

CREATE OR REPLACE FUNCTION public.gen_codigo_oportunidad(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_next bigint;
BEGIN
    IF p_organizacion_id IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('oportunidades_codigo_' || p_organizacion_id::text));

    SELECT COALESCE(MAX(substring(o.codigo_oportunidad FROM '^Opo-([0-9]+)$')::bigint), 0) + 1
      INTO v_next
    FROM public.oportunidades o
    WHERE o.organizacion_id = p_organizacion_id
      AND o.codigo_oportunidad ~ '^Opo-[0-9]+$';

    RETURN 'Opo-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_oportunidades_materialized_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    persona_nombre text;
    restart_raw text;
BEGIN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);

    IF NEW.canal IS NULL OR btrim(NEW.canal) = '' THEN
        NEW.canal := lower(NULLIF(NEW.metadata ->> 'canal', ''));
        IF NEW.canal IS NULL THEN
            NEW.canal := lower(NULLIF(NEW.metadata ->> 'channel', ''));
        END IF;
    ELSE
        NEW.canal := lower(btrim(NEW.canal));
    END IF;

    IF NEW.contacto_nombre IS NULL OR btrim(NEW.contacto_nombre) = '' THEN
        SELECT p.nombre_completo
        INTO persona_nombre
        FROM public.personas AS p
        WHERE p.organizacion_id = NEW.organizacion_id
          AND p.id = NEW.contacto_principal_id
        LIMIT 1;

        NEW.contacto_nombre := COALESCE(
            NULLIF(persona_nombre, ''),
            NULLIF(NEW.metadata ->> 'contacto_nombre', ''),
            NULLIF(NEW.titulo, '')
        );
    ELSE
        NEW.contacto_nombre := btrim(NEW.contacto_nombre);
    END IF;

    restart_raw := NEW.metadata ->> 'restart_sequence';
    IF NEW.restart_sequence IS NULL OR NEW.restart_sequence < 1 THEN
        IF restart_raw ~ '^[0-9]+$' THEN
            NEW.restart_sequence := GREATEST(restart_raw::integer, 1);
        ELSE
            NEW.restart_sequence := 1;
        END IF;
    ELSE
        NEW.restart_sequence := GREATEST(NEW.restart_sequence, 1);
    END IF;

    IF NEW.canal IS NOT NULL THEN
        NEW.metadata := jsonb_set(NEW.metadata, '{canal}', to_jsonb(NEW.canal), true);
        NEW.metadata := jsonb_set(NEW.metadata, '{channel}', to_jsonb(NEW.canal), true);
    END IF;
    IF NEW.contacto_nombre IS NOT NULL THEN
        NEW.metadata := jsonb_set(NEW.metadata, '{contacto_nombre}', to_jsonb(NEW.contacto_nombre), true);
    END IF;
    NEW.metadata := jsonb_set(
        NEW.metadata,
        '{restart_sequence}',
        to_jsonb(NEW.restart_sequence),
        true
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_oportunidades_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(NULLIF(btrim(NEW.codigo_oportunidad), ''), NULL) IS NULL THEN
        NEW.codigo_oportunidad := public.gen_codigo_oportunidad(NEW.organizacion_id);
    ELSE
        NEW.codigo_oportunidad := btrim(NEW.codigo_oportunidad);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oportunidades_sync_materialized_columns ON public.oportunidades;
CREATE TRIGGER oportunidades_sync_materialized_columns
BEFORE INSERT OR UPDATE OF metadata, canal, contacto_nombre, restart_sequence, contacto_principal_id, titulo, organizacion_id
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.sync_oportunidades_materialized_columns();

DROP TRIGGER IF EXISTS oportunidades_sync_codigo_oportunidad ON public.oportunidades;
CREATE TRIGGER oportunidades_sync_codigo_oportunidad
BEFORE INSERT
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.sync_oportunidades_codigo();

WITH existing_max AS (
    SELECT
        organizacion_id,
        COALESCE(MAX(substring(codigo_oportunidad FROM '^Opo-([0-9]+)$')::bigint), 0) AS max_seq
    FROM public.oportunidades
    WHERE codigo_oportunidad ~ '^Opo-[0-9]+$'
    GROUP BY organizacion_id
),
ranked AS (
    SELECT
        o.id,
        o.organizacion_id,
        row_number() OVER (PARTITION BY o.organizacion_id ORDER BY o.creado_en, o.id) AS rn,
        COALESCE(existing_max.max_seq, 0) AS base_seq
    FROM public.oportunidades o
    LEFT JOIN existing_max
        ON existing_max.organizacion_id = o.organizacion_id
    WHERE o.codigo_oportunidad IS NULL
       OR btrim(o.codigo_oportunidad) = ''
       OR o.codigo_oportunidad !~ '^Opo-[0-9]+$'
)
UPDATE public.oportunidades o
SET codigo_oportunidad = 'Opo-' || lpad((ranked.base_seq + ranked.rn)::text, 4, '0')
FROM ranked
WHERE o.id = ranked.id;

ALTER TABLE public.oportunidades
    ALTER COLUMN codigo_oportunidad SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'oportunidades_codigo_oportunidad_formato_chk'
          AND conrelid = 'public.oportunidades'::regclass
    ) THEN
        ALTER TABLE public.oportunidades
            ADD CONSTRAINT oportunidades_codigo_oportunidad_formato_chk
            CHECK (codigo_oportunidad ~ '^Opo-[0-9]+$');
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS oportunidades_org_codigo_oportunidad_uidx
    ON public.oportunidades (organizacion_id, codigo_oportunidad);

COMMENT ON COLUMN public.oportunidades.codigo_oportunidad
    IS 'Codigo legible de negocio para la oportunidad, independiente del UUID maestro.';

ALTER FUNCTION public.gen_codigo_oportunidad(uuid) SET search_path TO public;
ALTER FUNCTION public.sync_oportunidades_materialized_columns() SET search_path TO public;
ALTER FUNCTION public.sync_oportunidades_codigo() SET search_path TO public;

COMMIT;
