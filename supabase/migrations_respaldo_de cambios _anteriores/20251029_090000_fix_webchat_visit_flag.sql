BEGIN;

-- Ajusta registrar_mensaje_webchat para que las visitas sin chat no marquen
-- ultimo_entrante_en, evitando que aparezcan como leads captados.
CREATE OR REPLACE FUNCTION public.registrar_mensaje_webchat(
    p_session_id text,
    p_author text,
    p_content text,
    p_response_id text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_inactivity_hours integer DEFAULT NULL
)
RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, conversacion_openai_id text)
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
    v_conv_openai text;
    v_last_activity timestamptz;
    v_hours integer := COALESCE(p_inactivity_hours, 24);
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
        VALUES (v_contact_id, 'webchat', p_session_id, coalesce(p_metadata, '{}'::jsonb));
    END IF;

    IF coalesce(p_author, 'user') = 'user' THEN
        v_direction := 'entrante';
        v_estado := 'entregada';
    ELSE
        v_direction := 'saliente';
        v_estado := 'enviada';
    END IF;

    -- Busca conversación abierta reciente (<= v_hours) para continuar el hilo
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
            -- Más de 24h sin actividad: abrir nueva conversación
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
        v_conv_openai := NULL; -- reinicia el id de conversación de OpenAI en nuevo hilo
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
        'texto',
        p_content,
        jsonb_build_object('session_id', p_session_id, 'author', p_author) || coalesce(p_metadata, '{}'::jsonb),
        v_estado,
        v_now,
        0
    )
    RETURNING id INTO v_mensaje_id;

    -- Si el mensaje es del asistente y viene el openai conv id, actualiza la conversación
    IF v_direction = 'saliente' THEN
        v_conv_openai := coalesce(v_conv_openai, NULLIF((p_metadata->>'openai_conversation_id'), ''));
        IF v_conv_openai IS NOT NULL AND position('conv' in v_conv_openai) = 1 THEN
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

COMMENT ON FUNCTION public.registrar_mensaje_webchat(text, text, text, text, jsonb, integer)
    IS 'Registra mensajes del webchat, reinicia conversación si han pasado >24h y persiste el conversation_id de OpenAI (conv_...).';

GRANT EXECUTE ON FUNCTION public.registrar_mensaje_webchat(text, text, text, text, jsonb, integer)
    TO postgres, service_role;

COMMIT;
