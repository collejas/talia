BEGIN;

ALTER TABLE public.lineas_de_negocio
    ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.familias_productos
    ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.modelos_productos
    ADD COLUMN IF NOT EXISTS codigo text;

UPDATE public.lineas_de_negocio
SET codigo = 'LIN-' || upper(replace(substr(id::text, 1, 8), '-', ''))
WHERE NULLIF(btrim(codigo), '') IS NULL;

UPDATE public.familias_productos
SET codigo = 'FAM-' || upper(replace(substr(id::text, 1, 8), '-', ''))
WHERE NULLIF(btrim(codigo), '') IS NULL;

UPDATE public.modelos_productos
SET codigo = 'MOD-' || upper(replace(substr(id::text, 1, 8), '-', ''))
WHERE NULLIF(btrim(codigo), '') IS NULL;

UPDATE public.catalog_items
SET codigo = 'PROD-' || upper(replace(substr(id::text, 1, 8), '-', ''))
WHERE NULLIF(btrim(codigo), '') IS NULL;

ALTER TABLE public.lineas_de_negocio
    ADD CONSTRAINT lineas_de_negocio_codigo_check
    CHECK (codigo IS NULL OR btrim(codigo) <> '');
ALTER TABLE public.familias_productos
    ADD CONSTRAINT familias_productos_codigo_check
    CHECK (codigo IS NULL OR btrim(codigo) <> '');
ALTER TABLE public.modelos_productos
    ADD CONSTRAINT modelos_productos_codigo_check
    CHECK (codigo IS NULL OR btrim(codigo) <> '');
ALTER TABLE public.catalog_items
    ADD CONSTRAINT catalog_items_codigo_check
    CHECK (codigo IS NULL OR btrim(codigo) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS lineas_de_negocio_org_codigo_unq
    ON public.lineas_de_negocio (organizacion_id, lower(btrim(codigo)))
    WHERE codigo IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS familias_productos_org_codigo_unq
    ON public.familias_productos (organizacion_id, lower(btrim(codigo)))
    WHERE codigo IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS modelos_productos_org_codigo_unq
    ON public.modelos_productos (organizacion_id, lower(btrim(codigo)))
    WHERE codigo IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_catalog_hierarchy_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_org uuid;
    parent_linea uuid;
    parent_familia uuid;
BEGIN
    IF TG_TABLE_NAME = 'familias_productos' THEN
        SELECT organizacion_id INTO parent_org FROM public.lineas_de_negocio WHERE id = NEW.linea_id;
        IF parent_org IS NULL OR parent_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'familia_linea_tenant_mismatch';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.catalog_items
            WHERE familia_id = NEW.id
              AND linea_id IS DISTINCT FROM NEW.linea_id
        ) THEN
            RAISE EXCEPTION 'familia_has_products_in_other_linea';
        END IF;
    ELSIF TG_TABLE_NAME = 'modelos_productos' AND NEW.familia_id IS NOT NULL THEN
        SELECT organizacion_id, linea_id INTO parent_org, parent_linea
        FROM public.familias_productos WHERE id = NEW.familia_id;
        IF parent_org IS NULL OR parent_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'modelo_familia_tenant_mismatch';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.catalog_items
            WHERE modelo_id = NEW.id
              AND familia_id IS DISTINCT FROM NEW.familia_id
        ) THEN
            RAISE EXCEPTION 'modelo_has_products_in_other_familia';
        END IF;
    ELSIF TG_TABLE_NAME = 'catalog_items' AND TG_OP = 'INSERT' THEN
        IF NEW.linea_id IS NOT NULL THEN
            SELECT organizacion_id INTO parent_org FROM public.lineas_de_negocio WHERE id = NEW.linea_id;
            IF parent_org IS NULL OR parent_org <> NEW.organizacion_id THEN
                RAISE EXCEPTION 'producto_linea_tenant_mismatch';
            END IF;
        END IF;
        IF NEW.familia_id IS NOT NULL THEN
            SELECT organizacion_id, linea_id INTO parent_org, parent_linea
            FROM public.familias_productos WHERE id = NEW.familia_id;
            IF parent_org IS NULL OR parent_org <> NEW.organizacion_id
               OR (NEW.linea_id IS NOT NULL AND parent_linea <> NEW.linea_id) THEN
                RAISE EXCEPTION 'producto_familia_linea_mismatch';
            END IF;
        END IF;
        IF NEW.modelo_id IS NOT NULL THEN
            SELECT organizacion_id, familia_id INTO parent_org, parent_familia
            FROM public.modelos_productos WHERE id = NEW.modelo_id;
            IF parent_org IS NULL OR parent_org <> NEW.organizacion_id
               OR (NEW.familia_id IS NOT NULL AND parent_familia IS NOT NULL AND parent_familia <> NEW.familia_id) THEN
                RAISE EXCEPTION 'producto_modelo_familia_mismatch';
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'catalog_items'
      AND (NEW.organizacion_id IS DISTINCT FROM OLD.organizacion_id
           OR NEW.linea_id IS DISTINCT FROM OLD.linea_id
           OR NEW.familia_id IS DISTINCT FROM OLD.familia_id
           OR NEW.modelo_id IS DISTINCT FROM OLD.modelo_id) THEN
        IF NEW.linea_id IS NOT NULL THEN
            SELECT organizacion_id INTO parent_org FROM public.lineas_de_negocio WHERE id = NEW.linea_id;
            IF parent_org IS NULL OR parent_org <> NEW.organizacion_id THEN
                RAISE EXCEPTION 'producto_linea_tenant_mismatch';
            END IF;
        END IF;
        IF NEW.familia_id IS NOT NULL THEN
            SELECT organizacion_id, linea_id INTO parent_org, parent_linea
            FROM public.familias_productos WHERE id = NEW.familia_id;
            IF parent_org IS NULL OR parent_org <> NEW.organizacion_id
               OR (NEW.linea_id IS NOT NULL AND parent_linea <> NEW.linea_id) THEN
                RAISE EXCEPTION 'producto_familia_linea_mismatch';
            END IF;
        END IF;
        IF NEW.modelo_id IS NOT NULL THEN
            SELECT organizacion_id, familia_id INTO parent_org, parent_familia
            FROM public.modelos_productos WHERE id = NEW.modelo_id;
            IF parent_org IS NULL OR parent_org <> NEW.organizacion_id
               OR (NEW.familia_id IS NOT NULL AND parent_familia IS NOT NULL AND parent_familia <> NEW.familia_id) THEN
                RAISE EXCEPTION 'producto_modelo_familia_mismatch';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS familias_productos_validate_hierarchy ON public.familias_productos;
