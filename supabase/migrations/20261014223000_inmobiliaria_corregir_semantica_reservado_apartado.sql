-- La interfaz distingue dos acciones:
--   Reservado: captura breve, sin expediente documental (borrador).
--   Apartado: expediente detallado, documentos y validacion.
-- Los RPC anteriores tenian estos estados invertidos.

CREATE OR REPLACE FUNCTION public.crm_apartar_propiedad(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_cliente_principal_id uuid,
    p_agente_usuario_id uuid DEFAULT NULL::uuid,
    p_oportunidad_id uuid DEFAULT NULL::uuid,
    p_apartado_horas smallint DEFAULT 48,
    p_forma_adquisicion text DEFAULT 'por_definir'::text,
    p_apartado_motivo text DEFAULT NULL::text,
    p_precio_ofrecido numeric DEFAULT NULL::numeric,
    p_moneda text DEFAULT 'MXN'::text
)
RETURNS TABLE(
    operacion_id uuid,
    unidad_id uuid,
    estado text,
    apartado_iniciado_en timestamptz,
    apartado_vencimiento_en timestamptz,
    cliente_principal_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_unidad public.propiedad_unidades%ROWTYPE;
    v_persona public.personas%ROWTYPE;
    v_now timestamptz := now();
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_forma text := lower(coalesce(nullif(btrim(p_forma_adquisicion), ''), 'por_definir'));
    v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'MXN'));
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_apartado_horas NOT IN (24, 48, 72) THEN
        RAISE EXCEPTION 'property_apartado_hours_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN
        RAISE EXCEPTION 'property_acquisition_method_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_moneda) <> 3 THEN
        RAISE EXCEPTION 'property_currency_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF nullif(btrim(coalesce(p_apartado_motivo, '')), '') IS NULL THEN
        RAISE EXCEPTION 'property_apartado_reason_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_unidad
      FROM public.propiedad_unidades
     WHERE id = p_unidad_id
       AND status = 'disponible'::public.propiedad_status
       AND EXISTS (
           SELECT 1
             FROM public.propiedad_capas c
             JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = propiedad_unidades.nivel_id
              AND d.organizacion_id = p_organizacion_id
       )
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_persona
      FROM public.personas
     WHERE id = p_cliente_principal_id
       AND organizacion_id = p_organizacion_id
       AND archived_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_client_not_found' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.operaciones_inmobiliarias (
        organizacion_id, unidad_id, oportunidad_id, cliente_principal_id,
        agente_usuario_id, estado, apartado_horas, apartado_iniciado_en,
        apartado_vencimiento_en, apartado_motivo, forma_adquisicion,
        precio_ofrecido, moneda
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        p_agente_usuario_id, 'borrador', p_apartado_horas, v_now,
        v_now + make_interval(hours => p_apartado_horas),
        btrim(p_apartado_motivo), v_forma, p_precio_ofrecido, v_moneda
    )
    RETURNING * INTO v_operation;

    UPDATE public.propiedad_unidades
       SET status = 'reservado'::public.propiedad_status,
           oportunidad_id = COALESCE(p_oportunidad_id, oportunidad_id),
           actualizado_en = now()
     WHERE id = p_unidad_id;

    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        'disponible'::public.propiedad_status, 'reservado'::public.propiedad_status,
        COALESCE(p_precio_ofrecido, v_unidad.precio), v_moneda,
        'reservado_inmobiliario', p_agente_usuario_id
    );

    RETURN QUERY SELECT v_operation.id, v_operation.unidad_id, v_operation.estado,
                        v_operation.apartado_iniciado_en,
                        v_operation.apartado_vencimiento_en,
                        v_operation.cliente_principal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_guardar_avance_reserva_directa(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_cliente_principal_id uuid,
    p_agente_usuario_id uuid DEFAULT NULL::uuid,
    p_oportunidad_id uuid DEFAULT NULL::uuid,
    p_precio_acordado numeric DEFAULT NULL::numeric,
    p_fecha_limite_reserva timestamptz DEFAULT NULL::timestamptz,
    p_forma_adquisicion text DEFAULT NULL::text,
    p_reserva_importe numeric DEFAULT NULL::numeric,
    p_condiciones_reserva text DEFAULT NULL::text,
    p_tipo_comprador text DEFAULT NULL::text
)
RETURNS SETOF public.operaciones_inmobiliarias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_unit public.propiedad_unidades%ROWTYPE;
    v_person public.personas%ROWTYPE;
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_forma text := lower(nullif(btrim(p_forma_adquisicion), ''));
    v_tipo text := lower(nullif(btrim(p_tipo_comprador), ''));
    v_now timestamptz := now();
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'property_reservation_organization_forbidden';
    END IF;
    IF v_forma IS NOT NULL AND v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN
        RAISE EXCEPTION 'property_acquisition_method_invalid';
    END IF;
    IF v_tipo IS NOT NULL AND v_tipo NOT IN ('persona_fisica', 'pfae', 'persona_moral') THEN
        RAISE EXCEPTION 'property_buyer_type_invalid';
    END IF;
    SELECT * INTO v_unit FROM public.propiedad_unidades AS unit
     WHERE unit.id = p_unidad_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_unit_not_found'; END IF;
    IF lower(COALESCE(v_unit.status::text, 'disponible')) NOT IN ('disponible', 'reservado') THEN
        RAISE EXCEPTION 'property_unit_not_available_for_direct_reservation';
    END IF;
    SELECT * INTO v_person FROM public.personas AS person
     WHERE person.id = p_cliente_principal_id AND person.organizacion_id = p_organizacion_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_client_not_found'; END IF;

    SELECT * INTO v_operation FROM public.operaciones_inmobiliarias AS op
     WHERE op.organizacion_id = p_organizacion_id
       AND op.unidad_id = p_unidad_id
       AND op.estado IN ('borrador', 'apartada')
     ORDER BY op.actualizado_en DESC LIMIT 1 FOR UPDATE;

    IF FOUND THEN
        UPDATE public.operaciones_inmobiliarias AS op
           SET cliente_principal_id = p_cliente_principal_id,
               agente_usuario_id = COALESCE(p_agente_usuario_id, op.agente_usuario_id),
               oportunidad_id = COALESCE(p_oportunidad_id, op.oportunidad_id),
               estado = 'apartada',
               apartado_horas = COALESCE(op.apartado_horas, 48),
               apartado_iniciado_en = COALESCE(op.apartado_iniciado_en, v_now),
               apartado_vencimiento_en = COALESCE(op.apartado_vencimiento_en, v_now + make_interval(hours => 48)),
               precio_acordado = p_precio_acordado,
               fecha_limite_reserva = p_fecha_limite_reserva,
               forma_adquisicion = COALESCE(v_forma, op.forma_adquisicion),
               reserva_importe = p_reserva_importe,
               condiciones_reserva = p_condiciones_reserva,
               tipo_comprador = COALESCE(v_tipo, op.tipo_comprador),
               estado_validacion = 'pendiente_captura',
               actualizado_en = now()
         WHERE op.id = v_operation.id RETURNING op.* INTO v_operation;
    ELSE
        INSERT INTO public.operaciones_inmobiliarias (
            organizacion_id, unidad_id, oportunidad_id, cliente_principal_id, agente_usuario_id,
            estado, apartado_horas, apartado_iniciado_en, apartado_vencimiento_en,
            forma_adquisicion, precio_acordado, fecha_limite_reserva,
            reserva_importe, condiciones_reserva, tipo_comprador, estado_validacion
        ) VALUES (
            p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id, p_agente_usuario_id,
            'apartada', 48, v_now, v_now + make_interval(hours => 48),
            COALESCE(v_forma, 'por_definir'), p_precio_acordado, p_fecha_limite_reserva,
            p_reserva_importe, p_condiciones_reserva, v_tipo, 'pendiente_captura'
        ) RETURNING * INTO v_operation;
    END IF;

    UPDATE public.propiedad_unidades
       SET status = 'apartado'::public.propiedad_status,
           oportunidad_id = COALESCE(p_oportunidad_id, oportunidad_id),
           actualizado_en = now()
     WHERE id = p_unidad_id;

    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    ) VALUES (
        p_organizacion_id, p_unidad_id, COALESCE(p_oportunidad_id, v_operation.oportunidad_id),
        p_cliente_principal_id, v_unit.status, 'apartado'::public.propiedad_status,
        COALESCE(p_precio_acordado, v_unit.precio), 'MXN', 'apartado_desde_reservado', p_agente_usuario_id
    );

    RETURN NEXT v_operation;
END;
$function$;
