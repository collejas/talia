-- Ajusta las RPC del webchat para aceptar `p_organizacion_id` opcional
-- y así evitar que el widget revele el UUID real del tenant.

DO $$
BEGIN
    -- record_webchat_visitante incluye el nuevo parámetro opcional.
    CREATE OR REPLACE FUNCTION public.record_webchat_visitante(
        p_session_id text,
        p_ip text DEFAULT NULL::text,
        p_device_type text DEFAULT NULL::text,
        p_geo jsonb DEFAULT NULL::jsonb,
        p_cve_ent text DEFAULT NULL::text,
        p_nom_ent text DEFAULT NULL::text,
        p_cve_mun text DEFAULT NULL::text,
        p_nom_mun text DEFAULT NULL::text,
        p_cvegeo text DEFAULT NULL::text,
        p_referrer text DEFAULT NULL::text,
        p_landing_url text DEFAULT NULL::text,
        p_organizacion_id uuid DEFAULT NULL::uuid
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
DECLARE
    v_org uuid;
BEGIN
    v_org := p_organizacion_id;
    IF v_org IS NULL THEN
        BEGIN
            v_org := public.usuario_organizacion_id(auth.uid());
        EXCEPTION
            WHEN others THEN
                v_org := NULL;
        END;
    END IF;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.webchat_visitantes (
        session_id,
        ip,
        device_type,
        geo,
        cve_ent,
        nom_ent,
        cve_mun,
        nom_mun,
        cvegeo,
        referrer,
        landing_url,
        visit_count,
        registrado_en,
        ultimo_evento_en,
        organizacion_id
    )
    VALUES (
        p_session_id,
        NULLIF(p_ip, ''),
        NULLIF(p_device_type, ''),
        CASE WHEN p_geo IS NULL OR p_geo = '{}'::jsonb THEN NULL ELSE p_geo END,
        NULLIF(p_cve_ent, ''),
        NULLIF(p_nom_ent, ''),
        NULLIF(p_cve_mun, ''),
        NULLIF(p_nom_mun, ''),
        NULLIF(p_cvegeo, ''),
        NULLIF(p_referrer, ''),
        NULLIF(p_landing_url, ''),
        1,
        now(),
        now(),
        v_org
    )
    ON CONFLICT (organizacion_id, session_id) DO UPDATE
      SET ip = COALESCE(EXCLUDED.ip, public.webchat_visitantes.ip),
          device_type = COALESCE(EXCLUDED.device_type, public.webchat_visitantes.device_type),
          geo = COALESCE(EXCLUDED.geo, public.webchat_visitantes.geo),
          cve_ent = COALESCE(EXCLUDED.cve_ent, public.webchat_visitantes.cve_ent),
          nom_ent = COALESCE(EXCLUDED.nom_ent, public.webchat_visitantes.nom_ent),
          cve_mun = COALESCE(EXCLUDED.cve_mun, public.webchat_visitantes.cve_mun),
          nom_mun = COALESCE(EXCLUDED.nom_mun, public.webchat_visitantes.nom_mun),
          cvegeo = COALESCE(EXCLUDED.cvegeo, public.webchat_visitantes.cvegeo),
          referrer = COALESCE(EXCLUDED.referrer, public.webchat_visitantes.referrer),
          landing_url = COALESCE(EXCLUDED.landing_url, public.webchat_visitantes.landing_url),
          ultimo_evento_en = now(),
          visit_count = COALESCE(public.webchat_visitantes.visit_count, 0) + 1;
END;
$function$;

    -- registrar_mensaje_webchat recibe `p_organizacion_id` y lo aplica al contacto/identidad.
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
    RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, conversacion_openai_id text)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
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
    v_org uuid := p_organizacion_id;
    v_contact_org uuid;
BEGIN
    IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
        RAISE EXCEPTION 'session_id requerido';
    END IF;

    IF v_org IS NULL THEN
        BEGIN
            v_org := public.usuario_organizacion_id(auth.uid());
        EXCEPTION
            WHEN others THEN
                v_org := NULL;
        END;
    END IF;

    SELECT c.id, c.organizacion_id
      INTO v_contact_id, v_contact_org
      FROM public.identidades_canal ic
      JOIN public.contactos c ON c.id = ic.contacto_id
     WHERE ic.canal = 'webchat'
       AND ic.id_externo = p_session_id
       AND (v_org IS NULL OR c.organizacion_id = v_org)
     ORDER BY ic.creado_en DESC
     LIMIT 1;

    IF FOUND THEN
        v_org := COALESCE(v_org, v_contact_org);
    END IF;

    IF v_contact_id IS NULL THEN
        IF v_org IS NULL THEN
            RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos, organizacion_id)
        VALUES ('Visitante Webchat', 'webchat', jsonb_build_object('session_id', p_session_id), v_org)
        RETURNING id INTO v_contact_id;

        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos, organizacion_id)
        VALUES (v_contact_id, 'webchat', p_session_id, COALESCE(p_metadata, '{}'::jsonb), v_org);
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
     WHERE c.contacto_id = v_contact_id
       AND c.canal = 'webchat'
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
    ) IS 'Registra mensajes del webchat con soporte de adjuntos y respeta el tenant recibido.';
END;
$$;
