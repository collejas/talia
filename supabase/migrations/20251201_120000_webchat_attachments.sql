BEGIN;

-- Ensure bucket for webchat attachments exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('webchat', 'webchat', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Extend adjuntos table
ALTER TABLE public.adjuntos
    ADD COLUMN IF NOT EXISTS nombre text,
    ADD COLUMN IF NOT EXISTS size_bytes bigint,
    ADD COLUMN IF NOT EXISTS path text;

UPDATE public.adjuntos
   SET size_bytes = COALESCE(size_bytes, tamano_bytes),
       nombre = COALESCE(nombre, split_part(url, '/', -1))
 WHERE TRUE;

-- Maintain compatibility if tamano_bytes column exists, keep both for now
ALTER TABLE public.adjuntos
    ADD COLUMN IF NOT EXISTS creado_en timestamptz DEFAULT now();

DROP POLICY IF EXISTS adjuntos_admin_todo ON public.adjuntos;
CREATE POLICY adjuntos_admin_todo ON public.adjuntos
USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));

DROP POLICY IF EXISTS adjuntos_select_visible ON public.adjuntos;
CREATE POLICY adjuntos_select_visible ON public.adjuntos
FOR SELECT TO authenticated
USING (public.puede_ver_mensaje(mensaje_id));

DROP POLICY IF EXISTS adjuntos_insert_visible ON public.adjuntos;
CREATE POLICY adjuntos_insert_visible ON public.adjuntos
FOR INSERT TO authenticated
WITH CHECK (public.puede_ver_mensaje(mensaje_id));

-- Replace registrar_mensaje_webchat to handle attachments
DROP FUNCTION IF EXISTS public.registrar_mensaje_webchat(text, text, text, text, jsonb, integer);

