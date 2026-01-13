-- Add reengage attempt counts to inbox thread RPC to surface badges.

DROP FUNCTION IF EXISTS public.panel_inbox_threads(text, uuid, integer, integer, integer);

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
    manual_override boolean,
    oportunidad_id uuid,
    parent_opportunity_id uuid,
    restart_sequence integer,
    conversation_history text[],
    last_message_preview text,
    last_message_at timestamptz,
    messages jsonb,
    total_rows bigint,
    reengage_attempts integer
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
        ) AS tags,
        COALESCE(cc.manual_override, false) AS manual_override,
        opp.oportunidad_id,
        (opp.oportunidad_metadata->>'parent_opportunity_id')::uuid AS parent_opportunity_id,
        COALESCE(
            (opp.oportunidad_metadata->>'restart_sequence')::integer,
            c.restart_sequence,
            1
        ) AS restart_sequence,
        COALESCE(
            (opp.oportunidad_metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer,
            0
        ) AS reengage_attempts,
        COALESCE(
            ARRAY(
                SELECT jsonb_array_elements_text(
                    COALESCE(opp.oportunidad_metadata->'conversation_history', '[]'::jsonb)
                )
            ),
            ARRAY[c.id::text]
        ) AS conversation_history
    FROM public.conversaciones c
    JOIN public.contactos ct ON ct.id = c.contacto_id
    LEFT JOIN public.usuarios asignado ON asignado.id = c.asignado_a_usuario_id
    LEFT JOIN public.conversaciones_insights ci ON ci.conversacion_id = c.id
    LEFT JOIN public.conversaciones_controles cc ON cc.conversacion_id = c.id
    LEFT JOIN LATERAL (
        SELECT o.id AS oportunidad_id, o.metadata AS oportunidad_metadata
        FROM public.oportunidades o
        WHERE o.metadata->>'conversation_id' = c.id::text
        ORDER BY o.creado_en DESC
        LIMIT 1
    ) opp ON TRUE
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
),
messages_by_thread AS (
    SELECT
        a.conversacion_id,
        jsonb_agg(
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
                'datos', msg.datos,
                'attachments', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', adj.id,
                                'url', adj.url,
                                'mime', adj.mime,
                                'size', COALESCE(adj.size_bytes, adj.tamano_bytes),
                                'name', adj.nombre,
                                'provider_id', adj.proveedor_id,
                                'path', adj.path
                            ) ORDER BY adj.creado_en ASC
                        )
                        FROM public.adjuntos adj
                        WHERE adj.mensaje_id = msg.id
                    ),
                    '[]'::jsonb
                )
            )
            ORDER BY msg.creado_en
        ) FILTER (WHERE msg.id IS NOT NULL) AS items
    FROM annotated a
    LEFT JOIN LATERAL (
        SELECT m.*
        FROM public.mensajes m
        WHERE m.conversacion_id = a.conversacion_id
        ORDER BY m.creado_en DESC
        LIMIT GREATEST(COALESCE(p_message_limit, 20), 1)
    ) AS msg ON TRUE
    GROUP BY a.conversacion_id
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
    a.manual_override,
    a.oportunidad_id,
    a.parent_opportunity_id,
    a.restart_sequence,
    a.conversation_history,
    last_msg.preview_text AS last_message_preview,
    last_msg.preview_at AS last_message_at,
    COALESCE(messages.items, '[]'::jsonb) AS messages,
    a.total_rows,
    a.reengage_attempts
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
LEFT JOIN messages_by_thread messages ON messages.conversacion_id = a.conversacion_id
ORDER BY a.sort_key DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 50)
OFFSET GREATEST(p_offset, 0);
$function$;
