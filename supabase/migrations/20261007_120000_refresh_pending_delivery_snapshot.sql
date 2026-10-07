BEGIN;

-- Los pedidos que todavía no entran a revisión pueden volver a tomar la
-- dirección de envío vigente de la empresa. Una vez completos o enviados a
-- revisión, el snapshot permanece inmutable.
CREATE OR REPLACE FUNCTION public.crm_snapshot_pedido_condiciones_comerciales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_direccion public.direcciones%ROWTYPE;
    v_notas text;
    v_faltantes text[];
    v_puede_refrescar boolean := false;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_puede_refrescar := NEW.estatus = 'pendiente_confirmacion'
            AND NEW.estado_formalizacion IN ('pendiente', 'sin_enviar')
            AND NOT COALESCE(OLD.domicilio_entrega_completo, false);

        IF ROW(NEW.condicion_pago, NEW.dias_credito, NEW.anticipo_porcentaje,
               NEW.permite_entrega_parcial, NEW.fecha_entrega_comprometida,
               NEW.observaciones_comerciales)
           IS DISTINCT FROM
           ROW(OLD.condicion_pago, OLD.dias_credito, OLD.anticipo_porcentaje,
               OLD.permite_entrega_parcial, OLD.fecha_entrega_comprometida,
               OLD.observaciones_comerciales) THEN
            RAISE EXCEPTION 'sales_order_commercial_conditions_immutable'
                USING ERRCODE = 'P0001';
        END IF;

        IF OLD.domicilio_entrega_direccion_id IS NOT NULL
           AND NOT v_puede_refrescar
           AND ROW(NEW.domicilio_entrega_direccion_id, NEW.domicilio_entrega_pais,
                   NEW.domicilio_entrega_entidad, NEW.domicilio_entrega_municipio,
                   NEW.domicilio_entrega_localidad, NEW.domicilio_entrega_tipo_vialidad,
                   NEW.domicilio_entrega_nombre_vialidad, NEW.domicilio_entrega_numero_exterior,
                   NEW.domicilio_entrega_numero_interior, NEW.domicilio_entrega_colonia,
                   NEW.domicilio_entrega_codigo_postal, NEW.domicilio_entrega_referencias,
                   NEW.domicilio_entrega_completo, NEW.domicilio_entrega_faltantes)
              IS DISTINCT FROM
              ROW(OLD.domicilio_entrega_direccion_id, OLD.domicilio_entrega_pais,
                  OLD.domicilio_entrega_entidad, OLD.domicilio_entrega_municipio,
                  OLD.domicilio_entrega_localidad, OLD.domicilio_entrega_tipo_vialidad,
                  OLD.domicilio_entrega_nombre_vialidad, OLD.domicilio_entrega_numero_exterior,
                  OLD.domicilio_entrega_numero_interior, OLD.domicilio_entrega_colonia,
                  OLD.domicilio_entrega_codigo_postal, OLD.domicilio_entrega_referencias,
                  OLD.domicilio_entrega_completo, OLD.domicilio_entrega_faltantes) THEN
            RAISE EXCEPTION 'sales_order_delivery_snapshot_immutable'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.domicilio_entrega_direccion_id IS NULL OR v_puede_refrescar THEN
        SELECT d.*
          INTO v_direccion
          FROM public.cotizaciones q
          JOIN public.cuenta_direcciones cd
            ON cd.organizacion_id = q.organizacion_id
           AND cd.cuenta_id = q.cuenta_id
           AND cd.tipo_relacion = 'envio'
           AND cd.activo IS TRUE
          JOIN public.direcciones d
            ON d.organizacion_id = cd.organizacion_id
           AND d.id = cd.direccion_id
         WHERE q.organizacion_id = NEW.organizacion_id
           AND q.id = NEW.cotizacion_id
         ORDER BY cd.es_principal DESC, cd.actualizado_en DESC, cd.id
         LIMIT 1;

        SELECT cd.notas
          INTO v_notas
          FROM public.cuenta_direcciones cd
         WHERE cd.organizacion_id = NEW.organizacion_id
           AND cd.cuenta_id = (
               SELECT q.cuenta_id
                 FROM public.cotizaciones q
                WHERE q.organizacion_id = NEW.organizacion_id
                  AND q.id = NEW.cotizacion_id
           )
           AND cd.tipo_relacion = 'envio'
           AND cd.activo IS TRUE
         ORDER BY cd.es_principal DESC, cd.actualizado_en DESC, cd.id
         LIMIT 1;

        IF FOUND THEN
            v_faltantes := ARRAY_REMOVE(ARRAY[
                CASE WHEN NULLIF(btrim(v_direccion.pais), '') IS NULL THEN 'País' END,
                CASE WHEN NULLIF(btrim(v_direccion.entidad), '') IS NULL THEN 'Estado' END,
                CASE WHEN NULLIF(btrim(v_direccion.municipio), '') IS NULL THEN 'Municipio' END,
                CASE WHEN NULLIF(btrim(v_direccion.nombre_vialidad), '') IS NULL THEN 'Vialidad' END,
                CASE WHEN NULLIF(btrim(v_direccion.numero_exterior), '') IS NULL THEN 'Número exterior' END,
                CASE WHEN NULLIF(btrim(v_direccion.colonia), '') IS NULL THEN 'Colonia' END,
                CASE WHEN NULLIF(btrim(v_direccion.codigo_postal), '') IS NULL THEN 'Código postal' END
            ]::text[], NULL);
            NEW.domicilio_entrega_direccion_id := v_direccion.id;
            NEW.domicilio_entrega_pais := v_direccion.pais;
            NEW.domicilio_entrega_entidad := v_direccion.entidad;
            NEW.domicilio_entrega_municipio := v_direccion.municipio;
            NEW.domicilio_entrega_localidad := v_direccion.localidad;
            NEW.domicilio_entrega_tipo_vialidad := v_direccion.tipo_vialidad;
            NEW.domicilio_entrega_nombre_vialidad := v_direccion.nombre_vialidad;
            NEW.domicilio_entrega_numero_exterior := v_direccion.numero_exterior;
            NEW.domicilio_entrega_numero_interior := v_direccion.numero_interior;
            NEW.domicilio_entrega_colonia := v_direccion.colonia;
            NEW.domicilio_entrega_codigo_postal := v_direccion.codigo_postal;
            NEW.domicilio_entrega_referencias := v_notas;
            NEW.domicilio_entrega_faltantes := v_faltantes;
            NEW.domicilio_entrega_completo := cardinality(v_faltantes) = 0;
            NEW.domicilio_entrega := concat_ws(', ',
                NULLIF(v_direccion.nombre_vialidad, ''),
                NULLIF(v_direccion.numero_exterior, ''),
                NULLIF(v_direccion.colonia, ''),
                NULLIF(v_direccion.municipio, ''),
                NULLIF(v_direccion.entidad, ''),
                NULLIF(v_direccion.codigo_postal, ''));
        ELSIF TG_OP = 'INSERT' OR v_puede_refrescar THEN
            NEW.domicilio_entrega_direccion_id := NULL;
            NEW.domicilio_entrega_completo := false;
            NEW.domicilio_entrega_faltantes := ARRAY['Dirección de envío de la empresa'];
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pedidos_venta_snapshot_condiciones ON public.pedidos_venta;
CREATE TRIGGER trg_pedidos_venta_snapshot_condiciones
    BEFORE INSERT OR UPDATE ON public.pedidos_venta
    FOR EACH ROW EXECUTE FUNCTION public.crm_snapshot_pedido_condiciones_comerciales();

