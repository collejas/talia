BEGIN;

-- Determina si una conversación pertenece inequívocamente a una oportunidad.
-- La relación explícita en metadata tiene prioridad; la relación por persona
-- solo se usa cuando no existe ninguna relación explícita.
CREATE OR REPLACE FUNCTION public.conversacion_corresponde_oportunidad(
    p_organizacion_id uuid,
    p_oportunidad_id uuid,
    p_conversacion_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_conversacion record;
    v_match_explicito integer;
    v_match_persona integer;
BEGIN
    SELECT c.id, c.persona_id, c.contacto_id
    INTO v_conversacion
    FROM public.conversaciones c
    WHERE c.organizacion_id = p_organizacion_id
      AND c.id = p_conversacion_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    SELECT count(*)
    INTO v_match_explicito
    FROM public.oportunidades o
    WHERE o.organizacion_id = p_organizacion_id
      AND (
          o.metadata->>'conversation_id' = p_conversacion_id::text
          OR o.metadata->>'conversacion_id' = p_conversacion_id::text
      );

    IF v_match_explicito > 0 THEN
        RETURN v_match_explicito = 1
           AND EXISTS (
               SELECT 1
               FROM public.oportunidades o
               WHERE o.organizacion_id = p_organizacion_id
                 AND o.id = p_oportunidad_id
                 AND (
                     o.metadata->>'conversation_id' = p_conversacion_id::text
                     OR o.metadata->>'conversacion_id' = p_conversacion_id::text
                 )
           );
    END IF;

    SELECT count(*)
    INTO v_match_persona
    FROM public.oportunidades o
    WHERE o.organizacion_id = p_organizacion_id
      AND (
          o.persona_id = v_conversacion.persona_id
          OR o.persona_id = v_conversacion.contacto_id
          OR o.contacto_principal_id = v_conversacion.persona_id
          OR o.contacto_principal_id = v_conversacion.contacto_id
      );

    RETURN v_match_persona = 1
       AND EXISTS (
           SELECT 1
           FROM public.oportunidades o
           WHERE o.organizacion_id = p_organizacion_id
             AND o.id = p_oportunidad_id
             AND (
                 o.persona_id = v_conversacion.persona_id
                 OR o.persona_id = v_conversacion.contacto_id
                 OR o.contacto_principal_id = v_conversacion.persona_id
                 OR o.contacto_principal_id = v_conversacion.contacto_id
             )
       );
END;
$function$;

REVOKE ALL ON FUNCTION public.conversacion_corresponde_oportunidad(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conversacion_corresponde_oportunidad(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversacion_corresponde_oportunidad(uuid, uuid, uuid) TO service_role;

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

    WITH conversaciones_atribuidas AS (
        SELECT c.id
        FROM public.conversaciones c
        WHERE c.organizacion_id = p_organizacion_id
          AND (
              (
                  EXISTS (
                      SELECT 1
                      FROM public.oportunidades o
                      WHERE o.organizacion_id = p_organizacion_id
                        AND o.id = p_oportunidad_id
                        AND (
                            o.metadata->>'conversation_id' = c.id::text
                            OR o.metadata->>'conversacion_id' = c.id::text
                        )
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.oportunidades otra
                      WHERE otra.organizacion_id = p_organizacion_id
                        AND otra.id <> p_oportunidad_id
                        AND (
                            otra.metadata->>'conversation_id' = c.id::text
                            OR otra.metadata->>'conversacion_id' = c.id::text
                        )
                  )
              )
              OR (
                  NOT EXISTS (
                      SELECT 1
                      FROM public.oportunidades explicita
                      WHERE explicita.organizacion_id = p_organizacion_id
                        AND (
                            explicita.metadata->>'conversation_id' = c.id::text
                            OR explicita.metadata->>'conversacion_id' = c.id::text
                        )
                  )
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
                  )
              )
          )
    )
    SELECT
        max(m.creado_en) FILTER (WHERE m.direccion = 'entrante'),
        max(m.creado_en) FILTER (WHERE m.direccion = 'saliente'),
        max(m.creado_en)
    INTO
        v_ultima_interaccion_contacto_en,
        v_ultimo_contacto_saliente_en,
        v_ultima_actividad_mensaje_en
    FROM public.mensajes m
    JOIN conversaciones_atribuidas ca ON ca.id = m.conversacion_id;

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
        SELECT o.id
        FROM public.oportunidades o
        WHERE o.organizacion_id = v_organizacion_id
          AND public.conversacion_corresponde_oportunidad(
              v_organizacion_id,
              o.id,
              NEW.conversacion_id
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

CREATE OR REPLACE FUNCTION public.trg_sincronizar_oportunidad_desde_conversacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_oportunidad record;
BEGIN
    FOR v_oportunidad IN
        SELECT o.id
        FROM public.oportunidades o
        WHERE o.organizacion_id = NEW.organizacion_id
          AND public.conversacion_corresponde_oportunidad(
              NEW.organizacion_id,
              o.id,
              NEW.id
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

-- Backfill set-based para incorporar relaciones explícitas sin ejecutar una
-- consulta completa por cada oportunidad.
WITH explicit_mapping AS (
    SELECT o.organizacion_id, o.id AS oportunidad_id, c.id AS conversacion_id
    FROM public.oportunidades o
    JOIN public.conversaciones c
      ON c.organizacion_id = o.organizacion_id
     AND (
         o.metadata->>'conversation_id' = c.id::text
         OR o.metadata->>'conversacion_id' = c.id::text
     )
),
fallback_candidates AS (
    SELECT o.organizacion_id, o.id AS oportunidad_id, c.id AS conversacion_id
    FROM public.oportunidades o
    JOIN public.conversaciones c
      ON c.organizacion_id = o.organizacion_id
     AND (
         o.persona_id = c.persona_id
         OR o.persona_id = c.contacto_id
         OR o.contacto_principal_id = c.persona_id
         OR o.contacto_principal_id = c.contacto_id
     )
    WHERE NOT EXISTS (
        SELECT 1
        FROM explicit_mapping em
        WHERE em.organizacion_id = c.organizacion_id
          AND em.conversacion_id = c.id
    )
),
fallback_mapping AS (
    SELECT fc.organizacion_id, fc.oportunidad_id, fc.conversacion_id
    FROM fallback_candidates fc
    WHERE fc.conversacion_id IN (
        SELECT conversacion_id
        FROM fallback_candidates
        GROUP BY conversacion_id
        HAVING count(DISTINCT oportunidad_id) = 1
    )
),
mapping AS (
    SELECT * FROM explicit_mapping
    WHERE conversacion_id IN (
        SELECT conversacion_id
        FROM explicit_mapping
        GROUP BY conversacion_id
        HAVING count(DISTINCT oportunidad_id) = 1
    )
    UNION
    SELECT * FROM fallback_mapping
),
message_rollup AS (
    SELECT
        m.organizacion_id,
        mapping.oportunidad_id,
        max(m.creado_en) FILTER (WHERE m.direccion = 'entrante') AS ultima_interaccion,
        max(m.creado_en) FILTER (WHERE m.direccion = 'saliente') AS ultimo_saliente,
        max(m.creado_en) AS ultima_actividad
    FROM public.mensajes m
    JOIN mapping ON mapping.conversacion_id = m.conversacion_id
    GROUP BY m.organizacion_id, mapping.oportunidad_id
),
activity_rollup AS (
    SELECT
        a.organizacion_id,
        a.oportunidad_id,
        max(COALESCE(a.fin_en, a.inicio_en, a.creado_en))
            FILTER (WHERE a.estado IN ('completada', 'realizada', 'cerrada')) AS ultima_actividad_equipo,
        min(COALESCE(a.fecha_vencimiento, a.inicio_en, a.recordatorio_en))
            FILTER (WHERE a.estado IN ('pendiente', 'programada')) AS proxima_actividad
    FROM public.actividades a
    WHERE a.oportunidad_id IS NOT NULL
    GROUP BY a.organizacion_id, a.oportunidad_id
)
UPDATE public.oportunidades o
SET ultima_interaccion_contacto_en = mr.ultima_interaccion,
    ultimo_contacto_saliente_en = mr.ultimo_saliente,
    ultima_actividad_en = CASE
        WHEN mr.ultima_actividad IS NULL THEN ar.ultima_actividad_equipo
        WHEN ar.ultima_actividad_equipo IS NULL THEN mr.ultima_actividad
        ELSE GREATEST(mr.ultima_actividad, ar.ultima_actividad_equipo)
    END,
    proxima_actividad_en = ar.proxima_actividad
FROM message_rollup mr
LEFT JOIN activity_rollup ar
  ON ar.organizacion_id = mr.organizacion_id
 AND ar.oportunidad_id = mr.oportunidad_id
WHERE o.organizacion_id = mr.organizacion_id
  AND o.id = mr.oportunidad_id;

COMMIT;
