BEGIN;

/* Precio comercial de la ficha y auditoría de excepciones. */
ALTER TABLE public.operaciones_inmobiliarias
    ADD COLUMN IF NOT EXISTS precio_establecido numeric(18, 2),
    ADD COLUMN IF NOT EXISTS precio_override_monto numeric(18, 2),
    ADD COLUMN IF NOT EXISTS precio_override_motivo text,
    ADD COLUMN IF NOT EXISTS precio_override_por uuid,
    ADD COLUMN IF NOT EXISTS precio_override_en timestamptz;

ALTER TABLE public.operaciones_inmobiliarias
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_precio_establecido_chk,
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_precio_override_chk;

ALTER TABLE public.operaciones_inmobiliarias
    ADD CONSTRAINT operaciones_inmobiliarias_precio_establecido_chk
        CHECK (precio_establecido IS NULL OR precio_establecido > 0),
    ADD CONSTRAINT operaciones_inmobiliarias_precio_override_chk
        CHECK (
            precio_override_monto IS NULL
            OR (
                precio_override_monto > 0
                AND nullif(btrim(precio_override_motivo), '') IS NOT NULL
                AND precio_override_por IS NOT NULL
                AND precio_override_en IS NOT NULL
            )
        );

ALTER TABLE public.operaciones_inmobiliarias
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_precio_override_por_fkey;

