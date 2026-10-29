BEGIN;

/*
  Semántica definitiva de la operación inmobiliaria:

  - reservada: bloqueo temporal de 24/48/72 horas.
  - apartada: proceso posterior, iniciado explícitamente por el usuario,
    con expediente documental y validación.
  - no existe un estado operativo "borrador".

  La cotización/propuesta puede conservar su propio estatus "borrador"; eso
  no significa que exista una reserva inmobiliaria incompleta.
*/

-- Convertir cualquier histórico que todavía tenga el estado obsoleto en una
-- cancelación trazable antes de retirar el estado del constraint.
WITH obsoletas AS (
    SELECT id, organizacion_id, unidad_id, oportunidad_id, cliente_principal_id,
           precio_acordado, precio_ofrecido, moneda
      FROM public.operaciones_inmobiliarias
     WHERE estado = 'borrador'
     FOR UPDATE
), movimientos AS (
    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    )
    SELECT o.organizacion_id, o.unidad_id, o.oportunidad_id,
           o.cliente_principal_id, 'reservado'::public.propiedad_status,
           'disponible'::public.propiedad_status,
           COALESCE(o.precio_acordado, o.precio_ofrecido),
           COALESCE(o.moneda, 'MXN'), 'migracion_elimina_borrador', NULL
      FROM obsoletas o
      JOIN public.propiedad_unidades u ON u.id = o.unidad_id
     WHERE u.status = 'reservado'::public.propiedad_status
    RETURNING id
), unidades AS (
    UPDATE public.propiedad_unidades u
       SET status = 'disponible'::public.propiedad_status,
           oportunidad_id = CASE
               WHEN u.oportunidad_id IN (SELECT oportunidad_id FROM obsoletas)
               THEN NULL ELSE u.oportunidad_id END,
           actualizado_en = now()
     WHERE u.id IN (SELECT unidad_id FROM obsoletas)
       AND u.status = 'reservado'::public.propiedad_status
    RETURNING u.id
)
UPDATE public.cotizaciones c
   SET estatus = 'cancelada', actualizado_en = now()
  FROM obsoletas o
 WHERE c.organizacion_id = o.organizacion_id
   AND c.operacion_inmobiliaria_id = o.id
   AND c.estatus IN ('borrador', 'enviada');

UPDATE public.operaciones_inmobiliarias
   SET estado = 'cancelada',
       cancelada_en = COALESCE(cancelada_en, now()),
       motivo_cancelacion = COALESCE(NULLIF(motivo_cancelacion, ''), 'borrador_migrado_sin_reserva'),
       actualizado_en = now()
 WHERE estado = 'borrador';

ALTER TABLE public.operaciones_inmobiliarias
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_estado_check;

ALTER TABLE public.operaciones_inmobiliarias
    ADD CONSTRAINT operaciones_inmobiliarias_estado_check
    CHECK (estado IN ('apartada', 'reservada', 'vendida', 'cancelada'));

DROP INDEX IF EXISTS public.operaciones_inmobiliarias_unidad_borrador_uidx;

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_reserva_expiracion_idx
    ON public.operaciones_inmobiliarias (organizacion_id, apartado_vencimiento_en)
    WHERE estado = 'reservada';

DROP FUNCTION IF EXISTS public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text);

