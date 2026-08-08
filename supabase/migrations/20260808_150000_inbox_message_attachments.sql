BEGIN;

-- Older WhatsApp messages keep the normalized attachment payload in datos when
-- the adjuntos relation was not populated. Expose both storage paths to Inbox.
CREATE OR REPLACE FUNCTION public.panel_inbox_messages(
    p_conversacion_id uuid,
    p_limit integer DEFAULT 100,
    p_before timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(
    message_id uuid,
    conversacion_id uuid,
    author text,
    role text,
    body text[],
    tipo_contenido text,
    datos jsonb,
    creado_en timestamp with time zone,
    attachments jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH authorized AS (
    SELECT
        c.id,
        COALESCE(
            NULLIF(pe.nombre_completo, ''),
            NULLIF(c.nombre_remitente, ''),
            NULLIF(c.inbox_context->>'sender_name', ''),
            NULLIF(c.correo_remitente, ''),
            NULLIF(c.inbox_context->>'sender_email', '')
        ) AS contacto_nombre,
        u.nombre_completo AS asignado_nombre
    FROM public.conversaciones c
    LEFT JOIN public.personas pe
      ON pe.id = COALESCE(c.persona_id, c.contacto_id)
    LEFT JOIN public.usuarios u ON u.id = c.asignado_a_usuario_id
    WHERE c.id = p_conversacion_id
      AND public.puede_ver_conversacion(c.id)
), target_messages AS (
    SELECT
        m.id,
        m.conversacion_id,
        m.direccion,
        m.texto,
        m.tipo_contenido,
        m.datos,
        m.creado_en,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', a.id,
                        'url', a.url,
                        'mime', a.mime,
                        'size', COALESCE(a.size_bytes, a.tamano_bytes),
                        'name', a.nombre,
                        'provider_id', a.proveedor_id,
                        'path', a.path
                    ) ORDER BY a.creado_en ASC
                )
                FROM public.adjuntos a
                WHERE a.mensaje_id = m.id
            ),
            CASE
                WHEN jsonb_typeof(m.datos->'attachments') = 'array'
                THEN m.datos->'attachments'
                ELSE '[]'::jsonb
            END
        ) AS attachments_json
    FROM public.mensajes m
    WHERE m.conversacion_id = p_conversacion_id
      AND (p_before IS NULL OR m.creado_en < p_before)
    ORDER BY m.creado_en DESC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
)
SELECT
    tm.id AS message_id,
    tm.conversacion_id,
    CASE
        WHEN tm.direccion = 'entrante' THEN COALESCE(a.contacto_nombre, 'Visitante')
        ELSE COALESCE(a.asignado_nombre, 'Equipo Tal-IA')
    END AS author,
    CASE WHEN tm.direccion = 'entrante' THEN 'contacto' ELSE 'usuario' END AS role,
    ARRAY[COALESCE(NULLIF(tm.texto, ''), '(mensaje sin texto)')] AS body,
    tm.tipo_contenido,
    tm.datos,
    tm.creado_en,
    tm.attachments_json AS attachments
FROM authorized a
JOIN target_messages tm ON tm.conversacion_id = a.id
ORDER BY tm.creado_en DESC;
$function$;

COMMIT;