-- Al crear o modificar una dirección de empresa, refrescar los pedidos que
-- todavía están pendientes de confirmación y conservan un snapshot incompleto.
CREATE OR REPLACE FUNCTION public.crm_refresh_pending_order_delivery_from_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_cuenta_id uuid;
    v_direccion_id uuid := COALESCE(NEW.id, OLD.id);
    v_organizacion_id uuid := COALESCE(NEW.organizacion_id, OLD.organizacion_id);
BEGIN
    IF TG_TABLE_NAME = 'cuenta_direcciones' THEN
        v_cuenta_id := COALESCE(NEW.cuenta_id, OLD.cuenta_id);
    END IF;
    UPDATE public.pedidos_venta pv
       SET actualizado_en = pv.actualizado_en
      FROM public.cotizaciones q
     WHERE pv.organizacion_id = v_organizacion_id
       AND pv.cotizacion_id = q.id
       AND q.organizacion_id = v_organizacion_id
       AND (
           q.cuenta_id = v_cuenta_id
           OR (
               v_cuenta_id IS NULL
               AND q.cuenta_id IN (
                   SELECT cd.cuenta_id
                     FROM public.cuenta_direcciones cd
                    WHERE cd.organizacion_id = v_organizacion_id
                      AND cd.direccion_id = v_direccion_id
               )
           )
       )
       AND pv.estatus = 'pendiente_confirmacion'
       AND pv.estado_formalizacion IN ('pendiente', 'sin_enviar')
       AND NOT COALESCE(pv.domicilio_entrega_completo, false);
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_pending_order_delivery_from_account_directions ON public.cuenta_direcciones;
CREATE TRIGGER trg_refresh_pending_order_delivery_from_account_directions
    AFTER INSERT OR UPDATE OF direccion_id, tipo_relacion, activo, es_principal OR DELETE
    ON public.cuenta_direcciones
    FOR EACH ROW EXECUTE FUNCTION public.crm_refresh_pending_order_delivery_from_account();

DROP TRIGGER IF EXISTS trg_refresh_pending_order_delivery_from_directions ON public.direcciones;
CREATE TRIGGER trg_refresh_pending_order_delivery_from_directions
    AFTER UPDATE ON public.direcciones
    FOR EACH ROW EXECUTE FUNCTION public.crm_refresh_pending_order_delivery_from_account();

COMMIT;
