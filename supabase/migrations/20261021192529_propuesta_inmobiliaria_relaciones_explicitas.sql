-- Relaciones explícitas para separar el dominio comercial de productos y
-- propiedades sin renombrar el modelo técnico de cotizaciones.

ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS dominio_comercial text;

ALTER TABLE public.cotizaciones
    ADD COLUMN IF NOT EXISTS dominio_comercial text,
    ADD COLUMN IF NOT EXISTS operacion_inmobiliaria_id uuid,
    ADD COLUMN IF NOT EXISTS propiedad_id uuid,
    ADD COLUMN IF NOT EXISTS unidad_id uuid;

ALTER TABLE public.cotizacion_items
    ADD COLUMN IF NOT EXISTS propiedad_id uuid,
    ADD COLUMN IF NOT EXISTS unidad_id uuid;

ALTER TABLE public.oportunidades
    DROP CONSTRAINT IF EXISTS oportunidades_dominio_comercial_check,
    ADD CONSTRAINT oportunidades_dominio_comercial_check
        CHECK (dominio_comercial IS NULL OR dominio_comercial IN ('productos_servicios', 'propiedades', 'mixto'));

ALTER TABLE public.cotizaciones
    DROP CONSTRAINT IF EXISTS cotizaciones_dominio_comercial_check,
    ADD CONSTRAINT cotizaciones_dominio_comercial_check
        CHECK (dominio_comercial IS NULL OR dominio_comercial IN ('productos_servicios', 'propiedades', 'mixto'));

-- operaciones_inmobiliarias ya tiene una PK por id. El índice compuesto permite
-- conservar la defensa tenant-scoped de las relaciones nuevas.
CREATE UNIQUE INDEX IF NOT EXISTS operaciones_inmobiliarias_org_id_uidx
    ON public.operaciones_inmobiliarias (organizacion_id, id);

-- Backfill de cotizaciones históricas. Primero se usan relaciones explícitas
-- existentes; metadata queda únicamente como compatibilidad de transición.
WITH quote_candidates AS (
    SELECT
        q.id,
        q.organizacion_id,
        COALESCE(
            CASE WHEN q.metadata->>'unidad_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN (q.metadata->>'unidad_id')::uuid END,
            ci.unidad_id,
            oi.unidad_id
        ) AS unidad_id,
        COALESCE(
            CASE WHEN q.metadata->>'propiedad_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN (q.metadata->>'propiedad_id')::uuid END,
            ci.propiedad_id
        ) AS propiedad_id,
        oi.id AS operacion_inmobiliaria_id
    FROM public.cotizaciones q
    LEFT JOIN LATERAL (
        SELECT ci1.unidad_id, ci1.propiedad_id
        FROM public.cotizacion_items ci1
        WHERE ci1.organizacion_id = q.organizacion_id
          AND ci1.cotizacion_id = q.id
        ORDER BY ci1.orden, ci1.id
        LIMIT 1
    ) ci ON true
    LEFT JOIN LATERAL (
        SELECT oi1.id, oi1.unidad_id
        FROM public.operaciones_inmobiliarias oi1
        WHERE oi1.organizacion_id = q.organizacion_id
          AND oi1.oportunidad_id = q.oportunidad_id
          AND (ci.unidad_id IS NULL OR oi1.unidad_id = ci.unidad_id)
        ORDER BY oi1.actualizado_en DESC, oi1.id DESC
        LIMIT 1
    ) oi ON true
)
UPDATE public.cotizaciones q
SET unidad_id = COALESCE(q.unidad_id, c.unidad_id),
    propiedad_id = COALESCE(q.propiedad_id, c.propiedad_id),
    operacion_inmobiliaria_id = COALESCE(q.operacion_inmobiliaria_id, c.operacion_inmobiliaria_id),
    dominio_comercial = COALESCE(
        q.dominio_comercial,
        CASE WHEN c.unidad_id IS NOT NULL OR c.propiedad_id IS NOT NULL OR c.operacion_inmobiliaria_id IS NOT NULL
             THEN 'propiedades' ELSE 'productos_servicios' END
    )
