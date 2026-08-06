BEGIN;

-- Inbox muestra un hilo por identidad WhatsApp, aunque el ciclo comercial
-- haya creado varias conversaciones y oportunidades relacionadas.
CREATE OR REPLACE FUNCTION public.panel_inbox_threads_grouped(
    p_estado text DEFAULT NULL::text,
    p_asignado uuid DEFAULT NULL::uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_message_limit integer DEFAULT 20,
    p_source text DEFAULT NULL::text,
    p_channel text DEFAULT NULL::text,
    p_batch_id uuid DEFAULT NULL::uuid,
    p_campana_id uuid DEFAULT NULL::uuid,
    p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_to timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(
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
    iniciada_en timestamp with time zone,
    ultimo_mensaje_en timestamp with time zone,
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
    last_message_at timestamp with time zone,
    messages jsonb,
    total_rows bigint,
    reengage_attempts integer,
    inbox_context jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH raw AS (
    SELECT *
    FROM public.panel_inbox_threads(
        p_estado => p_estado,
        p_asignado => p_asignado,
        p_limit => 10000,
        p_offset => 0,
        p_message_limit => p_message_limit,
        p_source => p_source,
        p_channel => p_channel,
        p_batch_id => p_batch_id,
        p_campana_id => p_campana_id,
        p_from => p_from,
        p_to => p_to
    )
), identified AS (
    SELECT
        r.*,
        CASE
            WHEN lower(COALESCE(r.canal, '')) = 'whatsapp' THEN
                'whatsapp:' || COALESCE(
                    NULLIF(
                        CASE
                            WHEN length(regexp_replace(COALESCE(r.contacto_telefono, ''), '[^0-9]', '', 'g')) = 13
                                 AND left(regexp_replace(COALESCE(r.contacto_telefono, ''), '[^0-9]', '', 'g'), 3) = '521'
                            THEN '52' || substr(regexp_replace(COALESCE(r.contacto_telefono, ''), '[^0-9]', '', 'g'), 4)
                            ELSE regexp_replace(COALESCE(r.contacto_telefono, ''), '[^0-9]', '', 'g')
                        END,
                        ''
                    ),
                    r.contacto_id::text
                )
            ELSE 'conversation:' || r.conversacion_id::text
        END AS group_key
    FROM raw r
), ranked AS (
    SELECT
        i.*,
        row_number() OVER (
            PARTITION BY i.group_key
            ORDER BY COALESCE(i.ultimo_mensaje_en, i.iniciada_en) DESC NULLS LAST, i.conversacion_id DESC
        ) AS group_rank
    FROM identified i
), canonical AS (
    SELECT *
    FROM ranked
    WHERE group_rank = 1
), history_values AS (
    SELECT group_key, unnest(
        array_append(COALESCE(conversation_history, ARRAY[]::text[]), conversacion_id::text)
    ) AS history_id
    FROM identified
), histories AS (
    SELECT group_key, array_agg(DISTINCT history_id ORDER BY history_id) AS conversation_history
    FROM history_values
    GROUP BY group_key
), message_values AS (
    SELECT
        i.group_key,
        item,
        row_number() OVER (
            PARTITION BY i.group_key, item->>'message_id'
            ORDER BY (item->>'timestamp')::timestamptz DESC NULLS LAST
        ) AS message_rank
    FROM identified i
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.messages, '[]'::jsonb)) AS messages(item)
), messages_by_group AS (
    SELECT
        group_key,
        jsonb_agg(item ORDER BY (item->>'timestamp')::timestamptz ASC NULLS LAST) AS messages
    FROM message_values
    WHERE message_rank = 1
    GROUP BY group_key
), grouped AS (
    SELECT
        c.conversacion_id,
        c.contacto_id,
        c.contacto_nombre,
        c.contacto_correo,
        c.contacto_telefono,
        c.canal,
        c.source,
        c.batch_id,
        c.campana_id,
        c.estado,
        c.prioridad,
        c.iniciada_en,
        c.ultimo_mensaje_en,
        (
            SELECT COALESCE(sum(COALESCE(i.no_leidos, 0)), 0)::integer
            FROM identified i
            WHERE i.group_key = c.group_key
        ) AS no_leidos,
        c.asignado_id,
        c.asignado_nombre,
        c.tags,
        c.manual_override,
        c.oportunidad_id,
        c.parent_opportunity_id,
        c.restart_sequence,
        h.conversation_history,
        c.last_message_preview,
        c.last_message_at,
        COALESCE(m.messages, '[]'::jsonb) AS messages,
        c.reengage_attempts,
        c.inbox_context,
        c.group_key
    FROM canonical c
    LEFT JOIN histories h ON h.group_key = c.group_key
    LEFT JOIN messages_by_group m ON m.group_key = c.group_key
), annotated AS (
    SELECT g.*, count(*) OVER () AS total_rows
    FROM grouped g
), paged AS (
    SELECT *
    FROM annotated
    ORDER BY COALESCE(ultimo_mensaje_en, iniciada_en) DESC NULLS LAST, conversacion_id DESC
    LIMIT GREATEST(COALESCE(NULLIF(p_limit, 0), 50), 1)
    OFFSET GREATEST(p_offset, 0)
)
SELECT
    conversacion_id,
    contacto_id,
    contacto_nombre,
    contacto_correo,
    contacto_telefono,
    canal,
    source,
    batch_id,
    campana_id,
    estado,
    prioridad,
    iniciada_en,
    ultimo_mensaje_en,
    no_leidos,
    asignado_id,
    asignado_nombre,
    tags,
    manual_override,
    oportunidad_id,
    parent_opportunity_id,
    restart_sequence,
    conversation_history,
    last_message_preview,
    last_message_at,
    messages,
    total_rows,
    reengage_attempts,
    inbox_context
FROM paged;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_inbox_threads_grouped(text, uuid, integer, integer, integer, text, text, uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;

COMMIT;
