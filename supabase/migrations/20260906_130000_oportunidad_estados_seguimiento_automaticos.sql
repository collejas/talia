BEGIN;

-- Evalúa el estado de seguimiento con la configuración de cada organización.
-- Solo procesa oportunidades abiertas con una interacción del prospecto
-- conocida; no convierte oportunidades sin historial en dormidas por
-- inferencia.
CREATE OR REPLACE FUNCTION public.evaluar_oportunidades_seguimiento(
    p_organizacion_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_org record;
    v_updated integer := 0;
    v_orgs integer := 0;
    v_rows integer := 0;
BEGIN
    FOR v_org IN
        SELECT
            o.id AS organizacion_id,
            COALESCE(c.dias_activo_hasta, 7) AS dias_activo_hasta,
            COALESCE(c.dias_en_riesgo_hasta, 15) AS dias_en_riesgo_hasta,
            COALESCE(c.dias_estancado_hasta, 30) AS dias_estancado_hasta,
            COALESCE(c.dias_dormido_desde, 31) AS dias_dormido_desde
        FROM public.organizaciones o
        LEFT JOIN public.oportunidad_seguimiento_configuracion c
            ON c.organizacion_id = o.id
        WHERE p_organizacion_id IS NULL OR o.id = p_organizacion_id
    LOOP
        v_orgs := v_orgs + 1;

        WITH clasificacion AS (
            SELECT
                oportunidad.id,
                CASE
                    WHEN EXTRACT(EPOCH FROM (
                        now() - oportunidad.ultima_interaccion_contacto_en
                    )) / 86400 <= v_org.dias_activo_hasta THEN 'activo'
                    WHEN EXTRACT(EPOCH FROM (
                        now() - oportunidad.ultima_interaccion_contacto_en
                    )) / 86400 <= v_org.dias_en_riesgo_hasta THEN 'en_riesgo'
                    WHEN EXTRACT(EPOCH FROM (
                        now() - oportunidad.ultima_interaccion_contacto_en
                    )) / 86400 <= v_org.dias_estancado_hasta THEN 'estancado'
                    ELSE 'dormido'
                END AS estado_nuevo
            FROM public.oportunidades oportunidad
            WHERE oportunidad.organizacion_id = v_org.organizacion_id
              AND oportunidad.estado = 'abierta'
              AND oportunidad.ultima_interaccion_contacto_en IS NOT NULL
        )
        UPDATE public.oportunidades oportunidad
        SET estado_seguimiento = clasificacion.estado_nuevo
        FROM clasificacion
        WHERE oportunidad.id = clasificacion.id
          AND oportunidad.estado_seguimiento IS DISTINCT FROM clasificacion.estado_nuevo;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_updated := v_updated + v_rows;
    END LOOP;

    RETURN jsonb_build_object(
        'organizaciones_procesadas', v_orgs,
        'oportunidades_actualizadas', v_updated,
        'evaluado_en', now()
    );
END;
$function$;

COMMENT ON FUNCTION public.evaluar_oportunidades_seguimiento(uuid)
    IS 'Actualiza estados de seguimiento por tenant usando ultima_interaccion_contacto_en y umbrales configurados.';

REVOKE ALL ON FUNCTION public.evaluar_oportunidades_seguimiento(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluar_oportunidades_seguimiento(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluar_oportunidades_seguimiento(uuid) TO service_role;

-- La migración base ya registra CAMBIO_ESTADO_SEGUIMIENTO. Estos eventos
-- específicos permiten medir cuándo una oportunidad entra a cada estado.
CREATE OR REPLACE FUNCTION public.registrar_evento_estado_seguimiento_especifico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF OLD.estado_seguimiento IS DISTINCT FROM NEW.estado_seguimiento
       AND NEW.estado_seguimiento IN ('estancado', 'dormido') THEN
        INSERT INTO public.oportunidad_eventos (
            organizacion_id,
            oportunidad_id,
            tipo_evento,
            estado_anterior,
            estado_nuevo,
            valor_oportunidad
        ) VALUES (
            NEW.organizacion_id,
            NEW.id,
            CASE
                WHEN NEW.estado_seguimiento = 'estancado'
                    THEN 'OPORTUNIDAD_ESTANCADA'
                ELSE 'OPORTUNIDAD_DORMIDA'
            END,
            OLD.estado_seguimiento,
            NEW.estado_seguimiento,
            NEW.monto_estimado
        );
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_evento_estado_seguimiento_especifico() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_evento_estado_seguimiento_especifico() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_evento_estado_seguimiento_especifico() TO service_role;

DROP TRIGGER IF EXISTS oportunidades_registrar_estado_especifico
    ON public.oportunidades;
CREATE TRIGGER oportunidades_registrar_estado_especifico
AFTER UPDATE OF estado_seguimiento ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.registrar_evento_estado_seguimiento_especifico();

COMMIT;
