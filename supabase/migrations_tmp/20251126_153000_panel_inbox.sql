-- Panel inbox metrics and listings
BEGIN;

CREATE OR REPLACE FUNCTION public.panel_inbox_resumen(
    p_estado text DEFAULT NULL,
    p_asignado uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
WITH visibles AS (
    SELECT
        c.id,
        c.estado,
        c.no_leidos,
        c.asignado_a_usuario_id
    FROM public.conversaciones c
    WHERE public.puede_ver_conversacion(c.id)
      AND (p_estado IS NULL OR lower(c.estado) = lower(p_estado))
      AND (p_asignado IS NULL OR c.asignado_a_usuario_id = p_asignado)
),
counts AS (
    SELECT
        COUNT(*) AS total,
        COALESCE(SUM(GREATEST(no_leidos, 0)), 0) AS unread,
        COUNT(*) FILTER (WHERE lower(estado) = 'pendiente') AS awaiting,
        COUNT(*) FILTER (WHERE lower(estado) = 'abierta') AS abiertas,
        COUNT(*) FILTER (WHERE lower(estado) = 'cerrada') AS cerradas,
        COUNT(*) FILTER (WHERE asignado_a_usuario_id = auth.uid()) AS asignadas_a_mi
    FROM visibles
)
SELECT jsonb_build_object(
    'total', COALESCE((SELECT total FROM counts), 0),
    'unread', COALESCE((SELECT unread FROM counts), 0),
    'awaiting', COALESCE((SELECT awaiting FROM counts), 0),
    'open', COALESCE((SELECT abiertas FROM counts), 0),
    'closed', COALESCE((SELECT cerradas FROM counts), 0),
    'assigned', COALESCE((SELECT asignadas_a_mi FROM counts), 0),
    'folders', jsonb_build_array(
        jsonb_build_object('id', 'inbox', 'count', COALESCE((SELECT abiertas + awaiting FROM counts), 0)),
        jsonb_build_object('id', 'assigned', 'count', COALESCE((SELECT asignadas_a_mi FROM counts), 0)),
        jsonb_build_object('id', 'pending', 'count', COALESCE((SELECT awaiting FROM counts), 0)),
        jsonb_build_object('id', 'closed', 'count', COALESCE((SELECT cerradas FROM counts), 0))
    )
);
$function$;

CREATE OR REPLACE FUNCTION public.panel_inbox_threads(
    p_estado text DEFAULT NULL,
    p_asignado uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_message_limit integer DEFAULT 20
) RETURNS TABLE(
    conversacion_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    canal text,
    estado text,
    prioridad integer,
    iniciada_en timestamptz,
    ultimo_mensaje_en timestamptz,
    no_leidos integer,
    asignado_id uuid,
    asignado_nombre text,
    tags text[],
    last_message_preview text,
    last_message_at timestamptz,
    messages jsonb,
    total_rows bigint
)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
WITH filtered AS (
    SELECT
        c.id AS conversacion_id,
        c.contacto_id,
        ct.nombre_completo AS contacto_nombre,
        NULLIF(ct.correo, '') AS contacto_correo,
        NULLIF(ct.telefono_e164, '') AS contacto_telefono,
        c.canal,
        c.estado,
        c.prioridad,
        c.iniciada_en,
        c.ultimo_mensaje_en,
        COALESCE(c.no_leidos, 0) AS no_leidos,
        c.asignado_a_usuario_id AS asignado_id,
        asignado.nombre_completo AS asignado_nombre,
        ARRAY(
            SELECT jsonb_array_elements_text(COALESCE(ci.tags, '[]'::jsonb))
        ) AS tags
    FROM public.conversaciones c
    JOIN public.contactos ct ON ct.id = c.contacto_id
    LEFT JOIN public.usuarios asignado ON asignado.id = c.asignado_a_usuario_id
    LEFT JOIN public.conversaciones_insights ci ON ci.conversacion_id = c.id
    WHERE public.puede_ver_conversacion(c.id)
      AND (p_estado IS NULL OR lower(c.estado) = lower(p_estado))
      AND (p_asignado IS NULL OR c.asignado_a_usuario_id = p_asignado)
),
annotated AS (
    SELECT
        f.*,
        COUNT(*) OVER () AS total_rows,
        COALESCE(f.ultimo_mensaje_en, f.iniciada_en) AS sort_key
    FROM filtered f
)
SELECT
    a.conversacion_id,
    a.contacto_id,
    a.contacto_nombre,
    a.contacto_correo,
    a.contacto_telefono,
    a.canal,
    a.estado,
    a.prioridad,
    a.iniciada_en,
    a.ultimo_mensaje_en,
    a.no_leidos,
    a.asignado_id,
    a.asignado_nombre,
    a.tags,
    last_msg.preview_text AS last_message_preview,
    last_msg.preview_at AS last_message_at,
    messages.items AS messages,
    a.total_rows
FROM annotated a
LEFT JOIN LATERAL (
    SELECT
        m.texto AS preview_text,
        m.creado_en AS preview_at
    FROM public.mensajes m
    WHERE m.conversacion_id = a.conversacion_id
    ORDER BY m.creado_en DESC
    LIMIT 1
) last_msg ON TRUE
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'message_id', msg.id,
            'author', CASE
                WHEN msg.direccion = 'entrante' THEN COALESCE(a.contacto_nombre, 'Visitante')
                ELSE COALESCE(a.asignado_nombre, 'Equipo Tal-IA')
            END,
            'role', CASE WHEN msg.direccion = 'entrante' THEN 'contacto' ELSE 'usuario' END,
            'timestamp', msg.creado_en,
            'body', ARRAY[COALESCE(NULLIF(msg.texto, ''), '(mensaje sin texto)')],
            'tipo_contenido', msg.tipo_contenido,
            'datos', msg.datos
        )
        ORDER BY msg.creado_en
    ) AS items
    FROM (
        SELECT m.*
        FROM public.mensajes m
        WHERE m.conversacion_id = a.conversacion_id
        ORDER BY m.creado_en DESC
        LIMIT GREATEST(COALESCE(p_message_limit, 20), 1)
    ) AS msg
) messages ON TRUE
ORDER BY a.sort_key DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 50)
OFFSET GREATEST(p_offset, 0);
$function$;

