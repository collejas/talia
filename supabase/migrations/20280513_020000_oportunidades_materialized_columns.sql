BEGIN;

ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS canal text,
    ADD COLUMN IF NOT EXISTS contacto_nombre text,
    ADD COLUMN IF NOT EXISTS restart_sequence integer NOT NULL DEFAULT 1;

UPDATE public.oportunidades AS o
SET
    canal = NULLIF(
        lower(
            COALESCE(
                NULLIF(o.canal, ''),
                NULLIF(o.metadata ->> 'canal', ''),
                NULLIF(o.metadata ->> 'channel', '')
            )
        ),
        ''
    ),
    restart_sequence = COALESCE(
        CASE
            WHEN o.restart_sequence IS NOT NULL THEN GREATEST(o.restart_sequence, 1)
            WHEN (o.metadata ->> 'restart_sequence') ~ '^[0-9]+$' THEN GREATEST((o.metadata ->> 'restart_sequence')::integer, 1)
            ELSE NULL
        END,
        1
    )
WHERE TRUE;

UPDATE public.oportunidades AS o
SET contacto_nombre = COALESCE(
    NULLIF(o.contacto_nombre, ''),
    NULLIF(p.nombre_completo, ''),
    NULLIF(o.titulo, '')
)
FROM public.personas AS p
WHERE p.organizacion_id = o.organizacion_id
  AND p.id = o.contacto_principal_id;

UPDATE public.oportunidades
SET contacto_nombre = COALESCE(NULLIF(contacto_nombre, ''), NULLIF(titulo, ''))
WHERE contacto_nombre IS NULL OR contacto_nombre = '';

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

DROP TRIGGER IF EXISTS oportunidades_sync_materialized_columns ON public.oportunidades;
CREATE TRIGGER oportunidades_sync_materialized_columns
BEFORE INSERT OR UPDATE OF metadata, canal, contacto_nombre, restart_sequence, contacto_principal_id, titulo, organizacion_id
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.sync_oportunidades_materialized_columns();

CREATE INDEX IF NOT EXISTS oportunidades_org_canal_creado_en_idx
    ON public.oportunidades (organizacion_id, canal, creado_en DESC);

CREATE INDEX IF NOT EXISTS oportunidades_org_restart_sequence_idx
    ON public.oportunidades (organizacion_id, restart_sequence);

CREATE INDEX IF NOT EXISTS oportunidades_titulo_trgm_idx
    ON public.oportunidades
    USING gin (titulo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS oportunidades_contacto_nombre_trgm_idx
    ON public.oportunidades
    USING gin (contacto_nombre gin_trgm_ops);

COMMIT;
