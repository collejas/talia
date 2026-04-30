BEGIN;

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
    creado_en timestamptz,
    attachments jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
WITH authorized AS (
    SELECT
        c.id,
        c.contacto_id,
        coalesce(nullif(pe.nombre_completo, ''), nullif(ct_legacy.nombre_completo, '')) AS contacto_nombre,
        coalesce(nullif(pe.telefono_principal_e164, ''), nullif(ct_legacy.telefono_e164, '')) AS contacto_telefono,
        u.nombre_completo AS asignado_nombre
    FROM public.conversaciones c
    LEFT JOIN public.personas pe ON pe.id = c.contacto_id
    LEFT JOIN public.contactos ct_legacy ON ct_legacy.id = c.contacto_id
    LEFT JOIN public.usuarios u ON u.id = c.asignado_a_usuario_id
    WHERE c.id = p_conversacion_id
      AND public.puede_ver_conversacion(c.id)
),
target_messages AS (
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
            '[]'::jsonb
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
