BEGIN;

-- Sincroniza las fechas operativas de seguimiento con el historial real.
-- La interacción del contacto solo proviene de mensajes entrantes; las
-- actividades completadas representan actividad del equipo, no respuesta del
-- prospecto.

CREATE OR REPLACE FUNCTION public.recalcular_oportunidad_seguimiento(
    p_organizacion_id uuid,
    p_oportunidad_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_ultima_interaccion_contacto_en timestamptz;
    v_ultimo_contacto_saliente_en timestamptz;
    v_ultima_actividad_mensaje_en timestamptz;
    v_ultima_actividad_equipo_en timestamptz;
    v_proxima_actividad_en timestamptz;
BEGIN
    IF p_organizacion_id IS NULL OR p_oportunidad_id IS NULL THEN
        RETURN;
    END IF;

    SELECT
        max(m.creado_en) FILTER (WHERE m.direccion = 'entrante'),
        max(m.creado_en) FILTER (WHERE m.direccion = 'saliente'),
        max(m.creado_en)
    INTO
        v_ultima_interaccion_contacto_en,
        v_ultimo_contacto_saliente_en,
        v_ultima_actividad_mensaje_en
    FROM public.mensajes m
    JOIN public.conversaciones c ON c.id = m.conversacion_id
    WHERE c.organizacion_id = p_organizacion_id
      AND EXISTS (
          SELECT 1
          FROM public.oportunidades o
          WHERE o.organizacion_id = p_organizacion_id
            AND o.id = p_oportunidad_id
            AND (
                o.persona_id = c.persona_id
                OR o.persona_id = c.contacto_id
                OR o.contacto_principal_id = c.persona_id
                OR o.contacto_principal_id = c.contacto_id
            )
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.oportunidades otra
          WHERE otra.organizacion_id = p_organizacion_id
            AND otra.id <> p_oportunidad_id
            AND (
                otra.persona_id = c.persona_id
                OR otra.persona_id = c.contacto_id
                OR otra.contacto_principal_id = c.persona_id
                OR otra.contacto_principal_id = c.contacto_id
            )
      );

    SELECT
        max(COALESCE(a.fin_en, a.inicio_en, a.creado_en))
            FILTER (WHERE a.estado IN ('completada', 'realizada', 'cerrada')),
        min(COALESCE(a.fecha_vencimiento, a.inicio_en, a.recordatorio_en))
            FILTER (WHERE a.estado IN ('pendiente', 'programada'))
    INTO
        v_ultima_actividad_equipo_en,
        v_proxima_actividad_en
    FROM public.actividades a
    WHERE a.organizacion_id = p_organizacion_id
      AND a.oportunidad_id = p_oportunidad_id;

    UPDATE public.oportunidades o
    SET ultima_interaccion_contacto_en = v_ultima_interaccion_contacto_en,
        ultimo_contacto_saliente_en = v_ultimo_contacto_saliente_en,
        ultima_actividad_en = CASE
            WHEN v_ultima_actividad_mensaje_en IS NULL THEN v_ultima_actividad_equipo_en
            WHEN v_ultima_actividad_equipo_en IS NULL THEN v_ultima_actividad_mensaje_en
            ELSE GREATEST(v_ultima_actividad_mensaje_en, v_ultima_actividad_equipo_en)
        END,
        proxima_actividad_en = v_proxima_actividad_en
    WHERE o.organizacion_id = p_organizacion_id
      AND o.id = p_oportunidad_id;
END;
$function$;

COMMENT ON FUNCTION public.recalcular_oportunidad_seguimiento(uuid, uuid)
    IS 'Reconstruye fechas de interacción y seguimiento desde mensajes y actividades de una oportunidad.';

-- Backfill idempotente: reconstruye los campos para oportunidades existentes.
DO $function$
DECLARE
    v_oportunidad record;
BEGIN
    FOR v_oportunidad IN
        SELECT o.organizacion_id, o.id
        FROM public.oportunidades o
    LOOP
        PERFORM public.recalcular_oportunidad_seguimiento(
            v_oportunidad.organizacion_id,
            v_oportunidad.id
        );
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sincronizar_oportunidad_desde_mensaje()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_organizacion_id uuid;
    v_oportunidad record;
BEGIN
    SELECT c.organizacion_id
    INTO v_organizacion_id
    FROM public.conversaciones c
    WHERE c.id = NEW.conversacion_id;

    FOR v_oportunidad IN
        SELECT DISTINCT o.id
        FROM public.oportunidades o
        JOIN public.conversaciones c
          ON c.organizacion_id = o.organizacion_id
         AND c.id = NEW.conversacion_id
         AND (
             o.persona_id = c.persona_id
             OR o.persona_id = c.contacto_id
             OR o.contacto_principal_id = c.persona_id
             OR o.contacto_principal_id = c.contacto_id
         )
        WHERE o.organizacion_id = v_organizacion_id
          AND NOT EXISTS (
              SELECT 1
              FROM public.oportunidades otra
              WHERE otra.organizacion_id = o.organizacion_id
                AND otra.id <> o.id
                AND (
                    otra.persona_id = c.persona_id
                    OR otra.persona_id = c.contacto_id
                    OR otra.contacto_principal_id = c.persona_id
                    OR otra.contacto_principal_id = c.contacto_id
                )
          )
    LOOP
        PERFORM public.recalcular_oportunidad_seguimiento(
            v_organizacion_id,
            v_oportunidad.id
        );
    END LOOP;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mensajes_sincronizar_oportunidad_seguimiento
    ON public.mensajes;
CREATE TRIGGER mensajes_sincronizar_oportunidad_seguimiento
AFTER INSERT OR UPDATE OF conversacion_id, direccion, creado_en ON public.mensajes
FOR EACH ROW
EXECUTE FUNCTION public.trg_sincronizar_oportunidad_desde_mensaje();

CREATE OR REPLACE FUNCTION public.trg_sincronizar_oportunidad_desde_conversacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_oportunidad record;
BEGIN
    FOR v_oportunidad IN
        SELECT DISTINCT o.id
        FROM public.oportunidades o
        WHERE o.organizacion_id = NEW.organizacion_id
          AND (
              o.persona_id = NEW.persona_id
              OR o.persona_id = NEW.contacto_id
              OR o.contacto_principal_id = NEW.persona_id
              OR o.contacto_principal_id = NEW.contacto_id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.oportunidades otra
              WHERE otra.organizacion_id = o.organizacion_id
                AND otra.id <> o.id
                AND (
                    otra.persona_id = NEW.persona_id
                    OR otra.persona_id = NEW.contacto_id
                    OR otra.contacto_principal_id = NEW.persona_id
                    OR otra.contacto_principal_id = NEW.contacto_id
                )
          )
    LOOP
        PERFORM public.recalcular_oportunidad_seguimiento(
            NEW.organizacion_id,
            v_oportunidad.id
        );
    END LOOP;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS conversaciones_sincronizar_oportunidad_seguimiento
    ON public.conversaciones;
CREATE TRIGGER conversaciones_sincronizar_oportunidad_seguimiento
AFTER INSERT OR UPDATE OF persona_id, contacto_id, ultimo_entrante_en, ultimo_saliente_en, ultimo_mensaje_en
ON public.conversaciones
FOR EACH ROW
EXECUTE FUNCTION public.trg_sincronizar_oportunidad_desde_conversacion();

CREATE OR REPLACE FUNCTION public.trg_sincronizar_oportunidad_desde_actividad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.oportunidad_id IS NOT NULL THEN
        PERFORM public.recalcular_oportunidad_seguimiento(
            OLD.organizacion_id,
            OLD.oportunidad_id
        );
    END IF;

    IF NEW.organizacion_id IS NOT NULL AND NEW.oportunidad_id IS NOT NULL THEN
        PERFORM public.recalcular_oportunidad_seguimiento(
            NEW.organizacion_id,
            NEW.oportunidad_id
        );
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS actividades_sincronizar_oportunidad_seguimiento
    ON public.actividades;
CREATE TRIGGER actividades_sincronizar_oportunidad_seguimiento
AFTER INSERT OR UPDATE OF oportunidad_id, estado, inicio_en, fin_en, fecha_vencimiento, recordatorio_en
ON public.actividades
FOR EACH ROW
EXECUTE FUNCTION public.trg_sincronizar_oportunidad_desde_actividad();

COMMIT;
