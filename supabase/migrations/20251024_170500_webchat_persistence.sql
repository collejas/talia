BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_mensaje_webchat(
    p_session_id text,
    p_author text,
    p_content text,
    p_response_id text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(conversacion_id uuid, mensaje_id uuid)
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

    SELECT id
      INTO v_conversacion_id
      FROM public.conversaciones
     WHERE contacto_id = v_contact_id
       AND canal = 'webchat'
       AND estado <> 'cerrada'
     ORDER BY iniciada_en DESC
     LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.conversaciones (contacto_id, canal, estado, iniciada_en, ultimo_mensaje_en, ultimo_entrante_en)
        VALUES (v_contact_id, 'webchat', 'abierta', v_now, v_now, v_now)
        RETURNING id INTO v_conversacion_id;
    END IF;

    IF coalesce(p_author, 'user') = 'user' THEN
        v_direction := 'entrante';
        v_estado := 'entregada';
    ELSE
        v_direction := 'saliente';
        v_estado := 'enviada';
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

    UPDATE public.conversaciones
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN v_direction = 'entrante' THEN v_now ELSE ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN v_direction = 'saliente' THEN v_now ELSE ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, last_response_id)
     WHERE id = v_conversacion_id;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_mensaje_webchat(text, text, text, text, jsonb)
    IS 'Registra mensajes del webchat: crea contacto/conversación si no existen y actualiza métricas básicas.';

GRANT EXECUTE ON FUNCTION public.registrar_mensaje_webchat(text, text, text, text, jsonb)
    TO postgres, service_role;

COMMIT;
