BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_marcas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT catalog_marcas_nombre_check CHECK (length(btrim(nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_marcas_org_nombre_unq
    ON public.catalog_marcas (organizacion_id, lower(btrim(nombre)));

CREATE UNIQUE INDEX IF NOT EXISTS catalog_marcas_org_id_unq
    ON public.catalog_marcas (organizacion_id, id);

CREATE INDEX IF NOT EXISTS catalog_marcas_org_activo_nombre_idx
    ON public.catalog_marcas (organizacion_id, activo, lower(nombre));

ALTER TABLE public.catalog_items
    ADD COLUMN IF NOT EXISTS es_vendible boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS marca_id uuid;

ALTER TABLE public.catalog_items
    DROP CONSTRAINT IF EXISTS catalog_items_marca_org_fkey;

ALTER TABLE public.catalog_items
    ADD CONSTRAINT catalog_items_marca_org_fkey
    FOREIGN KEY (organizacion_id, marca_id)
    REFERENCES public.catalog_marcas (organizacion_id, id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS catalog_items_org_vendible_idx
    ON public.catalog_items (organizacion_id, es_vendible, activo, tipo);

CREATE INDEX IF NOT EXISTS catalog_items_org_marca_idx
    ON public.catalog_items (organizacion_id, marca_id);

COMMENT ON COLUMN public.catalog_items.es_vendible IS
    'Indica si el producto puede utilizarse en cotizaciones y ventas; es independiente de activo y activo_compra.';
COMMENT ON COLUMN public.catalog_items.marca_id IS
    'Marca reutilizable del producto, perteneciente a la misma organización.';
COMMENT ON TABLE public.catalog_marcas IS
    'Catálogo de marcas reutilizables, aislado por organización.';

CREATE OR REPLACE FUNCTION public.crm_validate_sellable_catalog_item()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_active boolean;
    v_sellable boolean;
BEGIN
    IF NEW.catalog_item_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT ci.activo, ci.es_vendible
      INTO v_active, v_sellable
      FROM public.catalog_items ci
     WHERE ci.organizacion_id = NEW.organizacion_id
       AND ci.id = NEW.catalog_item_id;

    IF NOT FOUND OR NOT COALESCE(v_active, false) OR NOT COALESCE(v_sellable, false) THEN
        RAISE EXCEPTION 'catalog_item_not_sellable'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cotizacion_items_validate_sellable_catalog_item
    ON public.cotizacion_items;
CREATE TRIGGER cotizacion_items_validate_sellable_catalog_item
    BEFORE INSERT OR UPDATE OF catalog_item_id, organizacion_id
    ON public.cotizacion_items
    FOR EACH ROW
    EXECUTE FUNCTION public.crm_validate_sellable_catalog_item();

ALTER TABLE public.catalog_marcas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.catalog_marcas TO authenticated;

DROP POLICY IF EXISTS catalog_marcas_select_org ON public.catalog_marcas;
CREATE POLICY catalog_marcas_select_org
    ON public.catalog_marcas
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

DROP POLICY IF EXISTS catalog_marcas_insert_admin ON public.catalog_marcas;
CREATE POLICY catalog_marcas_insert_admin
    ON public.catalog_marcas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.es_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS catalog_marcas_update_admin ON public.catalog_marcas;
CREATE POLICY catalog_marcas_update_admin
    ON public.catalog_marcas
    FOR UPDATE
    TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.es_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.es_admin((SELECT auth.uid()))
    );

COMMIT;
