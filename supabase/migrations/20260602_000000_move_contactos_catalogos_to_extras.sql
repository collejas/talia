BEGIN;

-- Migra la configuración de catálogos manuales desde `contactos.catalogos`
-- hacia `extras.catalogos` y elimina el espejo legado.
WITH config_rows AS (
    SELECT
        id,
        COALESCE(config, '{}'::jsonb) AS cfg,
        COALESCE(config, '{}'::jsonb) #> '{contactos,catalogos}' AS legacy_catalogos,
        COALESCE(config, '{}'::jsonb) #> '{extras,catalogos}' AS extras_catalogos
    FROM public.organizaciones
    WHERE COALESCE(config, '{}'::jsonb) #> '{contactos,catalogos}' IS NOT NULL
)
UPDATE public.organizaciones o
SET config = (
    (
        CASE
            WHEN config_rows.extras_catalogos IS NULL OR config_rows.extras_catalogos = '{}'::jsonb
                THEN jsonb_set(config_rows.cfg, '{extras,catalogos}', config_rows.legacy_catalogos, true)
            ELSE config_rows.cfg
        END
    ) #- '{contactos,catalogos}'
)
FROM config_rows
WHERE o.id = config_rows.id;

COMMIT;