CREATE TRIGGER familias_productos_validate_hierarchy
BEFORE INSERT OR UPDATE OF organizacion_id, linea_id ON public.familias_productos
FOR EACH ROW EXECUTE FUNCTION public.validate_catalog_hierarchy_tenant();

DROP TRIGGER IF EXISTS modelos_productos_validate_hierarchy ON public.modelos_productos;
CREATE TRIGGER modelos_productos_validate_hierarchy
BEFORE INSERT OR UPDATE OF organizacion_id, familia_id ON public.modelos_productos
FOR EACH ROW EXECUTE FUNCTION public.validate_catalog_hierarchy_tenant();

DROP TRIGGER IF EXISTS catalog_items_validate_hierarchy ON public.catalog_items;
CREATE TRIGGER catalog_items_validate_hierarchy
BEFORE INSERT OR UPDATE OF organizacion_id, linea_id, familia_id, modelo_id ON public.catalog_items
FOR EACH ROW EXECUTE FUNCTION public.validate_catalog_hierarchy_tenant();

COMMENT ON COLUMN public.catalog_items.codigo IS 'Identidad estable del producto dentro del tenant; no debe cambiar por cambios de nombre.';
COMMENT ON COLUMN public.lineas_de_negocio.codigo IS 'Identidad estable de la línea dentro del tenant.';
COMMENT ON COLUMN public.familias_productos.codigo IS 'Identidad estable de la familia dentro del tenant.';
COMMENT ON COLUMN public.modelos_productos.codigo IS 'Identidad estable del modelo dentro del tenant.';

COMMIT;