ALTER TABLE public.operaciones_inmobiliarias
    ADD CONSTRAINT operaciones_inmobiliarias_precio_override_por_fkey
        FOREIGN KEY (precio_override_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

UPDATE public.operaciones_inmobiliarias op
SET precio_establecido = CASE
    WHEN lower(coalesce(u.precio_tipo, 'manual')) = 'm2' THEN u.area_m2 * u.precio_m2
    ELSE u.precio
END
FROM public.propiedad_unidades u
WHERE u.id = op.unidad_id
  AND op.precio_establecido IS NULL;

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_precio_override_idx
    ON public.operaciones_inmobiliarias (organizacion_id, precio_override_en)
    WHERE precio_override_monto IS NOT NULL;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES (
    'inmobiliaria.apartados.price_override',
    'Autorizar un precio diferente al establecido en la ficha de la unidad',
    576
)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inmobiliaria.apartados.price_override'),
    ('admin_operativo', 'inmobiliaria.apartados.price_override'),
    ('gerente_comercial', 'inmobiliaria.apartados.price_override')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
CROSS JOIN public.tenant_default_permissions p
WHERE p.codigo = 'inmobiliaria.apartados.price_override'
ON CONFLICT (organizacion_id, codigo) DO UPDATE
SET descripcion = EXCLUDED.descripcion;

INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT r.organizacion_id, r.id, p.id
FROM public.roles r
JOIN public.tenant_default_role_permissions rp
  ON rp.rol_codigo = lower(trim(r.nombre))
 AND rp.permiso_codigo = 'inmobiliaria.apartados.price_override'
JOIN public.permisos p
  ON p.organizacion_id = r.organizacion_id
 AND p.codigo = rp.permiso_codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.crm_precio_establecido_unidad(p_unidad_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT CASE
        WHEN lower(coalesce(u.precio_tipo, 'manual')) = 'm2'
            THEN u.area_m2 * u.precio_m2
        ELSE u.precio
    END
    FROM public.propiedad_unidades u
    WHERE u.id = p_unidad_id;
$function$;

REVOKE ALL ON FUNCTION public.crm_precio_establecido_unidad(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_precio_establecido_unidad(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.crm_guardar_avance_reserva_directa(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_cliente_principal_id uuid,
    p_agente_usuario_id uuid DEFAULT NULL,
    p_oportunidad_id uuid DEFAULT NULL,
    p_precio_acordado numeric DEFAULT NULL,
    p_fecha_limite_reserva timestamptz DEFAULT NULL,
    p_forma_adquisicion text DEFAULT NULL,
    p_reserva_importe numeric DEFAULT NULL,
    p_condiciones_reserva text DEFAULT NULL,
    p_tipo_comprador text DEFAULT NULL,
    p_precio_override_motivo text DEFAULT NULL
)
RETURNS SETOF public.operaciones_inmobiliarias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_unit public.propiedad_unidades%ROWTYPE;
    v_person public.personas%ROWTYPE;
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_established_price numeric;
    v_effective_price numeric;
    v_override_reason text := nullif(btrim(p_precio_override_motivo), '');
    v_forma text := lower(nullif(btrim(p_forma_adquisicion), ''));
    v_tipo text := lower(nullif(btrim(p_tipo_comprador), ''));
    v_deadline timestamptz := coalesce(p_fecha_limite_reserva, now() + interval '48 hours');
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'property_reservation_organization_forbidden';
    END IF;
    IF v_forma IS NULL OR v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN
        RAISE EXCEPTION 'property_acquisition_method_required';
    END IF;
    IF v_tipo IS NULL OR v_tipo NOT IN ('persona_fisica', 'pfae', 'persona_moral') THEN
        RAISE EXCEPTION 'property_buyer_type_required';
    END IF;
    IF v_deadline <= now() OR v_deadline > now() + interval '72 hours' THEN
        RAISE EXCEPTION 'property_reservation_deadline_invalid';
    END IF;
    IF p_reserva_importe IS NOT NULL AND p_reserva_importe < 0 THEN
        RAISE EXCEPTION 'property_reservation_amount_invalid';
    END IF;

    SELECT * INTO v_unit
    FROM public.propiedad_unidades unit
    WHERE unit.id = p_unidad_id
      AND unit.status = 'disponible'::public.propiedad_status
      AND EXISTS (
          SELECT 1
          FROM public.propiedad_capas c
          JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
          WHERE c.id = unit.nivel_id AND d.organizacion_id = p_organizacion_id
      )
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_unit_not_available_for_direct_reservation'; END IF;

    v_established_price := public.crm_precio_establecido_unidad(p_unidad_id);
    IF v_established_price IS NULL OR v_established_price <= 0 THEN
        RAISE EXCEPTION 'property_price_required';
    END IF;
    v_effective_price := coalesce(p_precio_acordado, v_established_price);
    IF abs(v_effective_price - v_established_price) > 0.01 THEN
        IF auth.role() <> 'service_role' AND NOT public.current_user_has_perm('inmobiliaria.apartados.price_override') THEN
            RAISE EXCEPTION 'property_price_override_forbidden';
        END IF;
        IF v_override_reason IS NULL THEN RAISE EXCEPTION 'property_price_override_reason_required'; END IF;
    ELSE
        v_effective_price := v_established_price;
        v_override_reason := NULL;
    END IF;

    SELECT * INTO v_person
    FROM public.personas person
    WHERE person.id = p_cliente_principal_id
      AND person.organizacion_id = p_organizacion_id
      AND person.archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_client_not_found'; END IF;

    INSERT INTO public.operaciones_inmobiliarias (
        organizacion_id, unidad_id, oportunidad_id, cliente_principal_id,
        agente_usuario_id, estado, apartado_horas, apartado_iniciado_en,
        apartado_vencimiento_en, forma_adquisicion, precio_acordado,
        precio_establecido, precio_override_monto, precio_override_motivo,
        precio_override_por, precio_override_en, fecha_limite_reserva,
        reserva_importe, condiciones_reserva, tipo_comprador, estado_validacion
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        p_agente_usuario_id, 'reservada', 48, now(), v_deadline,
        v_forma, v_effective_price, v_established_price,
        CASE WHEN v_override_reason IS NOT NULL THEN v_effective_price END,
        v_override_reason, CASE WHEN v_override_reason IS NOT NULL THEN auth.uid() END,
        CASE WHEN v_override_reason IS NOT NULL THEN now() END,
        p_fecha_limite_reserva, p_reserva_importe, p_condiciones_reserva,
        v_tipo, 'pendiente_captura'
    ) RETURNING * INTO v_operation;

    UPDATE public.propiedad_unidades
       SET status = 'reservado'::public.propiedad_status,
           oportunidad_id = coalesce(p_oportunidad_id, oportunidad_id), actualizado_en = now()
     WHERE id = p_unidad_id;

    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        'disponible'::public.propiedad_status, 'reservado'::public.propiedad_status,
        v_effective_price, 'MXN', 'reserva_temporal_creada', p_agente_usuario_id
    );
    RETURN NEXT v_operation;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text, text, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.crm_apartar_propiedad(uuid, uuid, uuid, uuid, uuid, smallint, text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.crm_apartar_propiedad(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_cliente_principal_id uuid,
    p_agente_usuario_id uuid DEFAULT NULL,
    p_oportunidad_id uuid DEFAULT NULL,
    p_apartado_horas smallint DEFAULT 48,
    p_forma_adquisicion text DEFAULT 'por_definir',
    p_apartado_motivo text DEFAULT NULL,
    p_precio_ofrecido numeric DEFAULT NULL,
    p_moneda text DEFAULT 'MXN',
    p_precio_override_motivo text DEFAULT NULL
)
RETURNS TABLE(operacion_id uuid, unidad_id uuid, estado text, apartado_iniciado_en timestamptz, apartado_vencimiento_en timestamptz, cliente_principal_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_unidad public.propiedad_unidades%ROWTYPE;
    v_persona public.personas%ROWTYPE;
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_established_price numeric;
    v_effective_price numeric;
    v_override_reason text := nullif(btrim(p_precio_override_motivo), '');
    v_now timestamptz := now();
    v_forma text := lower(coalesce(nullif(btrim(p_forma_adquisicion), ''), 'por_definir'));
    v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'MXN'));
BEGIN
    IF auth.uid() IS NOT NULL AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_apartado_horas NOT IN (24, 48, 72) THEN RAISE EXCEPTION 'property_apartado_hours_invalid'; END IF;
    IF v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN RAISE EXCEPTION 'property_acquisition_method_invalid'; END IF;
    IF nullif(btrim(coalesce(p_apartado_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'property_apartado_reason_required'; END IF;

    SELECT * INTO v_unidad
    FROM public.propiedad_unidades unit
    WHERE unit.id = p_unidad_id
      AND unit.status IN ('disponible'::public.propiedad_status, 'reservado'::public.propiedad_status)
      AND EXISTS (
          SELECT 1 FROM public.propiedad_capas c
          JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
          WHERE c.id = unit.nivel_id AND d.organizacion_id = p_organizacion_id
      )
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_unit_not_available'; END IF;
    SELECT * INTO v_persona FROM public.personas WHERE id = p_cliente_principal_id AND organizacion_id = p_organizacion_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_client_not_found'; END IF;

    v_established_price := public.crm_precio_establecido_unidad(p_unidad_id);
    IF v_established_price IS NULL OR v_established_price <= 0 THEN RAISE EXCEPTION 'property_price_required'; END IF;
    v_effective_price := coalesce(p_precio_ofrecido, v_established_price);
    IF abs(v_effective_price - v_established_price) > 0.01 THEN
        IF auth.role() <> 'service_role' AND NOT public.current_user_has_perm('inmobiliaria.apartados.price_override') THEN
            RAISE EXCEPTION 'property_price_override_forbidden';
        END IF;
        IF v_override_reason IS NULL THEN RAISE EXCEPTION 'property_price_override_reason_required'; END IF;
    ELSE
        v_effective_price := v_established_price;
        v_override_reason := NULL;
    END IF;

    IF v_unidad.status = 'reservado'::public.propiedad_status THEN
        SELECT * INTO v_operation FROM public.operaciones_inmobiliarias
        WHERE organizacion_id = p_organizacion_id AND unidad_id = p_unidad_id AND estado = 'reservada'
        ORDER BY actualizado_en DESC LIMIT 1 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'property_reserva_not_found'; END IF;

        UPDATE public.operaciones_inmobiliarias
           SET cliente_principal_id = p_cliente_principal_id,
               agente_usuario_id = coalesce(p_agente_usuario_id, agente_usuario_id),
               oportunidad_id = coalesce(p_oportunidad_id, oportunidad_id),
               estado = 'apartada', apartado_motivo = btrim(p_apartado_motivo),
               forma_adquisicion = v_forma, estado_validacion = 'pendiente_captura',
               precio_establecido = v_established_price,
               precio_acordado = v_effective_price,
               precio_override_monto = CASE WHEN v_override_reason IS NOT NULL THEN v_effective_price END,
               precio_override_motivo = v_override_reason,
               precio_override_por = CASE WHEN v_override_reason IS NOT NULL THEN auth.uid() END,
               precio_override_en = CASE WHEN v_override_reason IS NOT NULL THEN v_now END,
               actualizado_en = v_now
         WHERE id = v_operation.id RETURNING * INTO v_operation;

        INSERT INTO public.propiedad_unidad_movimientos (organizacion_id, unidad_id, oportunidad_id, persona_id, estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por)
        VALUES (p_organizacion_id, p_unidad_id, coalesce(p_oportunidad_id, v_operation.oportunidad_id), p_cliente_principal_id, 'reservado'::public.propiedad_status, 'apartado'::public.propiedad_status, v_effective_price, v_moneda, 'apartado_explicito_desde_reserva', p_agente_usuario_id);
        UPDATE public.propiedad_unidades SET status = 'apartado'::public.propiedad_status, oportunidad_id = coalesce(p_oportunidad_id, oportunidad_id), actualizado_en = v_now WHERE id = p_unidad_id;
    ELSE
        INSERT INTO public.operaciones_inmobiliarias (
            organizacion_id, unidad_id, oportunidad_id, cliente_principal_id, agente_usuario_id,
            estado, apartado_horas, apartado_iniciado_en, apartado_vencimiento_en, apartado_motivo,
            forma_adquisicion, precio_ofrecido, precio_establecido, precio_override_monto,
            precio_override_motivo, precio_override_por, precio_override_en, moneda
        ) VALUES (
            p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id, p_agente_usuario_id,
            'reservada', p_apartado_horas, v_now, v_now + make_interval(hours => p_apartado_horas), btrim(p_apartado_motivo),
            v_forma, v_effective_price, v_established_price,
            CASE WHEN v_override_reason IS NOT NULL THEN v_effective_price END, v_override_reason,
            CASE WHEN v_override_reason IS NOT NULL THEN auth.uid() END,
            CASE WHEN v_override_reason IS NOT NULL THEN v_now END, v_moneda
        ) RETURNING * INTO v_operation;
        UPDATE public.propiedad_unidades SET status = 'reservado'::public.propiedad_status, oportunidad_id = coalesce(p_oportunidad_id, oportunidad_id), actualizado_en = v_now WHERE id = p_unidad_id;
        INSERT INTO public.propiedad_unidad_movimientos (organizacion_id, unidad_id, oportunidad_id, persona_id, estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por)
        VALUES (p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id, 'disponible'::public.propiedad_status, 'reservado'::public.propiedad_status, v_effective_price, v_moneda, 'reserva_temporal_creada', p_agente_usuario_id);
    END IF;

    RETURN QUERY SELECT v_operation.id, v_operation.unidad_id, v_operation.estado, v_operation.apartado_iniciado_en, v_operation.apartado_vencimiento_en, v_operation.cliente_principal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_apartar_propiedad(uuid, uuid, uuid, uuid, uuid, smallint, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_apartar_propiedad(uuid, uuid, uuid, uuid, uuid, smallint, text, text, numeric, text, text) TO authenticated, service_role;

COMMIT;
