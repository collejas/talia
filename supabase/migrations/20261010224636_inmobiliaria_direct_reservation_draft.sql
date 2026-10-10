ALTER TABLE public.operaciones_inmobiliarias
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_estado_check;

ALTER TABLE public.operaciones_inmobiliarias
    ADD CONSTRAINT operaciones_inmobiliarias_estado_check
    CHECK (estado IN ('borrador', 'apartada', 'reservada', 'vendida', 'cancelada'));

CREATE UNIQUE INDEX IF NOT EXISTS operaciones_inmobiliarias_unidad_borrador_uidx
    ON public.operaciones_inmobiliarias (organizacion_id, unidad_id)
    WHERE estado = 'borrador';

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
    p_condiciones_reserva text DEFAULT NULL
)
RETURNS SETOF public.operaciones_inmobiliarias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit public.propiedad_unidades%ROWTYPE;
    v_person public.personas%ROWTYPE;
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'property_reservation_organization_forbidden';
    END IF;

    SELECT * INTO v_unit
      FROM public.propiedad_unidades AS unit
     WHERE unit.id = p_unidad_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_unit_not_found';
    END IF;
    IF lower(COALESCE(v_unit.status::text, 'disponible')) <> 'disponible' THEN
        RAISE EXCEPTION 'property_unit_not_available_for_direct_reservation';
    END IF;

    SELECT * INTO v_person
      FROM public.personas AS person
     WHERE person.id = p_cliente_principal_id
       AND person.organizacion_id = p_organizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_client_not_found';
    END IF;

    SELECT * INTO v_operation
      FROM public.operaciones_inmobiliarias AS op
     WHERE op.organizacion_id = p_organizacion_id
       AND op.unidad_id = p_unidad_id
       AND op.estado = 'borrador'
     ORDER BY op.actualizado_en DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        UPDATE public.operaciones_inmobiliarias AS op
           SET cliente_principal_id = p_cliente_principal_id,
               agente_usuario_id = p_agente_usuario_id,
               oportunidad_id = p_oportunidad_id,
               precio_acordado = p_precio_acordado,
               fecha_limite_reserva = p_fecha_limite_reserva,
               forma_adquisicion = COALESCE(p_forma_adquisicion, op.forma_adquisicion),
               reserva_importe = p_reserva_importe,
               condiciones_reserva = p_condiciones_reserva,
               actualizado_en = now()
         WHERE op.id = v_operation.id
         RETURNING * INTO v_operation;
    ELSE
        INSERT INTO public.operaciones_inmobiliarias (
            organizacion_id,
            unidad_id,
            oportunidad_id,
            cliente_principal_id,
            agente_usuario_id,
            estado,
            forma_adquisicion,
            precio_acordado,
            fecha_limite_reserva,
            reserva_importe,
            condiciones_reserva
        ) VALUES (
            p_organizacion_id,
            p_unidad_id,
            p_oportunidad_id,
            p_cliente_principal_id,
            p_agente_usuario_id,
            'borrador',
            COALESCE(p_forma_adquisicion, 'por_definir'),
            p_precio_acordado,
            p_fecha_limite_reserva,
            p_reserva_importe,
            p_condiciones_reserva
        ) RETURNING * INTO v_operation;
    END IF;

    RETURN NEXT v_operation;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text) TO authenticated, service_role;