-- Captura completa de una reserva temporal. La operación nace como
-- reservada; nunca se crea como borrador ni se convierte automáticamente en
-- apartada.
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
    v_deadline timestamptz := COALESCE(p_fecha_limite_reserva, now() + interval '48 hours');
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'property_reservation_organization_forbidden';
    END IF;
    IF p_precio_acordado IS NULL OR p_precio_acordado <= 0 THEN
        RAISE EXCEPTION 'property_agreed_price_required';
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
      FROM public.propiedad_unidades AS unit
     WHERE unit.id = p_unidad_id
       AND unit.status = 'disponible'::public.propiedad_status
       AND EXISTS (
           SELECT 1
             FROM public.propiedad_capas c
             JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = unit.nivel_id
              AND d.organizacion_id = p_organizacion_id
       )
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_unit_not_available_for_direct_reservation'; END IF;

    SELECT * INTO v_person
      FROM public.personas AS person
     WHERE person.id = p_cliente_principal_id
       AND person.organizacion_id = p_organizacion_id
       AND person.archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_client_not_found'; END IF;

    INSERT INTO public.operaciones_inmobiliarias (
        organizacion_id, unidad_id, oportunidad_id, cliente_principal_id,
        agente_usuario_id, estado, apartado_horas, apartado_iniciado_en,
        apartado_vencimiento_en, forma_adquisicion, precio_acordado,
        fecha_limite_reserva, reserva_importe, condiciones_reserva,
        tipo_comprador, estado_validacion
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        p_agente_usuario_id, 'reservada', 48, now(), v_deadline,
        v_forma, p_precio_acordado, p_fecha_limite_reserva,
        p_reserva_importe, p_condiciones_reserva, v_tipo, 'pendiente_captura'
    ) RETURNING * INTO v_operation;

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
        p_precio_acordado, 'MXN', 'reserva_temporal_creada', p_agente_usuario_id
    );

    RETURN NEXT v_operation;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_avance_reserva_directa(uuid, uuid, uuid, uuid, uuid, numeric, timestamptz, text, numeric, text, text) TO authenticated, service_role;

