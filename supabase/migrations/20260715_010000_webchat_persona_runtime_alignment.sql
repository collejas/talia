BEGIN;

DROP FUNCTION IF EXISTS public.registrar_mensaje_webchat(
    text,
    text,
    text,
    text,
    jsonb,
    integer,
    jsonb,
    uuid
);

CREATE OR REPLACE FUNCTION public.registrar_mensaje_webchat(
    p_session_id text,
    p_author text,
    p_content text,
    p_response_id text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_inactivity_hours integer DEFAULT NULL::integer,
    p_attachments jsonb DEFAULT '[]'::jsonb,
    p_organizacion_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    conversacion_id uuid,
    mensaje_id uuid,
    contacto_id uuid,
    persona_id uuid,
    organizacion_id uuid,
    conversacion_openai_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
    v_persona_id uuid;
    v_conversacion_id uuid;
    v_mensaje_id uuid;
    v_direction text;
    v_estado text;
    v_now timestamptz := now();
    v_last_activity timestamptz;
    v_conv_openai text;
    v_hours integer := COALESCE(p_inactivity_hours, 24);
    v_minutes integer := GREATEST(1, v_hours * 60);
    v_tipo_contenido text := 'texto';
    v_org uuid := p_organizacion_id;
    v_persona_org uuid;
    v_metadata_clean jsonb := COALESCE(p_metadata, '{}'::jsonb);
    v_minutes_override_raw text;
    v_resolved_name text := 'Visitante Webchat';
BEGIN
    IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
        RAISE EXCEPTION 'session_id requerido';
    END IF;

    v_minutes_override_raw := NULLIF(trim(v_metadata_clean->>'__inactivity_minutes'), '');
    IF v_minutes_override_raw IS NOT NULL AND v_minutes_override_raw ~ '^[0-9]+$' THEN
        v_minutes := GREATEST(1, v_minutes_override_raw::integer);
    END IF;
    v_metadata_clean := v_metadata_clean - '__inactivity_minutes';

    IF v_org IS NULL AND v_metadata_clean ? 'resolved_organizacion_id' THEN
        BEGIN
            v_org := NULLIF(v_metadata_clean->>'resolved_organizacion_id', '')::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                v_org := NULL;
        END;
    END IF;

    IF v_org IS NULL THEN
        BEGIN
            v_org := public.usuario_organizacion_id(auth.uid());
        EXCEPTION
            WHEN others THEN
                v_org := NULL;
        END;
    END IF;

    SELECT p.id, p.organizacion_id
      INTO v_persona_id, v_persona_org
      FROM public.identidades_canal ic
      JOIN public.personas p
        ON p.id = COALESCE(ic.persona_id, ic.contacto_id)
     WHERE ic.canal = 'webchat'
       AND ic.id_externo = p_session_id
       AND (v_org IS NULL OR p.organizacion_id = v_org)
     ORDER BY ic.creado_en DESC
     LIMIT 1;

    IF FOUND THEN
        v_org := COALESCE(v_org, v_persona_org);
    END IF;

    IF v_persona_id IS NULL THEN
        IF v_org IS NULL THEN
            RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.personas (
            organizacion_id,
            nombre,
            nombre_completo,
            codigo_contacto,
            estado,
            origen,
            metadata,
            persona_datos,
            captura_estado
        )
        VALUES (
            v_org,
            v_resolved_name,
            v_resolved_name,
            public.gen_codigo_contacto(v_org),
            'lead',
            'webchat',
            jsonb_build_object(
                'webchat_session_id', p_session_id,
                'source', 'webchat_runtime'
            ),
            jsonb_build_object(
                'session_id', p_session_id,
                'source', 'webchat_runtime'
            ),
            'incompleto'
        )
        RETURNING id INTO v_persona_id;
    END IF;

    INSERT INTO public.identidades_canal (
        contacto_id,
        persona_id,
        canal,
        id_externo,
        metadatos,
        organizacion_id
    )
    VALUES (
        v_persona_id,
        v_persona_id,
        'webchat',
        p_session_id,
        v_metadata_clean,
        v_org
    )
    ON CONFLICT (canal, id_externo) DO UPDATE
    SET contacto_id = EXCLUDED.contacto_id,
        persona_id = EXCLUDED.persona_id,
        metadatos = EXCLUDED.metadatos,
        organizacion_id = EXCLUDED.organizacion_id;

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
     WHERE c.contacto_id = v_persona_id
       AND c.canal = 'webchat'
       AND c.estado <> 'cerrada'
       AND c.organizacion_id = v_org
     ORDER BY c.iniciada_en DESC
     LIMIT 1;

    IF FOUND THEN
        IF v_last_activity IS NULL OR v_last_activity < (v_now - make_interval(mins => v_minutes)) THEN
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
            ultimo_entrante_en,
            organizacion_id,
            persona_id
        )
        VALUES (
            v_persona_id,
            'webchat',
            'abierta',
            v_now,
            v_now,
            CASE WHEN v_direction = 'entrante' THEN v_now ELSE NULL END,
            v_org,
            v_persona_id
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
        cantidad_medios,
        organizacion_id
    )
    VALUES (
        v_conversacion_id,
        v_direction,
        v_tipo_contenido,
        p_content,
        jsonb_build_object(
            'session_id', p_session_id,
            'author', p_author,
            'attachments', COALESCE(p_attachments, '[]'::jsonb)
        ) || v_metadata_clean,
        v_estado,
        v_now,
        0,
        v_org
    )
    RETURNING id INTO v_mensaje_id;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        INSERT INTO public.adjuntos (
            mensaje_id,
            url,
            mime,
            tamano_bytes,
            proveedor_id,
            nombre,
            size_bytes,
            path
        )
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
               SELECT COUNT(*)
               FROM public.adjuntos
               WHERE public.adjuntos.mensaje_id = v_mensaje_id
           )
         WHERE id = v_mensaje_id;
    END IF;

    IF v_direction = 'saliente' THEN
        v_conv_openai := COALESCE(v_conv_openai, NULLIF((v_metadata_clean->>'openai_conversation_id'), ''));
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
           last_response_id = COALESCE(p_response_id, last_response_id),
           persona_id = COALESCE(c.persona_id, v_persona_id)
     WHERE c.id = v_conversacion_id
     RETURNING c.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY
    SELECT
        v_conversacion_id,
        v_mensaje_id,
        v_persona_id,
        v_persona_id,
        v_org,
        v_conv_openai;
END;
$function$;

COMMENT ON FUNCTION public.registrar_mensaje_webchat(
    p_session_id text,
    p_author text,
    p_content text,
    p_response_id text,
    p_metadata jsonb,
    p_inactivity_hours integer,
    p_attachments jsonb,
    p_organizacion_id uuid
) IS 'Registra mensajes del webchat usando personas como identidad operativa y devuelve persona_id y organizacion_id para el runtime.';

COMMIT;
