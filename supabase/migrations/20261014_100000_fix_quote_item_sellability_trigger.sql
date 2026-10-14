BEGIN;

-- Las líneas pueden llegar sin organizacion_id desde clientes existentes. La
-- cotización es la fuente de verdad para resolver el tenant antes de validar
-- la vendibilidad del producto.
CREATE OR REPLACE FUNCTION public.crm_validate_sellable_catalog_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_active boolean;
    v_sellable boolean;
    v_organizacion_id uuid := NEW.organizacion_id;
BEGIN
    IF NEW.catalog_item_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_organizacion_id IS NULL AND NEW.cotizacion_id IS NOT NULL THEN
        SELECT c.organizacion_id
          INTO v_organizacion_id
          FROM public.cotizaciones c
         WHERE c.id = NEW.cotizacion_id;
    END IF;

    SELECT ci.activo, ci.es_vendible
      INTO v_active, v_sellable
      FROM public.catalog_items ci
     WHERE ci.organizacion_id = v_organizacion_id
       AND ci.id = NEW.catalog_item_id;

    IF NOT FOUND OR NOT COALESCE(v_active, false) OR NOT COALESCE(v_sellable, false) THEN
        RAISE EXCEPTION 'catalog_item_not_sellable'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.crm_validate_sellable_catalog_item() IS
    'Valida que el producto de una línea de cotización esté activo y sea vendible, resolviendo la organización desde la cotización si es necesario.';

COMMIT;