-- La acción /apartar es explícita: disponible -> reservada o reservada ->
-- apartada. Nunca crea un estado intermedio.
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
    p_moneda text DEFAULT 'MXN'
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
      FROM public.propiedad_unidades AS unit
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

    IF v_unidad.status = 'reservado'::public.propiedad_status THEN
        SELECT * INTO v_operation FROM public.operaciones_inmobiliarias
         WHERE organizacion_id = p_organizacion_id AND unidad_id = p_unidad_id AND estado = 'reservada'
         ORDER BY actualizado_en DESC LIMIT 1 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'property_reserva_not_found'; END IF;

        UPDATE public.operaciones_inmobiliarias
           SET cliente_principal_id = p_cliente_principal_id,
               agente_usuario_id = COALESCE(p_agente_usuario_id, agente_usuario_id),
               oportunidad_id = COALESCE(p_oportunidad_id, oportunidad_id),
               estado = 'apartada', apartado_motivo = btrim(p_apartado_motivo),
               forma_adquisicion = v_forma, estado_validacion = 'pendiente_captura',
               actualizado_en = v_now
         WHERE id = v_operation.id RETURNING * INTO v_operation;

        INSERT INTO public.propiedad_unidad_movimientos (organizacion_id, unidad_id, oportunidad_id, persona_id, estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por)
        VALUES (p_organizacion_id, p_unidad_id, COALESCE(p_oportunidad_id, v_operation.oportunidad_id), p_cliente_principal_id, 'reservado'::public.propiedad_status, 'apartado'::public.propiedad_status, COALESCE(p_precio_ofrecido, v_unidad.precio), v_moneda, 'apartado_explicito_desde_reserva', p_agente_usuario_id);

        UPDATE public.propiedad_unidades SET status = 'apartado'::public.propiedad_status, oportunidad_id = COALESCE(p_oportunidad_id, oportunidad_id), actualizado_en = v_now WHERE id = p_unidad_id;
    ELSE
        INSERT INTO public.operaciones_inmobiliarias (organizacion_id, unidad_id, oportunidad_id, cliente_principal_id, agente_usuario_id, estado, apartado_horas, apartado_iniciado_en, apartado_vencimiento_en, apartado_motivo, forma_adquisicion, precio_ofrecido, moneda)
        VALUES (p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id, p_agente_usuario_id, 'reservada', p_apartado_horas, v_now, v_now + make_interval(hours => p_apartado_horas), btrim(p_apartado_motivo), v_forma, p_precio_ofrecido, v_moneda)
        RETURNING * INTO v_operation;
        UPDATE public.propiedad_unidades SET status = 'reservado'::public.propiedad_status, oportunidad_id = COALESCE(p_oportunidad_id, oportunidad_id), actualizado_en = v_now WHERE id = p_unidad_id;
        INSERT INTO public.propiedad_unidad_movimientos (organizacion_id, unidad_id, oportunidad_id, persona_id, estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por)
        VALUES (p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id, 'disponible'::public.propiedad_status, 'reservado'::public.propiedad_status, COALESCE(p_precio_ofrecido, v_unidad.precio), v_moneda, 'reserva_temporal_creada', p_agente_usuario_id);
    END IF;

    RETURN QUERY SELECT v_operation.id, v_operation.unidad_id, v_operation.estado, v_operation.apartado_iniciado_en, v_operation.apartado_vencimiento_en, v_operation.cliente_principal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_apartar_propiedad(uuid, uuid, uuid, uuid, uuid, smallint, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_apartar_propiedad(uuid, uuid, uuid, uuid, uuid, smallint, text, text, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_cancelar_reserva_inmobiliaria(
    p_organizacion_id uuid, p_operacion_id uuid, p_usuario_id uuid DEFAULT NULL, p_motivo text DEFAULT 'cancelacion_manual'
)
RETURNS SETOF public.operaciones_inmobiliarias
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_operation public.operaciones_inmobiliarias%ROWTYPE; v_unit public.propiedad_unidades%ROWTYPE;
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_operation FROM public.operaciones_inmobiliarias WHERE id = p_operacion_id AND organizacion_id = p_organizacion_id AND estado = 'reservada' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_reserva_not_found'; END IF;
    UPDATE public.cotizaciones SET estatus = 'cancelada', actualizado_en = now() WHERE organizacion_id = p_organizacion_id AND operacion_inmobiliaria_id = p_operacion_id AND estatus IN ('borrador', 'enviada');
    SELECT * INTO v_unit FROM public.propiedad_unidades WHERE id = v_operation.unidad_id FOR UPDATE;
    IF FOUND AND v_unit.status = 'reservado'::public.propiedad_status THEN
        UPDATE public.propiedad_unidades SET status = 'disponible'::public.propiedad_status, oportunidad_id = CASE WHEN oportunidad_id = v_operation.oportunidad_id THEN NULL ELSE oportunidad_id END, actualizado_en = now() WHERE id = v_operation.unidad_id;
        INSERT INTO public.propiedad_unidad_movimientos (organizacion_id, unidad_id, oportunidad_id, persona_id, estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por)
        VALUES (p_organizacion_id, v_operation.unidad_id, v_operation.oportunidad_id, v_operation.cliente_principal_id, 'reservado'::public.propiedad_status, 'disponible'::public.propiedad_status, COALESCE(v_operation.precio_acordado, v_operation.precio_ofrecido, v_unit.precio), v_operation.moneda, COALESCE(NULLIF(btrim(p_motivo), ''), 'cancelacion_manual'), p_usuario_id);
    END IF;
    UPDATE public.operaciones_inmobiliarias SET estado = 'cancelada', cancelada_en = now(), cancelada_por = p_usuario_id, motivo_cancelacion = COALESCE(NULLIF(btrim(p_motivo), ''), 'cancelacion_manual'), actualizado_en = now() WHERE id = p_operacion_id RETURNING * INTO v_operation;
    RETURN NEXT v_operation;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_cancelar_reserva_inmobiliaria(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_cancelar_reserva_inmobiliaria(uuid, uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_expirar_reservas_inmobiliarias()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_count integer := 0;
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_unit public.propiedad_unidades%ROWTYPE;
BEGIN
    FOR v_operation IN
        SELECT op.*
          FROM public.operaciones_inmobiliarias op
         WHERE op.estado = 'reservada'
           AND op.apartado_vencimiento_en IS NOT NULL
           AND op.apartado_vencimiento_en <= now()
         FOR UPDATE
    LOOP
        UPDATE public.cotizaciones
           SET estatus = 'cancelada', actualizado_en = now()
         WHERE organizacion_id = v_operation.organizacion_id
           AND operacion_inmobiliaria_id = v_operation.id
           AND estatus IN ('borrador', 'enviada');

        SELECT * INTO v_unit
          FROM public.propiedad_unidades
         WHERE id = v_operation.unidad_id
         FOR UPDATE;

        IF FOUND AND v_unit.status = 'reservado'::public.propiedad_status THEN
            UPDATE public.propiedad_unidades
               SET status = 'disponible'::public.propiedad_status,
                   oportunidad_id = CASE WHEN oportunidad_id = v_operation.oportunidad_id THEN NULL ELSE oportunidad_id END,
                   actualizado_en = now()
             WHERE id = v_operation.unidad_id;

            INSERT INTO public.propiedad_unidad_movimientos (
                organizacion_id, unidad_id, oportunidad_id, persona_id,
                estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
            ) VALUES (
                v_operation.organizacion_id, v_operation.unidad_id, v_operation.oportunidad_id,
                v_operation.cliente_principal_id, 'reservado'::public.propiedad_status,
                'disponible'::public.propiedad_status,
                COALESCE(v_operation.precio_acordado, v_operation.precio_ofrecido, v_unit.precio),
                v_operation.moneda, 'reserva_vencida', NULL
            );
        END IF;

        UPDATE public.operaciones_inmobiliarias
           SET estado = 'cancelada', cancelada_en = now(),
               motivo_cancelacion = 'reserva_vencida', actualizado_en = now()
         WHERE id = v_operation.id;
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_expirar_reservas_inmobiliarias() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_expirar_reservas_inmobiliarias() TO service_role;

DO $schedule$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirar_reservas_inmobiliarias') THEN PERFORM cron.unschedule('expirar_reservas_inmobiliarias'); END IF;
        PERFORM cron.schedule('expirar_reservas_inmobiliarias', '*/15 * * * *', $job$SELECT public.crm_expirar_reservas_inmobiliarias();$job$);
    END IF;
END
$schedule$;

-- La capa geográfica nunca debe volver a presentar una operación borrador.
CREATE OR REPLACE FUNCTION public.crm_propiedades_geojson(p_organizacion uuid, p_nivel integer DEFAULT NULL, p_tipo uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_payload jsonb;
BEGIN
    IF auth.role() <> 'service_role' AND NOT (p_organizacion = public.usuario_organizacion_id(auth.uid()) OR public.es_admin(auth.uid())) THEN RAISE EXCEPTION 'organizacion_no_autorizada' USING ERRCODE = '42501'; END IF;
    v_payload := public.crm_propiedades_geojson_impl(p_organizacion, p_nivel, p_tipo);
    RETURN jsonb_build_object('type', 'FeatureCollection', 'features', COALESCE((
        SELECT jsonb_agg(CASE WHEN feature->>'layer' = 'unidad' AND operation.id IS NOT NULL THEN feature || jsonb_build_object('properties', (feature->'properties') || jsonb_build_object(
            'operation_id', operation.id, 'operation_status', operation.estado, 'operation_validation_status', operation.estado_validacion,
            'display_status', CASE WHEN operation.estado = 'apartada' AND operation.estado_validacion = 'firme' THEN 'apartado_firme' WHEN operation.estado = 'apartada' THEN 'apartado_revision' WHEN operation.estado = 'reservada' THEN 'reservado' ELSE feature->'properties'->>'status' END,
            'display_status_label', CASE WHEN operation.estado = 'apartada' AND operation.estado_validacion = 'firme' THEN 'Apartado firme' WHEN operation.estado = 'apartada' THEN 'Apartado en validación' WHEN operation.estado = 'reservada' THEN 'Reservado' ELSE feature->'properties'->>'status' END,
            'status_color', CASE WHEN operation.estado = 'apartada' THEN '#F1C40F' WHEN operation.estado = 'reservada' THEN '#F97316' ELSE feature->'properties'->>'status_color' END,
            'color', CASE WHEN operation.estado = 'apartada' THEN '#F1C40F' WHEN operation.estado = 'reservada' THEN '#F97316' ELSE feature->'properties'->>'color' END
        )) ELSE feature END) FROM jsonb_array_elements(COALESCE(v_payload->'features', '[]'::jsonb)) AS feature
        LEFT JOIN LATERAL (SELECT op.id, op.estado, op.estado_validacion FROM public.operaciones_inmobiliarias op WHERE feature->>'layer' = 'unidad' AND op.organizacion_id = p_organizacion AND op.unidad_id = (feature->>'id')::uuid AND op.estado IN ('apartada', 'reservada') ORDER BY CASE op.estado WHEN 'reservada' THEN 1 WHEN 'apartada' THEN 2 ELSE 3 END, op.actualizado_en DESC LIMIT 1) operation ON TRUE
    ), '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMENT ON TABLE public.operaciones_inmobiliarias IS 'Historial inmobiliario: reservada es temporal; apartada requiere acción explícita y expediente; no existe borrador operativo.';
COMMENT ON COLUMN public.operaciones_inmobiliarias.apartado_vencimiento_en IS 'Vencimiento de la reserva temporal cuando estado=reservada; no convierte automáticamente la operación en apartada.';

COMMIT;
