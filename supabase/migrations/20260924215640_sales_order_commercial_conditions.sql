BEGIN;

ALTER TABLE public.cotizaciones
    ADD COLUMN condicion_pago text,
    ADD COLUMN dias_credito smallint,
    ADD COLUMN anticipo_porcentaje numeric(5,2),
    ADD COLUMN permite_entrega_parcial boolean NOT NULL DEFAULT false,
    ADD COLUMN fecha_entrega_comprometida date,
    ADD COLUMN domicilio_entrega text,
    ADD COLUMN observaciones_comerciales text,
    ADD CONSTRAINT cotizaciones_condicion_pago_check CHECK (
        condicion_pago IS NULL OR condicion_pago IN (
            'contado', 'credito', 'anticipo_y_saldo', 'parcialidades', 'otro'
        )
    ),
    ADD CONSTRAINT cotizaciones_dias_credito_check CHECK (
        dias_credito IS NULL OR dias_credito BETWEEN 1 AND 365
    ),
    ADD CONSTRAINT cotizaciones_anticipo_porcentaje_check CHECK (
        anticipo_porcentaje IS NULL OR anticipo_porcentaje BETWEEN 0 AND 100
    );

ALTER TABLE public.pedidos_venta
    ADD COLUMN condicion_pago text,
    ADD COLUMN dias_credito smallint,
    ADD COLUMN anticipo_porcentaje numeric(5,2),
    ADD COLUMN permite_entrega_parcial boolean NOT NULL DEFAULT false,
    ADD COLUMN fecha_entrega_comprometida date,
    ADD COLUMN domicilio_entrega text,
    ADD COLUMN observaciones_comerciales text,
    ADD CONSTRAINT pedidos_venta_condicion_pago_check CHECK (
        condicion_pago IS NULL OR condicion_pago IN (
            'contado', 'credito', 'anticipo_y_saldo', 'parcialidades', 'otro'
        )
    ),
    ADD CONSTRAINT pedidos_venta_dias_credito_check CHECK (
        dias_credito IS NULL OR dias_credito BETWEEN 1 AND 365
    ),
    ADD CONSTRAINT pedidos_venta_anticipo_porcentaje_check CHECK (
        anticipo_porcentaje IS NULL OR anticipo_porcentaje BETWEEN 0 AND 100
    );

UPDATE public.pedidos_venta AS pv
   SET condicion_pago = q.condicion_pago,
       dias_credito = q.dias_credito,
       anticipo_porcentaje = q.anticipo_porcentaje,
       permite_entrega_parcial = q.permite_entrega_parcial,
       fecha_entrega_comprometida = q.fecha_entrega_comprometida,
       domicilio_entrega = q.domicilio_entrega,
       observaciones_comerciales = q.observaciones_comerciales
  FROM public.cotizaciones AS q
 WHERE q.organizacion_id = pv.organizacion_id
   AND q.id = pv.cotizacion_id;

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
        RETURN NEW;
    END IF;

    SELECT q.condicion_pago, q.dias_credito, q.anticipo_porcentaje,
           q.permite_entrega_parcial, q.fecha_entrega_comprometida,
           q.domicilio_entrega, q.observaciones_comerciales
      INTO NEW.condicion_pago, NEW.dias_credito, NEW.anticipo_porcentaje,
           NEW.permite_entrega_parcial, NEW.fecha_entrega_comprometida,
           NEW.domicilio_entrega, NEW.observaciones_comerciales
      FROM public.cotizaciones AS q
     WHERE q.organizacion_id = NEW.organizacion_id AND q.id = NEW.cotizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER pedidos_venta_snapshot_condiciones_comerciales
    BEFORE INSERT OR UPDATE ON public.pedidos_venta
    FOR EACH ROW EXECUTE FUNCTION public.crm_snapshot_pedido_condiciones_comerciales();

REVOKE ALL ON FUNCTION public.crm_snapshot_pedido_condiciones_comerciales()
    FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.cotizaciones.condicion_pago IS
    'Condicion de pago comercial de la cotizacion; no registra pagos.';
COMMENT ON COLUMN public.pedidos_venta.condicion_pago IS
    'Snapshot de condiciones comerciales al crear el pedido.';
COMMENT ON COLUMN public.pedidos_venta.domicilio_entrega IS
    'Snapshot textual del domicilio acordado para entregar este pedido.';

COMMIT;
