BEGIN;

ALTER TABLE public.conversaciones
    ADD COLUMN IF NOT EXISTS correo_remitente text,
    ADD COLUMN IF NOT EXISTS nombre_remitente text;

UPDATE public.conversaciones
SET
    correo_remitente = COALESCE(
        NULLIF(lower(correo_remitente), ''),
        NULLIF(lower(inbox_context->>'sender_email'), '')
    ),
    nombre_remitente = COALESCE(
        NULLIF(nombre_remitente, ''),
        NULLIF(inbox_context->>'sender_name', '')
    )
WHERE (
    correo_remitente IS NULL
    OR nombre_remitente IS NULL
)
  AND (
    NULLIF(inbox_context->>'sender_email', '') IS NOT NULL
    OR NULLIF(inbox_context->>'sender_name', '') IS NOT NULL
  );

ALTER TABLE public.conversaciones
    ALTER COLUMN contacto_id DROP NOT NULL;

ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversaciones_canal_check;

ALTER TABLE public.conversaciones
    ADD CONSTRAINT conversaciones_canal_check
    CHECK (
        canal = ANY (
            ARRAY[
                'whatsapp'::text,
                'instagram'::text,
                'webchat'::text,
                'voz'::text,
                'manual'::text,
                'messenger'::text,
                'correo'::text
            ]
        )
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversaciones_contacto_or_unlinked_email_chk'
          AND conrelid = 'public.conversaciones'::regclass
    ) THEN
        ALTER TABLE public.conversaciones
            ADD CONSTRAINT conversaciones_contacto_or_unlinked_email_chk
            CHECK (
                persona_id IS NOT NULL
                OR contacto_id IS NOT NULL
                OR (
                    lower(canal) = 'correo'
                    AND NULLIF(lower(correo_remitente), '') IS NOT NULL
                )
            );
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS conversaciones_unlinked_email_lookup_idx
    ON public.conversaciones (organizacion_id, correo_remitente, iniciada_en DESC)
    WHERE persona_id IS NULL AND contacto_id IS NULL AND lower(canal) = 'correo' AND correo_remitente IS NOT NULL;

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
        COALESCE(c.persona_id, c.contacto_id) AS persona_id,
        COALESCE(
            NULLIF(pe.nombre_completo, ''),
            NULLIF(c.nombre_remitente, ''),
            NULLIF(c.inbox_context->>'sender_name', ''),
            NULLIF(c.correo_remitente, ''),
            NULLIF(c.inbox_context->>'sender_email', '')
        ) AS contacto_nombre,
        COALESCE(
            NULLIF(pe.telefono_principal_e164, ''),
            NULLIF(c.inbox_context->>'contacto_telefono', '')
        ) AS contacto_telefono,
        u.nombre_completo AS asignado_nombre
    FROM public.conversaciones c
    LEFT JOIN public.personas pe
      ON pe.id = COALESCE(c.persona_id, c.contacto_id)
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

