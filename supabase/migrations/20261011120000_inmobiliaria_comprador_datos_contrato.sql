BEGIN;

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS nacionalidad text,
    ADD COLUMN IF NOT EXISTS ocupacion text,
    ADD COLUMN IF NOT EXISTS estado_civil text,
    ADD COLUMN IF NOT EXISTS curp text,
    ADD COLUMN IF NOT EXISTS rfc text,
    ADD COLUMN IF NOT EXISTS tipo_identificacion text,
    ADD COLUMN IF NOT EXISTS numero_identificacion text;

ALTER TABLE public.operaciones_inmobiliarias
    ADD COLUMN IF NOT EXISTS tipo_comprador text;

ALTER TABLE public.operaciones_inmobiliarias
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_tipo_comprador_chk;

ALTER TABLE public.operaciones_inmobiliarias
    ADD CONSTRAINT operaciones_inmobiliarias_tipo_comprador_chk
    CHECK (tipo_comprador IS NULL OR tipo_comprador IN ('persona_fisica', 'pfae', 'persona_moral'));

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_tipo_comprador_idx
    ON public.operaciones_inmobiliarias (organizacion_id, tipo_comprador)
    WHERE tipo_comprador IS NOT NULL;

DROP FUNCTION IF EXISTS public.crm_guardar_avance_reserva(uuid, uuid, numeric, timestamptz, text, numeric, text);
DROP FUNCTION IF EXISTS public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text);

COMMENT ON COLUMN public.personas.nacionalidad IS 'Nacionalidad legal del contacto para contratos.';
COMMENT ON COLUMN public.personas.ocupacion IS 'Ocupacion declarada del contacto para contratos.';
COMMENT ON COLUMN public.personas.estado_civil IS 'Estado civil declarado del contacto para contratos.';
COMMENT ON COLUMN public.personas.curp IS 'CURP del contacto; dato sensible para documentos contractuales.';
COMMENT ON COLUMN public.personas.rfc IS 'RFC de persona fisica; el RFC de una empresa permanece en cuentas.rfc.';
COMMENT ON COLUMN public.personas.tipo_identificacion IS 'Tipo de identificacion oficial del contacto.';
COMMENT ON COLUMN public.personas.numero_identificacion IS 'Numero o folio de identificacion oficial del contacto.';
COMMENT ON COLUMN public.operaciones_inmobiliarias.tipo_comprador IS 'Forma juridica con la que el comprador celebra esta operacion.';

CREATE OR REPLACE FUNCTION public.crm_guardar_avance_reserva(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_precio_acordado numeric DEFAULT NULL,
    p_fecha_limite_reserva timestamptz DEFAULT NULL,
    p_forma_adquisicion text DEFAULT NULL,
    p_reserva_importe numeric DEFAULT NULL,
    p_condiciones_reserva text DEFAULT NULL,
    p_tipo_comprador text DEFAULT NULL
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
    tipo_comprador text,
    actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_forma text;
    v_tipo text;
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;
    v_forma := lower(nullif(btrim(p_forma_adquisicion), ''));
    v_tipo := lower(nullif(btrim(p_tipo_comprador), ''));
    IF v_forma IS NOT NULL AND v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN
        RAISE EXCEPTION 'property_acquisition_method_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF v_tipo IS NOT NULL AND v_tipo NOT IN ('persona_fisica', 'pfae', 'persona_moral') THEN
        RAISE EXCEPTION 'property_buyer_type_invalid' USING ERRCODE = 'P0001';
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
           tipo_comprador = COALESCE(v_tipo, op.tipo_comprador),
           actualizado_en = now()
     WHERE op.id = v_operation.id
     RETURNING op.* INTO v_operation;

    RETURN QUERY SELECT v_operation.id, v_operation.unidad_id, v_operation.estado,
                        v_operation.precio_acordado, v_operation.fecha_limite_reserva,
                        v_operation.forma_adquisicion, v_operation.reserva_importe,
                        v_operation.condiciones_reserva, v_operation.tipo_comprador,
                        v_operation.actualizado_en;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_guardar_avance_reserva(uuid, uuid, numeric, timestamptz, text, numeric, text, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_avance_reserva(uuid, uuid, numeric, timestamptz, text, numeric, text, text)
    TO authenticated, service_role;

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
    p_tipo_comprador text DEFAULT NULL
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
    v_forma text := lower(nullif(btrim(p_forma_adquisicion), ''));
    v_tipo text := lower(nullif(btrim(p_tipo_comprador), ''));
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
    SELECT * INTO v_unit FROM public.propiedad_unidades AS unit WHERE unit.id = p_unidad_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_unit_not_found'; END IF;
    IF lower(COALESCE(v_unit.status::text, 'disponible')) <> 'disponible' THEN
        RAISE EXCEPTION 'property_unit_not_available_for_direct_reservation';
    END IF;
    SELECT * INTO v_person FROM public.personas AS person
     WHERE person.id = p_cliente_principal_id AND person.organizacion_id = p_organizacion_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_client_not_found'; END IF;

    SELECT * INTO v_operation FROM public.operaciones_inmobiliarias AS op
     WHERE op.organizacion_id = p_organizacion_id AND op.unidad_id = p_unidad_id AND op.estado = 'borrador'
     ORDER BY op.actualizado_en DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
        UPDATE public.operaciones_inmobiliarias AS op
           SET cliente_principal_id = p_cliente_principal_id,
               agente_usuario_id = p_agente_usuario_id,
               oportunidad_id = p_oportunidad_id,
               precio_acordado = p_precio_acordado,
               fecha_limite_reserva = p_fecha_limite_reserva,
               forma_adquisicion = COALESCE(v_forma, op.forma_adquisicion),
               reserva_importe = p_reserva_importe,
               condiciones_reserva = p_condiciones_reserva,
               tipo_comprador = COALESCE(v_tipo, op.tipo_comprador),
               actualizado_en = now()
         WHERE op.id = v_operation.id RETURNING op.* INTO v_operation;
    ELSE
        INSERT INTO public.operaciones_inmobiliarias (
            organizacion_id, unidad_id, oportunidad_id, cliente_principal_id, agente_usuario_id,
            estado, forma_adquisicion, precio_acordado, fecha_limite_reserva,
            reserva_importe, condiciones_reserva, tipo_comprador
        ) VALUES (
            p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id, p_agente_usuario_id,
            'borrador', COALESCE(v_forma, 'por_definir'), p_precio_acordado, p_fecha_limite_reserva,
            p_reserva_importe, p_condiciones_reserva, v_tipo
        ) RETURNING * INTO v_operation;
    END IF;
    RETURN NEXT v_operation;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text, text)
    TO authenticated, service_role;

COMMIT;
