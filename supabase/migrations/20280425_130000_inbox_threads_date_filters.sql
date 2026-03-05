-- Inbox: agregar filtros de fecha al RPC principal de hilos.

DROP FUNCTION IF EXISTS public.panel_inbox_threads(
    text,
    uuid,
    integer,
    integer,
    integer,
    text,
    text,
    uuid,
    uuid
);

CREATE OR REPLACE FUNCTION public.panel_inbox_threads(
    p_estado text DEFAULT NULL,
    p_asignado uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_message_limit integer DEFAULT 20,
    p_source text DEFAULT NULL,
    p_channel text DEFAULT NULL,
    p_batch_id uuid DEFAULT NULL,
    p_campana_id uuid DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    conversacion_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    canal text,
    source text,
    batch_id uuid,
    campana_id uuid,
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
        COALESCE(NULLIF(msg_meta.channel, ''), c.canal) AS canal,
        msg_meta.source,
        msg_meta.batch_id,
        msg_meta.campana_id,
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
    LEFT JOIN LATERAL (
        SELECT
            (
                array_agg(
                    lower(
                        NULLIF(
                            COALESCE(m.datos->>'channel', m.datos->>'canal'),
                            ''
                        )
                    )
                    ORDER BY m.creado_en DESC
                )
                FILTER (WHERE NULLIF(COALESCE(m.datos->>'channel', m.datos->>'canal'), '') IS NOT NULL)
            )[1] AS channel,
            (
                array_agg(lower(NULLIF(m.datos->>'source', '')) ORDER BY m.creado_en DESC)
                FILTER (WHERE NULLIF(m.datos->>'source', '') IS NOT NULL)
            )[1] AS source,
            (
                array_agg(
                    CASE
                        WHEN (m.datos->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        THEN (m.datos->>'batch_id')::uuid
                        ELSE NULL
                    END
                    ORDER BY m.creado_en DESC
                )
                FILTER (WHERE NULLIF(m.datos->>'batch_id', '') IS NOT NULL)
            )[1] AS batch_id,
            (
                array_agg(
                    CASE
                        WHEN (m.datos->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        THEN (m.datos->>'campana_id')::uuid
                        ELSE NULL
                    END
                    ORDER BY m.creado_en DESC
                )
                FILTER (WHERE NULLIF(m.datos->>'campana_id', '') IS NOT NULL)
            )[1] AS campana_id
        FROM public.mensajes m
        WHERE m.conversacion_id = c.id
    ) msg_meta ON TRUE
    WHERE public.puede_ver_conversacion(c.id)
      AND (p_estado IS NULL OR lower(c.estado) = lower(p_estado))
      AND (p_asignado IS NULL OR c.asignado_a_usuario_id = p_asignado)
      AND (
        p_channel IS NULL
        OR lower(COALESCE(NULLIF(msg_meta.channel, ''), c.canal)) = lower(p_channel)
      )
      AND (p_source IS NULL OR lower(COALESCE(msg_meta.source, '')) = lower(p_source))
      AND (p_batch_id IS NULL OR COALESCE(msg_meta.batch_id::text, '') = p_batch_id::text)
      AND (p_campana_id IS NULL OR COALESCE(msg_meta.campana_id::text, '') = p_campana_id::text)
      AND (p_from IS NULL OR COALESCE(c.ultimo_mensaje_en, c.iniciada_en) >= p_from)
      AND (p_to IS NULL OR COALESCE(c.ultimo_mensaje_en, c.iniciada_en) <= p_to)
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
    a.source,
    a.batch_id,
    a.campana_id,
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
