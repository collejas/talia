DROP FUNCTION IF EXISTS public.registrar_mensaje_whatsapp(
    text,
    text,
    text,
    text,
    jsonb,
    text,
    text,
    uuid,
    uuid,
    text,
    integer,
    jsonb,
    jsonb
);

DROP FUNCTION IF EXISTS public.registrar_mensaje_whatsapp(
    text,
    text,
    text,
    text,
    jsonb,
    text,
    text,
    uuid,
    uuid,
    text,
    integer,
    integer,
    jsonb,
    jsonb
);

CREATE OR REPLACE FUNCTION public.registrar_mensaje_whatsapp(
    p_direction text,
    p_whatsapp_id text DEFAULT NULL,
    p_phone_e164 text DEFAULT NULL,
    p_body text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_message_sid text DEFAULT NULL,
    p_profile_name text DEFAULT NULL,
    p_conversation_id uuid DEFAULT NULL,
    p_contact_id uuid DEFAULT NULL,
    p_response_id text DEFAULT NULL,
    p_inactivity_hours integer DEFAULT 24,
    p_inactivity_minutes integer DEFAULT NULL,
    p_attachments jsonb DEFAULT '[]'::jsonb,
    p_webhook_payload jsonb DEFAULT NULL
) RETURNS TABLE(
    conversacion_id uuid,
    mensaje_id uuid,
    contacto_id uuid,
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
    v_now timestamptz := now();
    v_last_activity timestamptz;
    v_conv_openai text;
    v_hours integer := GREATEST(1, COALESCE(p_inactivity_hours, 24));
    v_minutes integer := GREATEST(1, COALESCE(p_inactivity_minutes, v_hours * 60));
    v_tipo_contenido text := 'texto';
    v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
    v_existing record;
    v_webhook_id uuid;
BEGIN
    IF p_webhook_payload IS NOT NULL THEN
        INSERT INTO public.webhooks_entrantes (canal, id_solicitud, carga, processed_ok)
        VALUES (
            'whatsapp',
            COALESCE(NULLIF(p_message_sid, ''), NULLIF(p_whatsapp_id, ''), NULLIF(p_phone_e164, '')),
            p_webhook_payload,
            NULL
        )
        RETURNING id INTO v_webhook_id;
    END IF;

    IF p_direction NOT IN ('entrante', 'saliente') THEN
        RAISE EXCEPTION 'Dirección inválida %', p_direction;
    END IF;

    IF p_direction = 'saliente' AND p_conversation_id IS NULL THEN
        RAISE EXCEPTION 'conversation_id requerido para mensajes salientes';
    END IF;

    IF p_message_sid IS NOT NULL THEN
        SELECT m.conversacion_id, m.id, c.contacto_id, c.conversacion_openai_id
          INTO v_existing
          FROM public.mensajes m
          JOIN public.conversaciones c ON c.id = m.conversacion_id
         WHERE m.twilio_message_sid = p_message_sid
         LIMIT 1;
        IF FOUND THEN
            RETURN QUERY SELECT v_existing.conversacion_id, v_existing.id, v_existing.contacto_id, v_existing.conversacion_openai_id;
            IF v_webhook_id IS NOT NULL THEN
                UPDATE public.webhooks_entrantes
                   SET processed_ok = TRUE,
                       error = NULL
                 WHERE id = v_webhook_id;
            END IF;
            RETURN;
        END IF;
    END IF;

    IF p_contact_id IS NOT NULL THEN
        SELECT id INTO v_contact_id FROM public.contactos WHERE id = p_contact_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Contacto % no existe', p_contact_id;
        END IF;
    END IF;

    IF p_conversation_id IS NOT NULL THEN
        SELECT c.id, c.contacto_id, c.conversacion_openai_id, c.ultimo_mensaje_en
          INTO v_conversacion_id, v_contact_id, v_conv_openai, v_last_activity
          FROM public.conversaciones c
         WHERE c.id = p_conversation_id
           AND c.canal = 'whatsapp'
         LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La conversación % no pertenece al canal WhatsApp', p_conversation_id;
        END IF;
        IF p_contact_id IS NOT NULL AND v_contact_id <> p_contact_id THEN
            RAISE EXCEPTION 'El contacto % no coincide con la conversación %', p_contact_id, p_conversation_id;
        END IF;
    END IF;

    IF v_contact_id IS NULL AND COALESCE(p_whatsapp_id, '') <> '' THEN
        SELECT ic.contacto_id
          INTO v_contact_id
          FROM public.identidades_canal AS ic
         WHERE ic.canal = 'whatsapp'
           AND ic.id_externo = p_whatsapp_id
         LIMIT 1;
    END IF;

    IF v_contact_id IS NULL AND COALESCE(p_phone_e164, '') <> '' THEN
        SELECT id
          INTO v_contact_id
          FROM public.contactos
         WHERE telefono_e164 = p_phone_e164
         LIMIT 1;
    END IF;

    IF v_contact_id IS NULL THEN
        INSERT INTO public.contactos (nombre_completo, telefono_e164, origen, contacto_datos)
        VALUES (
            COALESCE(NULLIF(p_profile_name, ''), 'Visitante WhatsApp'),
            NULLIF(p_phone_e164, ''),
            'whatsapp',
            jsonb_build_object('wa_id', p_whatsapp_id, 'profile_name', p_profile_name)
        )
        RETURNING id INTO v_contact_id;
    END IF;

    IF COALESCE(p_whatsapp_id, '') <> '' THEN
        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos)
        VALUES (
            v_contact_id,
            'whatsapp',
            p_whatsapp_id,
            jsonb_build_object('telefono', p_phone_e164, 'profile_name', p_profile_name)
        )
        ON CONFLICT (canal, id_externo) DO UPDATE
        SET contacto_id = EXCLUDED.contacto_id,
            metadatos = EXCLUDED.metadatos;
    END IF;

    IF v_conversacion_id IS NULL THEN
        SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
          INTO v_conversacion_id, v_last_activity, v_conv_openai
          FROM public.conversaciones AS c
         WHERE c.contacto_id = v_contact_id
           AND c.canal = 'whatsapp'
           AND c.estado <> 'cerrada'
         ORDER BY c.iniciada_en DESC
         LIMIT 1;
    END IF;

    IF p_direction = 'entrante' THEN
        IF v_conversacion_id IS NULL OR (
            v_last_activity IS NOT NULL AND v_last_activity < (v_now - make_interval(mins => v_minutes))
        ) THEN
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
            'whatsapp',
            'abierta',
            v_now,
            v_now,
            CASE WHEN p_direction = 'entrante' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_body, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
        v_metadata := v_metadata || jsonb_build_object('attachments', p_attachments);
    END IF;

    INSERT INTO public.mensajes (
        conversacion_id,
        direccion,
        tipo_contenido,
        texto,
        datos,
        proveedor_mensaje_id,
        estado,
        creado_en,
        twilio_message_sid,
        cantidad_medios
    ) VALUES (
        v_conversacion_id,
        p_direction,
        v_tipo_contenido,
        NULLIF(p_body, ''),
        v_metadata,
        p_message_sid,
        CASE WHEN p_direction = 'entrante' THEN 'entregada' ELSE 'enviada' END,
        v_now,
        p_message_sid,
        CASE WHEN jsonb_typeof(p_attachments) = 'array' THEN jsonb_array_length(p_attachments) ELSE 0 END
    )
    RETURNING id INTO v_mensaje_id;

    IF p_direction = 'saliente' THEN
        IF v_metadata ? 'openai_conversation_id' THEN
            v_conv_openai := NULLIF(v_metadata->>'openai_conversation_id', '');
        END IF;
        UPDATE public.conversaciones
           SET conversacion_openai_id = COALESCE(v_conv_openai, public.conversaciones.conversacion_openai_id)
         WHERE id = v_conversacion_id;
    END IF;

    UPDATE public.conversaciones
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN p_direction = 'entrante' THEN v_now ELSE public.conversaciones.ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN p_direction = 'saliente' THEN v_now ELSE public.conversaciones.ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, public.conversaciones.last_response_id)
     WHERE id = v_conversacion_id
     RETURNING public.conversaciones.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_contact_id, v_conv_openai;

    IF v_webhook_id IS NOT NULL THEN
        UPDATE public.webhooks_entrantes
           SET processed_ok = TRUE,
               error = NULL
         WHERE id = v_webhook_id;
    END IF;

    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        IF v_webhook_id IS NOT NULL THEN
            UPDATE public.webhooks_entrantes
               SET processed_ok = FALSE,
                   error = left(SQLERRM, 500)
             WHERE id = v_webhook_id;
        END IF;
        RAISE;
END;
$$;

COMMENT ON FUNCTION public.registrar_mensaje_whatsapp(
    p_direction text,
    p_whatsapp_id text,
    p_phone_e164 text,
    p_body text,
    p_metadata jsonb,
    p_message_sid text,
    p_profile_name text,
    p_conversation_id uuid,
    p_contact_id uuid,
    p_response_id text,
    p_inactivity_hours integer,
    p_inactivity_minutes integer,
    p_attachments jsonb,
    p_webhook_payload jsonb
) IS 'Registra mensajes entrantes o salientes del canal WhatsApp, liga la carga cruda en webhooks_entrantes, controla inactividad en minutos y gestiona la conversación asociada.';
