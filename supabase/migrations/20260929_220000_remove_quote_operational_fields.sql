-- La cotizacion solo conserva su vigencia y usa las condiciones/notas
-- configuradas en quote_vendedores. Los datos operativos pertenecen al pedido.

CREATE OR REPLACE FUNCTION public.crm_snapshot_pedido_condiciones_comerciales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.condicion_pago, NEW.dias_credito, NEW.anticipo_porcentaje,
               NEW.permite_entrega_parcial, NEW.fecha_entrega_comprometida,
               NEW.domicilio_entrega, NEW.observaciones_comerciales)
           IS DISTINCT FROM
           ROW(OLD.condicion_pago, OLD.dias_credito, OLD.anticipo_porcentaje,
               OLD.permite_entrega_parcial, OLD.fecha_entrega_comprometida,
               OLD.domicilio_entrega, OLD.observaciones_comerciales) THEN
            RAISE EXCEPTION 'sales_order_commercial_conditions_immutable'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

ALTER TABLE public.cotizaciones
    DROP CONSTRAINT IF EXISTS cotizaciones_condicion_pago_check,
    DROP CONSTRAINT IF EXISTS cotizaciones_dias_credito_check,
    DROP CONSTRAINT IF EXISTS cotizaciones_anticipo_porcentaje_check,
    DROP COLUMN IF EXISTS condicion_pago,
    DROP COLUMN IF EXISTS dias_credito,
    DROP COLUMN IF EXISTS anticipo_porcentaje,
    DROP COLUMN IF EXISTS permite_entrega_parcial,
    DROP COLUMN IF EXISTS fecha_entrega_comprometida,
    DROP COLUMN IF EXISTS domicilio_entrega,
    DROP COLUMN IF EXISTS observaciones_comerciales;

COMMENT ON FUNCTION public.crm_snapshot_pedido_condiciones_comerciales() IS
    'Mantiene inmutables las condiciones operativas del pedido; ya no las copia desde la cotizacion.';
