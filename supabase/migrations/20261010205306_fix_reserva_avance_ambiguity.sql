BEGIN;

CREATE OR REPLACE FUNCTION public.crm_guardar_avance_reserva(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_precio_acordado numeric DEFAULT NULL,
    p_fecha_limite_reserva timestamptz DEFAULT NULL,
    p_forma_adquisicion text DEFAULT NULL,
    p_reserva_importe numeric DEFAULT NULL,
    p_condiciones_reserva text DEFAULT NULL
)
RETURNS TABLE (
    operacion_id uuid,
    unidad_id uuid,
    estado text,
    precio_acordado numeric,
    fecha_limite_reserva timestamptz,
    forma_adquisicion text,
    reserva_importe numeric,
    condiciones_reserva text,
    actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_forma text;
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;

    v_forma := lower(nullif(btrim(p_forma_adquisicion), ''));
    IF v_forma IS NOT NULL
       AND v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN
        RAISE EXCEPTION 'property_acquisition_method_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF p_precio_acordado IS NOT NULL AND p_precio_acordado < 0 THEN
        RAISE EXCEPTION 'property_agreed_price_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF p_reserva_importe IS NOT NULL AND p_reserva_importe < 0 THEN
        RAISE EXCEPTION 'property_reservation_amount_invalid' USING ERRCODE = 'P0001';
    END IF;

    SELECT op.* INTO v_operation
      FROM public.operaciones_inmobiliarias AS op
     WHERE op.organizacion_id = p_organizacion_id
       AND op.unidad_id = p_unidad_id
       AND op.estado = 'apartada'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_apartado_not_found' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.operaciones_inmobiliarias AS op
       SET precio_acordado = COALESCE(p_precio_acordado, op.precio_acordado),
           fecha_limite_reserva = COALESCE(p_fecha_limite_reserva, op.fecha_limite_reserva),
           forma_adquisicion = COALESCE(v_forma, op.forma_adquisicion),
           reserva_importe = COALESCE(p_reserva_importe, op.reserva_importe),
           condiciones_reserva = COALESCE(p_condiciones_reserva, op.condiciones_reserva),
           actualizado_en = now()
     WHERE op.id = v_operation.id
     RETURNING op.* INTO v_operation;

    RETURN QUERY SELECT v_operation.id, v_operation.unidad_id, v_operation.estado,
                        v_operation.precio_acordado, v_operation.fecha_limite_reserva,
                        v_operation.forma_adquisicion, v_operation.reserva_importe,
                        v_operation.condiciones_reserva, v_operation.actualizado_en;
END;
$function$;

COMMIT;
