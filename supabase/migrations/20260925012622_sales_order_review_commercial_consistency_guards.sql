BEGIN;

CREATE OR REPLACE FUNCTION public.crm_validar_consistencia_comercial_pedido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_cotizacion_moneda text;
BEGIN
    IF NEW.estatus <> 'confirmado' OR OLD.estatus IS NOT DISTINCT FROM NEW.estatus THEN
        RETURN NEW;
    END IF;

    SELECT q.moneda INTO v_cotizacion_moneda
      FROM public.cotizaciones q
     WHERE q.organizacion_id=NEW.organizacion_id AND q.id=NEW.cotizacion_id;
    IF v_cotizacion_moneda IS NULL THEN
        RAISE EXCEPTION 'sales_order_quote_not_found' USING ERRCODE='P0001';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.cotizacion_items qi
          LEFT JOIN public.pedido_venta_items pvi
            ON pvi.organizacion_id=NEW.organizacion_id
           AND pvi.pedido_venta_id=NEW.id
           AND pvi.cotizacion_item_id=qi.id
         WHERE qi.organizacion_id=NEW.organizacion_id
           AND qi.cotizacion_id=NEW.cotizacion_id
           AND pvi.id IS NULL
    ) OR EXISTS (
        SELECT 1
          FROM public.pedido_venta_items pvi
          JOIN public.cotizacion_items qi
            ON qi.organizacion_id=pvi.organizacion_id
           AND qi.id=pvi.cotizacion_item_id
         WHERE pvi.organizacion_id=NEW.organizacion_id
           AND pvi.pedido_venta_id=NEW.id
           AND (
               pvi.cantidad IS DISTINCT FROM qi.cantidad
               OR pvi.precio_unitario_final IS DISTINCT FROM COALESCE(qi.precio_unitario_final,qi.precio_unitario,0)
               OR pvi.moneda IS DISTINCT FROM COALESCE(qi.moneda_aplicada,v_cotizacion_moneda)
               OR pvi.catalog_item_id IS DISTINCT FROM qi.catalog_item_id
           )
    ) THEN
        RAISE EXCEPTION 'sales_order_quote_items_mismatch' USING ERRCODE='P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.cotizacion_items qi
         WHERE qi.organizacion_id=NEW.organizacion_id
           AND qi.cotizacion_id=NEW.cotizacion_id
           AND qi.limite_descuento_porcentaje IS NOT NULL
           AND COALESCE(qi.descuento_porcentaje,0)>qi.limite_descuento_porcentaje
    ) THEN
        RAISE EXCEPTION 'sales_order_discount_exceeds_approved_limit' USING ERRCODE='P0001';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pedidos_venta_commercial_consistency_guard_trg ON public.pedidos_venta;
CREATE TRIGGER pedidos_venta_commercial_consistency_guard_trg
    BEFORE UPDATE OF estatus ON public.pedidos_venta
    FOR EACH ROW EXECUTE FUNCTION public.crm_validar_consistencia_comercial_pedido();

REVOKE ALL ON FUNCTION public.crm_validar_consistencia_comercial_pedido()
    FROM PUBLIC, anon, authenticated;

COMMIT;