CREATE OR REPLACE FUNCTION public.panel_inbox_messages(
    p_conversacion_id uuid,
    p_limit integer DEFAULT 100,
    p_before timestamptz DEFAULT NULL
) RETURNS TABLE(
    message_id uuid,
    conversacion_id uuid,
    author text,
    role text,
    body text[],
    tipo_contenido text,
    datos jsonb,
    creado_en timestamptz
)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
WITH authorized AS (
    SELECT c.id, c.contacto_id, ct.nombre_completo AS contacto_nombre, u.nombre_completo AS asignado_nombre
    FROM public.conversaciones c
    JOIN public.contactos ct ON ct.id = c.contacto_id
    LEFT JOIN public.usuarios u ON u.id = c.asignado_a_usuario_id
    WHERE c.id = p_conversacion_id
      AND public.puede_ver_conversacion(c.id)
)
SELECT
    m.id AS message_id,
    m.conversacion_id,
    CASE
        WHEN m.direccion = 'entrante' THEN COALESCE(a.contacto_nombre, 'Visitante')
        ELSE COALESCE(a.asignado_nombre, 'Equipo Tal-IA')
    END AS author,
    CASE WHEN m.direccion = 'entrante' THEN 'contacto' ELSE 'usuario' END AS role,
    ARRAY[COALESCE(NULLIF(m.texto, ''), '(mensaje sin texto)')] AS body,
    m.tipo_contenido,
    m.datos,
    m.creado_en
FROM authorized a
JOIN public.mensajes m ON m.conversacion_id = a.id
WHERE (p_before IS NULL OR m.creado_en < p_before)
ORDER BY m.creado_en DESC
LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$function$;

GRANT EXECUTE ON FUNCTION public.panel_inbox_resumen(text, uuid)
    TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.panel_inbox_threads(
    text,
    uuid,
    integer,
    integer,
    integer
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.panel_inbox_messages(
    uuid,
    integer,
    timestamptz
) TO authenticated, service_role;

COMMIT;
