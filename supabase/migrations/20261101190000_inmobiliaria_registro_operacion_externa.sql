BEGIN;

-- Registro transaccional de una operación informada por un socio comercial
-- externo. La oportunidad debe existir previamente para conservar la misma
-- regla de trazabilidad usada por el flujo inmobiliario interno.
CREATE OR REPLACE FUNCTION public.crm_registrar_operacion_externa(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_cliente_principal_id uuid,
    p_oportunidad_id uuid,
    p_socio_comercial_externo_id uuid,
    p_agente_externo_id uuid,
    p_estado text DEFAULT 'reservada',
    p_apartado_horas smallint DEFAULT 48,
    p_forma_adquisicion text DEFAULT 'por_definir',
    p_referencia_externa text DEFAULT NULL,
    p_fecha_evento_externo timestamptz DEFAULT NULL,
    p_comision_porcentaje numeric DEFAULT NULL,
    p_comision_monto numeric DEFAULT NULL,
    p_responsable_interno_usuario_id uuid DEFAULT NULL,
    p_registrado_por_usuario_id uuid DEFAULT NULL,
    p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_unit public.propiedad_unidades%ROWTYPE;
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_opportunity public.oportunidades%ROWTYPE;
    v_now timestamptz := now();
    v_state text := lower(nullif(btrim(p_estado), ''));
    v_forma text := lower(coalesce(nullif(btrim(p_forma_adquisicion), ''), 'por_definir'));
    v_price numeric;
    v_previous_status public.propiedad_status;
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'external_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;
    IF auth.uid() IS NOT NULL
       AND NOT public.current_user_has_perm('inmobiliaria.operaciones_externas.create') THEN
        RAISE EXCEPTION 'external_operation_permission_required' USING ERRCODE = '42501';
    END IF;
    IF v_state NOT IN ('reservada', 'apartada') THEN
        RAISE EXCEPTION 'external_operation_state_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF p_apartado_horas NOT IN (24, 48, 72) THEN
        RAISE EXCEPTION 'property_apartado_hours_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN
        RAISE EXCEPTION 'property_acquisition_method_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF p_oportunidad_id IS NULL THEN
        RAISE EXCEPTION 'property_opportunity_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_comision_porcentaje IS NOT NULL AND (p_comision_porcentaje < 0 OR p_comision_porcentaje > 100) THEN
        RAISE EXCEPTION 'external_commission_percentage_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF p_comision_monto IS NOT NULL AND p_comision_monto < 0 THEN
        RAISE EXCEPTION 'external_commission_amount_invalid' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_unit
      FROM public.propiedad_unidades
     WHERE id = p_unidad_id
       AND status = 'disponible'::public.propiedad_status
       AND EXISTS (
           SELECT 1
             FROM public.propiedad_desarrollos d
            WHERE d.id = propiedad_unidades.desarrollo_id
              AND d.organizacion_id = p_organizacion_id
       )
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_opportunity
      FROM public.oportunidades
     WHERE id = p_oportunidad_id
       AND organizacion_id = p_organizacion_id
       AND lower(coalesce(dominio_comercial, '')) IN ('propiedades', 'mixto');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_opportunity_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_opportunity.contacto_principal_id IS DISTINCT FROM p_cliente_principal_id THEN
        RAISE EXCEPTION 'property_opportunity_contact_mismatch' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.personas
         WHERE id = p_cliente_principal_id
           AND organizacion_id = p_organizacion_id
           AND archived_at IS NULL
    ) THEN
        RAISE EXCEPTION 'property_client_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.inmobiliaria_socios_comerciales
         WHERE id = p_socio_comercial_externo_id
           AND organizacion_id = p_organizacion_id
           AND activo
    ) THEN
        RAISE EXCEPTION 'external_partner_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.inmobiliaria_agentes_externos
         WHERE id = p_agente_externo_id
           AND organizacion_id = p_organizacion_id
           AND socio_comercial_id = p_socio_comercial_externo_id
           AND activo
    ) THEN
        RAISE EXCEPTION 'external_agent_not_found' USING ERRCODE = 'P0001';
    END IF;

    v_price := public.crm_precio_establecido_unidad(p_unidad_id);
    IF v_price IS NULL OR v_price <= 0 THEN
        RAISE EXCEPTION 'property_price_required' USING ERRCODE = 'P0001';
    END IF;

    v_previous_status := v_unit.status;
    INSERT INTO public.operaciones_inmobiliarias (
        organizacion_id, unidad_id, oportunidad_id, cliente_principal_id,
        agente_usuario_id, estado, apartado_horas, apartado_iniciado_en,
        apartado_vencimiento_en, apartado_motivo, forma_adquisicion,
        precio_ofrecido, precio_acordado, precio_establecido, moneda,
        estado_validacion, origen_venta, socio_comercial_externo_id,
        agente_externo_id, registrado_por_usuario_id,
        responsable_interno_usuario_id, referencia_externa,
        fecha_evento_externo, comision_porcentaje, comision_monto,
        comision_estado
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        NULL, v_state, p_apartado_horas, v_now,
        CASE WHEN v_state = 'reservada' THEN v_now + make_interval(hours => p_apartado_horas) ELSE NULL END,
        coalesce(nullif(btrim(p_motivo), ''), 'Operación informada por socio comercial externo.'),
        v_forma, v_price, v_price, v_price, 'MXN',
        CASE WHEN v_state = 'apartada' THEN 'pendiente_captura' ELSE NULL END,
        'externo', p_socio_comercial_externo_id, p_agente_externo_id,
        coalesce(p_registrado_por_usuario_id, auth.uid()),
        p_responsable_interno_usuario_id, nullif(btrim(p_referencia_externa), ''),
        coalesce(p_fecha_evento_externo, v_now), p_comision_porcentaje,
        p_comision_monto, CASE WHEN p_comision_porcentaje IS NOT NULL OR p_comision_monto IS NOT NULL THEN 'pendiente' ELSE NULL END
    ) RETURNING * INTO v_operation;

    UPDATE public.propiedad_unidades
       SET status = CASE WHEN v_state = 'reservada' THEN 'reservado'::public.propiedad_status ELSE 'apartado'::public.propiedad_status END,
           oportunidad_id = p_oportunidad_id,
           actualizado_en = v_now
     WHERE id = p_unidad_id;

    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        v_previous_status,
        CASE WHEN v_state = 'reservada' THEN 'reservado'::public.propiedad_status ELSE 'apartado'::public.propiedad_status END,
        v_price, 'MXN', 'operacion_externa_' || v_state,
        coalesce(p_registrado_por_usuario_id, auth.uid())
    );

    RETURN jsonb_build_object(
        'id', v_operation.id,
        'unidad_id', v_operation.unidad_id,
        'oportunidad_id', v_operation.oportunidad_id,
        'cliente_principal_id', v_operation.cliente_principal_id,
        'estado', v_operation.estado,
        'estado_validacion', v_operation.estado_validacion,
        'precio_establecido', v_operation.precio_establecido,
        'origen_venta', v_operation.origen_venta,
        'socio_comercial_externo_id', v_operation.socio_comercial_externo_id,
        'agente_externo_id', v_operation.agente_externo_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_registrar_operacion_externa(uuid, uuid, uuid, uuid, uuid, uuid, text, smallint, text, text, timestamptz, numeric, numeric, uuid, uuid, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_registrar_operacion_externa(uuid, uuid, uuid, uuid, uuid, uuid, text, smallint, text, text, timestamptz, numeric, numeric, uuid, uuid, text)
    TO authenticated, service_role;

COMMIT;
