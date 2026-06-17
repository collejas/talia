BEGIN;

-- Backfill de compatibilidad: resolvemos cotizaciones históricas al UUID de
-- `public.personas` usando el id directo o el legado almacenado en metadata.
WITH resolved AS (
    SELECT
        c.id AS cotizacion_id,
        COALESCE(p_by_id.id, p_by_legacy.id) AS persona_id
    FROM public.cotizaciones AS c
    LEFT JOIN public.personas AS p_by_id
        ON p_by_id.organizacion_id = c.organizacion_id
       AND p_by_id.id = c.contacto_id
    LEFT JOIN public.personas AS p_by_legacy
        ON p_by_legacy.organizacion_id = c.organizacion_id
       AND NULLIF(p_by_legacy.metadata ->> 'legacy_contacto_id', '') = c.contacto_id::text
    WHERE c.contacto_id IS NOT NULL
)
UPDATE public.cotizaciones AS c
SET contacto_id = resolved.persona_id
FROM resolved
WHERE c.id = resolved.cotizacion_id
  AND c.contacto_id IS DISTINCT FROM resolved.persona_id;

ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_contacto_org_fkey;
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_contacto_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'cotizaciones_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.cotizaciones
            ADD CONSTRAINT cotizaciones_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

COMMENT ON CONSTRAINT cotizaciones_contacto_org_fkey ON public.cotizaciones
    IS 'Compatibilidad con el modelo de personas: contacto_id referencia public.personas.';

COMMIT;