FROM quote_candidates c
WHERE q.id = c.id;

UPDATE public.cotizacion_items ci
SET unidad_id = COALESCE(
        ci.unidad_id,
        CASE WHEN ci.metadata->>'unidad_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN (ci.metadata->>'unidad_id')::uuid END,
        q.unidad_id,
        (
            SELECT c.unidad_id
            FROM public.catalog_items c
            WHERE c.organizacion_id = ci.organizacion_id
              AND c.id = ci.catalog_item_id
        )
    ),
    propiedad_id = COALESCE(
        ci.propiedad_id,
        CASE WHEN ci.metadata->>'propiedad_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN (ci.metadata->>'propiedad_id')::uuid END,
        q.propiedad_id,
        (
            SELECT c.propiedad_id
            FROM public.catalog_items c
            WHERE c.organizacion_id = ci.organizacion_id
              AND c.id = ci.catalog_item_id
        )
    )
FROM public.cotizaciones q
WHERE q.organizacion_id = ci.organizacion_id
  AND q.id = ci.cotizacion_id;

UPDATE public.oportunidades o
SET dominio_comercial = CASE
    WHEN EXISTS (
        SELECT 1 FROM public.propiedad_unidades u
        WHERE u.oportunidad_id = o.id
    ) OR EXISTS (
        SELECT 1 FROM public.operaciones_inmobiliarias oi
        WHERE oi.organizacion_id = o.organizacion_id
          AND oi.oportunidad_id = o.id
    ) OR EXISTS (
        SELECT 1 FROM public.cotizaciones q
        WHERE q.organizacion_id = o.organizacion_id
          AND q.oportunidad_id = o.id
          AND q.dominio_comercial = 'propiedades'
    ) THEN 'propiedades'
    ELSE 'productos_servicios'
END
WHERE o.dominio_comercial IS NULL;

ALTER TABLE public.cotizaciones
    ADD CONSTRAINT cotizaciones_operacion_inmobiliaria_org_fkey
        FOREIGN KEY (organizacion_id, operacion_inmobiliaria_id)
        REFERENCES public.operaciones_inmobiliarias (organizacion_id, id),
    ADD CONSTRAINT cotizaciones_propiedad_fkey
        FOREIGN KEY (propiedad_id) REFERENCES public.propiedad_desarrollos (id),
    ADD CONSTRAINT cotizaciones_unidad_fkey
        FOREIGN KEY (unidad_id) REFERENCES public.propiedad_unidades (id);

ALTER TABLE public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_propiedad_fkey
        FOREIGN KEY (propiedad_id) REFERENCES public.propiedad_desarrollos (id),
    ADD CONSTRAINT cotizacion_items_unidad_fkey
        FOREIGN KEY (unidad_id) REFERENCES public.propiedad_unidades (id);

CREATE INDEX IF NOT EXISTS oportunidades_org_dominio_comercial_idx
    ON public.oportunidades (organizacion_id, dominio_comercial)
    WHERE dominio_comercial IS NOT NULL;

CREATE INDEX IF NOT EXISTS cotizaciones_org_dominio_comercial_idx
    ON public.cotizaciones (organizacion_id, dominio_comercial, creado_en DESC);

CREATE INDEX IF NOT EXISTS cotizaciones_org_operacion_inmobiliaria_idx
    ON public.cotizaciones (organizacion_id, operacion_inmobiliaria_id)
    WHERE operacion_inmobiliaria_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cotizaciones_org_unidad_idx
    ON public.cotizaciones (organizacion_id, unidad_id)
    WHERE unidad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cotizacion_items_org_unidad_idx
    ON public.cotizacion_items (organizacion_id, unidad_id)
    WHERE unidad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cotizacion_items_org_propiedad_idx
    ON public.cotizacion_items (organizacion_id, propiedad_id)
    WHERE propiedad_id IS NOT NULL;
