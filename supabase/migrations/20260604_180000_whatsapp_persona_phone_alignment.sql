BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_mensaje_whatsapp(
    p_direction text,
    p_whatsapp_id text DEFAULT NULL::text,
    p_phone_e164 text DEFAULT NULL::text,
    p_body text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_message_sid text DEFAULT NULL::text,
    p_profile_name text DEFAULT NULL::text,
    p_conversation_id uuid DEFAULT NULL::uuid,
    p_contact_id uuid DEFAULT NULL::uuid,
    p_response_id text DEFAULT NULL::text,
    p_inactivity_hours integer DEFAULT 24,
    p_inactivity_minutes integer DEFAULT NULL::integer,
    p_attachments jsonb DEFAULT '[]'::jsonb,
    p_webhook_payload jsonb DEFAULT NULL::jsonb,
    p_organizacion_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, contacto_id uuid, conversacion_openai_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    v_org uuid := p_organizacion_id;
    v_tmp_persona uuid;
    v_tmp_org uuid;
    v_conv_org uuid;
    v_phone_digits text := regexp_replace(COALESCE(p_phone_e164, ''), '[^0-9]', '', 'g');
    v_phone_e164 text := NULL;
BEGIN
    IF v_org IS NULL AND v_metadata ? 'resolved_organizacion_id' THEN
        BEGIN
            v_org := NULLIF(v_metadata->>'resolved_organizacion_id', '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_org := NULL;
        END;
    END IF;

    IF v_org IS NOT NULL THEN
        PERFORM set_config('app.current_organizacion_id', v_org::text, true);
    ELSE
        PERFORM set_config('app.current_organizacion_id', '', true);
    END IF;

    IF p_webhook_payload IS NOT NULL THEN
        INSERT INTO public.webhooks_entrantes (canal, id_solicitud, carga, processed_ok, organizacion_id)
        VALUES (
            'whatsapp',
            COALESCE(NULLIF(p_message_sid, ''), NULLIF(p_whatsapp_id, ''), NULLIF(v_phone_e164, '')),
            p_webhook_payload,
            NULL,
            v_org
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
           AND (v_org IS NULL OR c.organizacion_id = v_org)
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

    LOOP
        EXIT WHEN v_phone_digits = '' OR length(v_phone_digits) <= 13;
        IF v_phone_digits LIKE '521521%' THEN
            v_phone_digits := '521' || substr(v_phone_digits, 7);
            CONTINUE;
        END IF;
        IF v_phone_digits LIKE '52521%' THEN
            v_phone_digits := '521' || substr(v_phone_digits, 6);
            CONTINUE;
        END IF;
        EXIT;
    END LOOP;
    IF v_phone_digits <> '' THEN
        v_phone_e164 := '+' || v_phone_digits;
    END IF;

    IF p_contact_id IS NOT NULL THEN
        SELECT id, organizacion_id INTO v_tmp_persona, v_tmp_org
          FROM public.personas
         WHERE id = p_contact_id
           AND (v_org IS NULL OR organizacion_id = v_org);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Persona % no existe o no pertenece a la organización esperada', p_contact_id;
        END IF;
        v_contact_id := v_tmp_persona;
        IF v_tmp_org IS NOT NULL THEN
            IF v_org IS NOT NULL AND v_tmp_org <> v_org THEN
                RAISE EXCEPTION 'La persona % pertenece a otra organización', p_contact_id;
            END IF;
            v_org := v_tmp_org;
            PERFORM set_config('app.current_organizacion_id', v_org::text, true);
        END IF;
    END IF;

    IF p_conversation_id IS NOT NULL THEN
        SELECT c.id, c.contacto_id, c.conversacion_openai_id, c.ultimo_mensaje_en, c.organizacion_id
          INTO v_conversacion_id, v_contact_id, v_conv_openai, v_last_activity, v_conv_org
          FROM public.conversaciones c
         WHERE c.id = p_conversation_id
           AND c.canal = 'whatsapp'
           AND (v_org IS NULL OR c.organizacion_id = v_org)
         LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La conversación % no pertenece al canal WhatsApp o no pertenece a la organización esperada', p_conversation_id;
        END IF;
        IF p_contact_id IS NOT NULL AND v_contact_id <> p_contact_id THEN
            RAISE EXCEPTION 'La persona % no coincide con la conversación %', p_contact_id, p_conversation_id;
        END IF;
        IF v_org IS NULL AND v_conv_org IS NOT NULL THEN
            v_org := v_conv_org;
            PERFORM set_config('app.current_organizacion_id', v_org::text, true);
        ELSIF v_org IS NOT NULL AND v_conv_org IS NOT NULL AND v_conv_org <> v_org THEN
            RAISE EXCEPTION 'La conversación % pertenece a otra organización', p_conversation_id;
        END IF;
    END IF;

    IF v_contact_id IS NULL AND COALESCE(p_whatsapp_id, '') <> '' THEN
        SELECT ic.contacto_id, p.organizacion_id
          INTO v_tmp_persona, v_tmp_org
          FROM public.identidades_canal ic
          JOIN public.personas p ON p.id = ic.contacto_id
         WHERE ic.canal = 'whatsapp'
           AND ic.id_externo = p_whatsapp_id
           AND (v_org IS NULL OR p.organizacion_id = v_org)
         LIMIT 1;
        IF FOUND THEN
            v_contact_id := v_tmp_persona;
            IF v_tmp_org IS NOT NULL THEN
                IF v_org IS NOT NULL AND v_tmp_org <> v_org THEN
                    RAISE EXCEPTION 'La identidad WhatsApp % pertenece a otra organización', p_whatsapp_id;
                END IF;
                v_org := v_tmp_org;
                PERFORM set_config('app.current_organizacion_id', v_org::text, true);
            END IF;
        END IF;
    END IF;

    IF v_contact_id IS NULL AND COALESCE(p_phone_e164, '') <> '' THEN
        SELECT id, organizacion_id
          INTO v_tmp_persona, v_tmp_org
          FROM public.personas
         WHERE regexp_replace(COALESCE(telefono_principal_e164, ''), '[^0-9]', '', 'g') = v_phone_digits
           AND (v_org IS NULL OR organizacion_id = v_org)
         LIMIT 1;
        IF FOUND THEN
            v_contact_id := v_tmp_persona;
            IF v_tmp_org IS NOT NULL THEN
                IF v_org IS NOT NULL AND v_tmp_org <> v_org THEN
                    RAISE EXCEPTION 'El teléfono % pertenece a otra organización', p_phone_e164;
                END IF;
                v_org := v_tmp_org;
                PERFORM set_config('app.current_organizacion_id', v_org::text, true);
            END IF;
        END IF;
    END IF;

    IF v_contact_id IS NULL THEN
        IF v_org IS NULL THEN
            RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
                USING ERRCODE = '23514';
        END IF;
        INSERT INTO public.personas (
            nombre,
            telefono_principal_e164,
            telefono_principal_tipo_linea,
            telefono_movil_1_e164,
            telefono_movil_1_tipo_linea,
            origen,
            metadata,
            organizacion_id
        )
        VALUES (
            'Visitante WhatsApp',
            NULLIF(v_phone_e164, ''),
            'movil',
            NULLIF(v_phone_e164, ''),
            'movil',
            'whatsapp',
            jsonb_build_object('wa_id', p_whatsapp_id, 'profile_name', p_profile_name, 'tipo_linea', 'movil'),
            v_org
        )
        RETURNING id INTO v_contact_id;
    END IF;

    IF COALESCE(p_whatsapp_id, '') <> '' THEN
        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos, organizacion_id)
        VALUES (
            v_contact_id,
            'whatsapp',
            p_whatsapp_id,
            jsonb_build_object('telefono', v_phone_e164, 'profile_name', p_profile_name),
            v_org
        )
        ON CONFLICT (canal, id_externo) DO UPDATE
        SET contacto_id = EXCLUDED.contacto_id,
            metadatos = EXCLUDED.metadatos,
            organizacion_id = EXCLUDED.organizacion_id;
    END IF;

    IF v_conversacion_id IS NULL THEN
        SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
          INTO v_conversacion_id, v_last_activity, v_conv_openai
          FROM public.conversaciones c
         WHERE c.contacto_id = v_contact_id
           AND c.canal = 'whatsapp'
           AND c.estado <> 'cerrada'
           AND (v_org IS NULL OR c.organizacion_id = v_org)
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
$function$;

COMMIT;