CREATE OR REPLACE FUNCTION public.panel_inbox_threads(
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH filtered AS (
    SELECT
        c.id AS conversacion_id,
        COALESCE(c.persona_id, c.contacto_id) AS contacto_id,
        COALESCE(
            NULLIF(pe.nombre_completo, ''),
            NULLIF(c.nombre_remitente, ''),
            NULLIF(c.inbox_context->>'sender_name', ''),
            NULLIF(c.correo_remitente, ''),
            NULLIF(c.inbox_context->>'sender_email', '')
        ) AS contacto_nombre,
        COALESCE(
            NULLIF(pe.correo_principal, ''),
            NULLIF(lower(c.correo_remitente), ''),
            NULLIF(lower(c.inbox_context->>'sender_email'), '')
        ) AS contacto_correo,
        COALESCE(
            NULLIF(pe.telefono_principal_e164, ''),
            NULLIF(c.inbox_context->>'contacto_telefono', '')
        ) AS contacto_telefono,
        COALESCE(snap.canal, c.canal) AS canal,
        COALESCE(NULLIF(c.inbox_context->>'source', ''), snap.source) AS source,
        COALESCE(
            CASE
                WHEN (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN (c.inbox_context->>'batch_id')::uuid
            END,
            snap.batch_id
        ) AS batch_id,
        COALESCE(
            CASE
                WHEN (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN (c.inbox_context->>'campana_id')::uuid
            END,
            snap.campana_id
        ) AS campana_id,
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
        ) AS conversation_history,
        snap.last_message_preview,
        snap.last_message_at,
        COALESCE(snap.sort_key, c.ultimo_mensaje_en, c.iniciada_en) AS sort_key,
        jsonb_strip_nulls(
            COALESCE(c.inbox_context, '{}'::jsonb)
            || jsonb_build_object(
                'source', COALESCE(NULLIF(c.inbox_context->>'source', ''), snap.source),
                'sender_email', COALESCE(
                    NULLIF(lower(c.correo_remitente), ''),
                    NULLIF(lower(c.inbox_context->>'sender_email'), '')
                ),
                'sender_name', COALESCE(
                    NULLIF(c.nombre_remitente, ''),
                    NULLIF(c.inbox_context->>'sender_name', '')
                ),
                'unlinked_email_inbox',
                CASE
                    WHEN COALESCE(c.persona_id, c.contacto_id) IS NULL
                     AND lower(COALESCE(snap.canal, c.canal, '')) = 'correo'
                    THEN true
                    ELSE NULL
                END,
                'batch_id',
                CASE
                    WHEN COALESCE(
                        CASE
                            WHEN (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                            THEN (c.inbox_context->>'batch_id')::uuid
                        END,
                        snap.batch_id
                    ) IS NOT NULL
                    THEN COALESCE(
                        CASE
                            WHEN (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                            THEN (c.inbox_context->>'batch_id')::uuid
                        END,
                        snap.batch_id
                    )::text
                    ELSE NULL
                END,
                'batch_label',
                COALESCE(
                    NULLIF(c.inbox_context->>'batch_label', ''),
                    NULLIF(batch.titulo, ''),
                    NULLIF(batch.metadata->>'campana_nombre', ''),
                    NULLIF(batch.metadata->>'lista_nombre', '')
                ),
                'campana_id',
                CASE
                    WHEN COALESCE(
                        CASE
                            WHEN (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                            THEN (c.inbox_context->>'campana_id')::uuid
                        END,
                        batch.campana_id,
                        snap.campana_id
                    ) IS NOT NULL
                    THEN COALESCE(
                        CASE
                            WHEN (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                            THEN (c.inbox_context->>'campana_id')::uuid
                        END,
                        batch.campana_id,
                        snap.campana_id
                    )::text
                    ELSE NULL
                END,
                'campana_label', COALESCE(NULLIF(c.inbox_context->>'campana_label', ''), NULLIF(campaign.nombre, '')),
                'template_id',
                CASE
                    WHEN resolved_template.template_id IS NOT NULL THEN resolved_template.template_id::text ELSE NULL
                END,
                'template_slug', resolved_template.template_slug,
                'template_label', resolved_template.template_label
            )
        ) AS inbox_context
    FROM public.conversaciones c
    LEFT JOIN public.personas pe
      ON pe.id = COALESCE(c.persona_id, c.contacto_id)
    LEFT JOIN public.usuarios asignado ON asignado.id = c.asignado_a_usuario_id
    LEFT JOIN public.conversaciones_insights ci ON ci.conversacion_id = c.id
    LEFT JOIN public.conversaciones_controles cc ON cc.conversacion_id = c.id
    LEFT JOIN public.inbox_conversation_snapshot_mv snap ON snap.conversacion_id = c.id
    LEFT JOIN public.prospeccion_contacto_batch batch ON batch.id = COALESCE(
        CASE
            WHEN (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (c.inbox_context->>'batch_id')::uuid
        END,
        snap.batch_id
    )
    LEFT JOIN public.campanas campaign ON campaign.id = COALESCE(
        CASE
            WHEN (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (c.inbox_context->>'campana_id')::uuid
        END,
        batch.campana_id,
        snap.campana_id
    )
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(
                CASE
                    WHEN (c.inbox_context->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (c.inbox_context->>'template_id')::uuid
                END,
                CASE
                    WHEN (batch.metadata->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (batch.metadata->>'template_id')::uuid
                END,
                CASE
                    WHEN (batch.metadata->>'contact_template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (batch.metadata->>'contact_template_id')::uuid
                END
            ) AS template_id,
            COALESCE(
                NULLIF(lower(c.inbox_context->>'template_slug'), ''),
                NULLIF(lower(batch.metadata->>'template_slug'), ''),
                NULLIF(lower(batch.metadata->>'kw'), '')
            ) AS template_slug_seed,
            COALESCE(
                NULLIF(c.inbox_context->>'template_label', ''),
                NULLIF(batch.metadata->>'template_nombre', ''),
                NULLIF(batch.metadata->>'template_name', '')
            ) AS template_label_seed
    ) resolved_template_seed ON TRUE
    LEFT JOIN public.prospeccion_contacto_templates template_by_id
      ON template_by_id.id = resolved_template_seed.template_id
    LEFT JOIN public.prospeccion_contacto_templates template_by_slug
      ON lower(template_by_slug.slug) = resolved_template_seed.template_slug_seed
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(
                resolved_template_seed.template_id,
                template_by_slug.id
            ) AS template_id,
            COALESCE(
                NULLIF(lower(c.inbox_context->>'template_slug'), ''),
                resolved_template_seed.template_slug_seed,
                NULLIF(lower(template_by_id.slug), ''),
                NULLIF(lower(template_by_slug.slug), '')
            ) AS template_slug,
            COALESCE(
                NULLIF(c.inbox_context->>'template_label', ''),
                NULLIF(template_by_id.nombre, ''),
                NULLIF(template_by_slug.nombre, ''),
                resolved_template_seed.template_label_seed
            ) AS template_label
    ) resolved_template ON TRUE
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
      AND (
        p_channel IS NULL
        OR lower(COALESCE(NULLIF(snap.canal, ''), c.canal)) = lower(p_channel)
      )
      AND (p_source IS NULL OR lower(COALESCE(NULLIF(c.inbox_context->>'source', ''), snap.source, '')) = lower(p_source))
      AND (
        p_batch_id IS NULL
        OR COALESCE(
            (
                CASE
                    WHEN (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (c.inbox_context->>'batch_id')::uuid
                END
            )::text,
            snap.batch_id::text,
            ''
        ) = p_batch_id::text
      )
      AND (
        p_campana_id IS NULL
        OR COALESCE(
            (
                CASE
                    WHEN (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (c.inbox_context->>'campana_id')::uuid
                END
            )::text,
            batch.campana_id::text,
            snap.campana_id::text,
            ''
        ) = p_campana_id::text
      )
      AND (p_from IS NULL OR COALESCE(c.ultimo_mensaje_en, c.iniciada_en) >= p_from)
      AND (p_to IS NULL OR COALESCE(c.ultimo_mensaje_en, c.iniciada_en) <= p_to)
),
annotated AS (
    SELECT
        f.*,
        COUNT(*) OVER () AS total_rows
    FROM filtered f
),
paged AS (
    SELECT *
    FROM annotated
    ORDER BY sort_key DESC
    LIMIT COALESCE(NULLIF(p_limit, 0), 50)
    OFFSET GREATEST(p_offset, 0)
),
messages_by_thread AS (
    SELECT
        a.conversacion_id,
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'message_id', msg.id,
                'author', CASE
                    WHEN msg.direccion = 'entrante' THEN COALESCE(a.contacto_nombre, a.contacto_correo, 'Visitante')
                    ELSE COALESCE(a.asignado_nombre, 'Equipo Tal-IA')
                END,
                'role', CASE WHEN msg.direccion = 'entrante' THEN 'contacto' ELSE 'usuario' END,
                'timestamp', msg.creado_en,
                'body', ARRAY[COALESCE(NULLIF(msg.texto, ''), '(mensaje sin texto)')],
                'tipo_contenido', msg.tipo_contenido,
                'datos', msg.datos,
                'attachments', COALESCE(
                    (
                        SELECT JSONB_AGG(
                            JSONB_BUILD_OBJECT(
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
    FROM paged a
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
    a.last_message_preview,
    a.last_message_at,
    COALESCE(messages.items, '[]'::jsonb) AS messages,
    a.total_rows,
    a.reengage_attempts,
    a.inbox_context
FROM paged a
LEFT JOIN messages_by_thread messages ON messages.conversacion_id = a.conversacion_id
ORDER BY a.sort_key DESC;
$function$;

COMMIT;
