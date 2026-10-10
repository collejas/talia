BEGIN;

CREATE INDEX IF NOT EXISTS conversaciones_org_persona_id_idx
    ON public.conversaciones (organizacion_id, persona_id)
    WHERE persona_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recalcular_oportunidad_seguimiento(
    p_organizacion_id uuid,
    p_oportunidad_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
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

    WITH objetivo AS (
        SELECT
            o.id,
            o.persona_id,
            o.contacto_principal_id,
            COALESCE(
                NULLIF(o.metadata->>'conversation_id', ''),
                NULLIF(o.metadata->>'conversacion_id', '')
            ) AS conversacion_id_explicita
        FROM public.oportunidades o
        WHERE o.organizacion_id = p_organizacion_id
          AND o.id = p_oportunidad_id
    ),
    conversaciones_atribuidas AS (
        SELECT c.id
        FROM objetivo o
        JOIN public.conversaciones c
          ON c.organizacion_id = p_organizacion_id
         AND c.id::text = o.conversacion_id_explicita
        WHERE o.conversacion_id_explicita IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.oportunidades otra
              WHERE otra.organizacion_id = p_organizacion_id
                AND otra.id <> o.id
                AND COALESCE(
                    NULLIF(otra.metadata->>'conversation_id', ''),
                    NULLIF(otra.metadata->>'conversacion_id', '')
                ) = o.conversacion_id_explicita
          )

        UNION

        SELECT c.id
        FROM objetivo o
        JOIN public.conversaciones c
          ON c.organizacion_id = p_organizacion_id
         AND (
             c.persona_id = o.persona_id
             OR c.contacto_id = o.persona_id
             OR c.persona_id = o.contacto_principal_id
             OR c.contacto_id = o.contacto_principal_id
         )
        WHERE o.conversacion_id_explicita IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.oportunidades otra
              WHERE otra.organizacion_id = p_organizacion_id
                AND otra.id <> o.id
                AND (
                    otra.persona_id = c.persona_id
                    OR otra.persona_id = c.contacto_id
                    OR otra.contacto_principal_id = c.persona_id
                    OR otra.contacto_principal_id = c.contacto_id
                )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.oportunidades explicita
              WHERE explicita.organizacion_id = p_organizacion_id
                AND COALESCE(
                    NULLIF(explicita.metadata->>'conversation_id', ''),
                    NULLIF(explicita.metadata->>'conversacion_id', '')
                ) = c.id::text
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

COMMIT;
