BEGIN;

-- ============================================================================
-- Oportunidades: referencia canónica a persona
-- ============================================================================

ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS persona_id uuid;

UPDATE public.oportunidades
SET persona_id = contacto_principal_id
WHERE persona_id IS NULL
  AND contacto_principal_id IS NOT NULL;

ALTER TABLE public.oportunidades
    DROP CONSTRAINT IF EXISTS oportunidades_persona_id_fkey;

ALTER TABLE public.oportunidades
    ADD CONSTRAINT oportunidades_persona_id_fkey
    FOREIGN KEY (persona_id)
    REFERENCES public.personas (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS oportunidades_persona_id_idx
    ON public.oportunidades (organizacion_id, persona_id);

COMMENT ON COLUMN public.oportunidades.persona_id
    IS 'Persona humana canónica asociada a la oportunidad.';

-- ============================================================================
-- Unidades inmobiliarias: vínculo a oportunidad y catálogo
-- ============================================================================

ALTER TABLE public.propiedad_unidades
    ADD COLUMN IF NOT EXISTS oportunidad_id uuid,
    ADD COLUMN IF NOT EXISTS catalog_item_id uuid;

ALTER TABLE public.propiedad_unidades
    DROP CONSTRAINT IF EXISTS propiedad_unidades_oportunidad_id_fkey;

ALTER TABLE public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_oportunidad_id_fkey
    FOREIGN KEY (oportunidad_id)
    REFERENCES public.oportunidades (id)
    ON DELETE SET NULL;

ALTER TABLE public.propiedad_unidades
    DROP CONSTRAINT IF EXISTS propiedad_unidades_catalog_item_id_fkey;

ALTER TABLE public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_catalog_item_id_fkey
    FOREIGN KEY (catalog_item_id)
    REFERENCES public.catalog_items (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS propiedad_unidades_oportunidad_idx
    ON public.propiedad_unidades (oportunidad_id);

CREATE INDEX IF NOT EXISTS propiedad_unidades_catalog_item_idx
    ON public.propiedad_unidades (catalog_item_id);

COMMENT ON COLUMN public.propiedad_unidades.oportunidad_id
    IS 'Oportunidad que respalda el estado comercial actual de la unidad.';

COMMENT ON COLUMN public.propiedad_unidades.catalog_item_id
    IS 'Catalog item asociado a la unidad para el flujo comercial.';

-- ============================================================================
-- Catálogo: referencias directas a inventario y CRM
-- ============================================================================

ALTER TABLE public.catalog_items
    ADD COLUMN IF NOT EXISTS propiedad_id uuid,
    ADD COLUMN IF NOT EXISTS unidad_id uuid,
    ADD COLUMN IF NOT EXISTS oportunidad_id uuid,
    ADD COLUMN IF NOT EXISTS persona_id uuid;

ALTER TABLE public.catalog_items
    DROP CONSTRAINT IF EXISTS catalog_items_propiedad_id_fkey;

ALTER TABLE public.catalog_items
    ADD CONSTRAINT catalog_items_propiedad_id_fkey
    FOREIGN KEY (propiedad_id)
    REFERENCES public.propiedad_desarrollos (id)
    ON DELETE SET NULL;

ALTER TABLE public.catalog_items
    DROP CONSTRAINT IF EXISTS catalog_items_unidad_id_fkey;

ALTER TABLE public.catalog_items
    ADD CONSTRAINT catalog_items_unidad_id_fkey
    FOREIGN KEY (unidad_id)
    REFERENCES public.propiedad_unidades (id)
    ON DELETE SET NULL;

ALTER TABLE public.catalog_items
    DROP CONSTRAINT IF EXISTS catalog_items_oportunidad_id_fkey;

ALTER TABLE public.catalog_items
    ADD CONSTRAINT catalog_items_oportunidad_id_fkey
    FOREIGN KEY (oportunidad_id)
    REFERENCES public.oportunidades (id)
    ON DELETE SET NULL;

ALTER TABLE public.catalog_items
    DROP CONSTRAINT IF EXISTS catalog_items_persona_id_fkey;

ALTER TABLE public.catalog_items
    ADD CONSTRAINT catalog_items_persona_id_fkey
    FOREIGN KEY (persona_id)
    REFERENCES public.personas (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS catalog_items_propiedad_idx
    ON public.catalog_items (organizacion_id, propiedad_id);

CREATE INDEX IF NOT EXISTS catalog_items_unidad_idx
    ON public.catalog_items (organizacion_id, unidad_id);

CREATE INDEX IF NOT EXISTS catalog_items_oportunidad_idx
    ON public.catalog_items (organizacion_id, oportunidad_id);

CREATE INDEX IF NOT EXISTS catalog_items_persona_idx
    ON public.catalog_items (organizacion_id, persona_id);

COMMENT ON COLUMN public.catalog_items.propiedad_id
    IS 'Desarrollo o propiedad asociada al catalog item de una unidad.';

COMMENT ON COLUMN public.catalog_items.unidad_id
    IS 'Unidad inmobiliaria asociada al catalog item.';

COMMENT ON COLUMN public.catalog_items.oportunidad_id
    IS 'Oportunidad comercial asociada al catalog item.';

COMMENT ON COLUMN public.catalog_items.persona_id
    IS 'Persona canónica vinculada al catalog item para trazabilidad comercial.';

-- ============================================================================
-- Backfill desde metadata ya existente
-- ============================================================================

UPDATE public.catalog_items
SET propiedad_id = COALESCE(
        propiedad_id,
        CASE
            WHEN NULLIF(metadatos->>'propiedad_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                 AND EXISTS (
                    SELECT 1
                    FROM public.propiedad_desarrollos pd
                    WHERE pd.id = NULLIF(metadatos->>'propiedad_id', '')::uuid
                 )
                THEN NULLIF(metadatos->>'propiedad_id', '')::uuid
            ELSE NULL
        END
    ),
    unidad_id = COALESCE(
        unidad_id,
        CASE
            WHEN NULLIF(metadatos->>'unidad_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                 AND EXISTS (
                    SELECT 1
                    FROM public.propiedad_unidades pu
                    WHERE pu.id = NULLIF(metadatos->>'unidad_id', '')::uuid
                 )
                THEN NULLIF(metadatos->>'unidad_id', '')::uuid
            ELSE NULL
        END
    ),
    oportunidad_id = COALESCE(
        oportunidad_id,
        CASE
            WHEN NULLIF(metadatos->>'oportunidad_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                 AND EXISTS (
                    SELECT 1
                    FROM public.oportunidades o
                    WHERE o.id = NULLIF(metadatos->>'oportunidad_id', '')::uuid
                 )
                THEN NULLIF(metadatos->>'oportunidad_id', '')::uuid
            ELSE NULL
        END
    ),
    persona_id = COALESCE(
        persona_id,
        CASE
            WHEN NULLIF(metadatos->>'persona_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                 AND EXISTS (
                    SELECT 1
                    FROM public.personas p
                    WHERE p.id = NULLIF(metadatos->>'persona_id', '')::uuid
                 )
                THEN NULLIF(metadatos->>'persona_id', '')::uuid
            ELSE NULL
        END
    )
WHERE metadatos ? 'propiedad_id'
   OR metadatos ? 'unidad_id'
   OR metadatos ? 'oportunidad_id'
   OR metadatos ? 'persona_id';

WITH latest_catalog_by_unidad AS (
    SELECT DISTINCT ON (ci.unidad_id)
        ci.id,
        ci.unidad_id,
        ci.oportunidad_id
    FROM public.catalog_items ci
    WHERE ci.unidad_id IS NOT NULL
    ORDER BY ci.unidad_id, ci.actualizado_en DESC, ci.creado_en DESC
)
UPDATE public.propiedad_unidades u
SET catalog_item_id = lcu.id,
    oportunidad_id = COALESCE(u.oportunidad_id, lcu.oportunidad_id)
FROM latest_catalog_by_unidad lcu
WHERE u.id = lcu.unidad_id
  AND (
    u.catalog_item_id IS DISTINCT FROM lcu.id
    OR (u.oportunidad_id IS NULL AND lcu.oportunidad_id IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS public.propiedad_unidad_movimientos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    unidad_id uuid NOT NULL REFERENCES public.propiedad_unidades(id),
    oportunidad_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
    persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
    cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
    estado_anterior public.propiedad_status NOT NULL,
    estado_nuevo public.propiedad_status NOT NULL,
    precio numeric,
    moneda character(3) NOT NULL DEFAULT 'MXN',
    motivo text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    creado_por uuid
);

CREATE INDEX IF NOT EXISTS propiedad_unidad_movimientos_unidad_idx
    ON public.propiedad_unidad_movimientos (organizacion_id, unidad_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS propiedad_unidad_movimientos_oportunidad_idx
    ON public.propiedad_unidad_movimientos (organizacion_id, oportunidad_id);

CREATE INDEX IF NOT EXISTS propiedad_unidad_movimientos_persona_idx
    ON public.propiedad_unidad_movimientos (organizacion_id, persona_id);

COMMENT ON TABLE public.propiedad_unidad_movimientos
    IS 'Historial de estados comerciales de las unidades inmobiliarias.';

COMMENT ON COLUMN public.propiedad_unidad_movimientos.estado_anterior
    IS 'Estado comercial anterior de la unidad antes de la transición.';

COMMENT ON COLUMN public.propiedad_unidad_movimientos.estado_nuevo
    IS 'Estado comercial nuevo de la unidad después de la transición.';

COMMIT;