CREATE OR REPLACE FUNCTION public.registrar_mensaje_webchat(
    p_session_id text,
    p_author text,
    p_content text,
    p_response_id text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_inactivity_hours integer DEFAULT NULL,
    p_attachments jsonb DEFAULT '[]'::jsonb
) RETURNS TABLE(
    conversacion_id uuid,
    mensaje_id uuid,
    conversacion_openai_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_contact_id uuid;
    v_conversacion_id uuid;
    v_mensaje_id uuid;
    v_direction text;
    v_estado text;
    v_now timestamptz := now();
    v_last_activity timestamptz;
    v_conv_openai text;
    v_hours integer := COALESCE(p_inactivity_hours, 24);
    v_tipo_contenido text := 'texto';
BEGIN
    IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
        RAISE EXCEPTION 'session_id requerido';
    END IF;

    SELECT c.id
      INTO v_contact_id
      FROM public.identidades_canal ic
      JOIN public.contactos c ON c.id = ic.contacto_id
     WHERE ic.canal = 'webchat'
       AND ic.id_externo = p_session_id
     LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos)
        VALUES ('Visitante Webchat', 'webchat', jsonb_build_object('session_id', p_session_id))
        RETURNING id INTO v_contact_id;

        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos)
        VALUES (v_contact_id, 'webchat', p_session_id, COALESCE(p_metadata, '{}'::jsonb));
    END IF;

    IF COALESCE(p_author, 'user') = 'user' THEN
        v_direction := 'entrante';
        v_estado := 'entregada';
    ELSE
        v_direction := 'saliente';
        v_estado := 'enviada';
    END IF;

    SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
      INTO v_conversacion_id, v_last_activity, v_conv_openai
      FROM public.conversaciones AS c
     WHERE contacto_id = v_contact_id
       AND canal = 'webchat'
       AND estado <> 'cerrada'
     ORDER BY iniciada_en DESC
     LIMIT 1;

    IF FOUND THEN
        IF v_last_activity IS NULL OR v_last_activity < (v_now - make_interval(hours => v_hours)) THEN
            v_conversacion_id := NULL;
        END IF;
    END IF;

    IF v_conversacion_id IS NULL THEN
        INSERT INTO public.conversaciones (
            contacto_id,
            canal,
            estado,
            iniciada_en,
            ultimo_mensaje_en,
            ultimo_entrante_en
        )
        VALUES (
            v_contact_id,
            'webchat',
            'abierta',
            v_now,
            v_now,
            CASE WHEN v_direction = 'entrante' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_content, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
    END IF;

    INSERT INTO public.mensajes (
        conversacion_id,
        direccion,
        tipo_contenido,
        texto,
        datos,
        estado,
        creado_en,
        cantidad_medios
    )
    VALUES (
        v_conversacion_id,
        v_direction,
        v_tipo_contenido,
        p_content,
        jsonb_build_object('session_id', p_session_id, 'author', p_author, 'attachments', COALESCE(p_attachments, '[]'::jsonb))
            || COALESCE(p_metadata, '{}'::jsonb),
        v_estado,
        v_now,
        0
    )
    RETURNING id INTO v_mensaje_id;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        INSERT INTO public.adjuntos (mensaje_id, url, mime, tamano_bytes, proveedor_id, nombre, size_bytes, path)
        SELECT
            v_mensaje_id,
            NULLIF(elem->>'url', ''),
            NULLIF(elem->>'mime', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'provider_id', ''),
            NULLIF(elem->>'name', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'path', '')
        FROM jsonb_array_elements(p_attachments) AS elem;

        UPDATE public.mensajes
           SET cantidad_medios = (
               SELECT COUNT(*) FROM public.adjuntos WHERE public.adjuntos.mensaje_id = v_mensaje_id
           )
         WHERE id = v_mensaje_id;
    END IF;

    IF v_direction = 'saliente' THEN
        v_conv_openai := COALESCE(v_conv_openai, NULLIF((p_metadata->>'openai_conversation_id'), ''));
        IF v_conv_openai IS NOT NULL AND position('conv' IN v_conv_openai) = 1 THEN
            UPDATE public.conversaciones AS c
               SET conversacion_openai_id = v_conv_openai
             WHERE c.id = v_conversacion_id;
        END IF;
    END IF;

    UPDATE public.conversaciones AS c
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN v_direction = 'entrante' THEN v_now ELSE ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN v_direction = 'saliente' THEN v_now ELSE ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, last_response_id)
     WHERE c.id = v_conversacion_id
     RETURNING c.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_conv_openai;
END;
$$;

COMMENT ON FUNCTION public.registrar_mensaje_webchat(text, text, text, text, jsonb, integer, jsonb)
    IS 'Registra mensajes del webchat con soporte de adjuntos y mantiene la conversación sincronizada.';

-- Update panel_inbox_messages to expose attachments
DROP FUNCTION IF EXISTS public.panel_inbox_messages(uuid, integer, timestamptz);

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

-- Update panel_inbox_threads aggregated messages with attachments
DROP FUNCTION IF EXISTS public.panel_inbox_threads(
    text,
    uuid,
    integer,
    integer,
    integer
);

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
        ) AS tags,
        COALESCE(cc.manual_override, false) AS manual_override
    FROM public.conversaciones c
    JOIN public.contactos ct ON ct.id = c.contacto_id
    LEFT JOIN public.usuarios asignado ON asignado.id = c.asignado_a_usuario_id
    LEFT JOIN public.conversaciones_insights ci ON ci.conversacion_id = c.id
    LEFT JOIN public.conversaciones_controles cc ON cc.conversacion_id = c.id
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
    last_msg.preview_text AS last_message_preview,
    last_msg.preview_at AS last_message_at,
    COALESCE(messages.items, '[]'::jsonb) AS messages,
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
LEFT JOIN messages_by_thread messages ON messages.conversacion_id = a.conversacion_id
ORDER BY a.sort_key DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 50)
OFFSET GREATEST(p_offset, 0);
$function$;

COMMIT;
