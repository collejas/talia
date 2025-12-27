DO $$
BEGIN
    CREATE OR REPLACE FUNCTION public.registrar_mensaje_messenger(
        p_sender_id text,
        p_recipient_id text DEFAULT NULL::text,
        p_message_id text DEFAULT NULL::text,
        p_content text DEFAULT NULL::text,
        p_direction text DEFAULT 'entrante',
        p_metadata jsonb DEFAULT '{}'::jsonb,
        p_inactivity_hours integer DEFAULT NULL::integer,
        p_attachments jsonb DEFAULT '[]'::jsonb,
        p_response_id text DEFAULT NULL::text,
        p_organizacion_id uuid DEFAULT NULL::uuid
    )
    RETURNS TABLE(
        conversacion_id uuid,
        mensaje_id uuid,
        contacto_id uuid,
        conversacion_openai_id text
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
DECLARE
    v_contact_id uuid;
    v_contact_org uuid;
    v_conversacion_id uuid;
    v_mensaje_id uuid;
    v_last_activity timestamptz;
    v_conv_openai text;
    v_direction text := lower(COALESCE(NULLIF(p_direction, ''), 'entrante'));
    v_estado text := CASE WHEN v_direction = 'saliente' THEN 'enviada' ELSE 'entregada' END;
    v_now timestamptz := now();
    v_hours integer := COALESCE(p_inactivity_hours, 24);
    v_tipo_contenido text := 'texto';
    v_org uuid := p_organizacion_id;
    v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
    v_message_metadata jsonb;
BEGIN
    IF p_sender_id IS NULL OR length(trim(p_sender_id)) = 0 THEN
        RAISE EXCEPTION 'sender_id requerido';
    END IF;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido para asignar un tenant';
    END IF;

    SELECT c.id, c.organizacion_id
      INTO v_contact_id, v_contact_org
      FROM public.identidades_canal ic
      JOIN public.contactos c ON c.id = ic.contacto_id
     WHERE ic.canal = 'messenger'
       AND ic.id_externo = p_sender_id
       AND (v_org IS NULL OR c.organizacion_id = v_org)
     ORDER BY ic.creado_en DESC
     LIMIT 1;

    IF FOUND AND v_contact_id IS NOT NULL THEN
        v_org := COALESCE(v_org, v_contact_org);
    END IF;

    IF v_contact_id IS NULL THEN
        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos, organizacion_id)
        VALUES (
            'Contacto Messenger',
            'messenger',
            jsonb_build_object(
                'sender_id', p_sender_id,
                'recipient_id', NULLIF(p_recipient_id, ''),
                'message_id', NULLIF(p_message_id, '')
            ),
            v_org
        )
        RETURNING id INTO v_contact_id;

        INSERT INTO public.identidades_canal (
            contacto_id,
            canal,
            id_externo,
            metadatos,
            organizacion_id
        )
        VALUES (
            v_contact_id,
            'messenger',
            p_sender_id,
            jsonb_build_object('recipient_id', NULLIF(p_recipient_id, '')),
            v_org
        )
        ON CONFLICT (organizacion_id, canal, id_externo)
        DO UPDATE
        SET metadatos = public.identidades_canal.metadatos || EXCLUDED.metadatos
        RETURNING public.identidades_canal.contacto_id INTO v_contact_id;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_content, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
    END IF;

    SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
      INTO v_conversacion_id, v_last_activity, v_conv_openai
      FROM public.conversaciones AS c
     WHERE c.contacto_id = v_contact_id
       AND c.canal = 'messenger'
       AND c.estado <> 'cerrada'
     ORDER BY c.iniciada_en DESC
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
            'messenger',
            'abierta',
            v_now,
            v_now,
            CASE WHEN v_direction = 'entrante' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    v_message_metadata := jsonb_build_object(
        'sender_id', p_sender_id,
        'recipient_id', NULLIF(p_recipient_id, ''),
        'message_id', NULLIF(p_message_id, ''),
        'direction', v_direction
    )
    || jsonb_build_object('attachments', COALESCE(p_attachments, '[]'::jsonb))
    || v_metadata;

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
        v_message_metadata,
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

    UPDATE public.conversaciones AS c
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN v_direction = 'entrante' THEN v_now ELSE ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN v_direction = 'saliente' THEN v_now ELSE ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, last_response_id)
     WHERE c.id = v_conversacion_id
     RETURNING c.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_contact_id, v_conv_openai;
END;
$function$;

    COMMENT ON FUNCTION public.registrar_mensaje_messenger(
        p_sender_id text,
        p_recipient_id text,
        p_message_id text,
        p_content text,
        p_direction text,
        p_metadata jsonb,
        p_inactivity_hours integer,
        p_attachments jsonb,
        p_response_id text,
        p_organizacion_id uuid
    ) IS 'Registra mensajes entrantes del canal Messenger y conserva la conversación correspondiente.';
END;
$$;
