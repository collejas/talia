BEGIN;

ALTER TABLE public.webchat_visitantes
    ADD COLUMN IF NOT EXISTS contacto_id uuid;

ALTER TABLE public.webchat_session_closures
    ADD COLUMN IF NOT EXISTS contacto_id uuid;

DO $$
DECLARE
    rec record;
    v_contact_id uuid;
BEGIN
    FOR rec IN
        SELECT DISTINCT session_id
        FROM (
            SELECT session_id FROM public.webchat_visitantes
            UNION
            SELECT session_id FROM public.webchat_session_closures
        ) s
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.identidades_canal ic
            WHERE ic.canal = 'webchat'
              AND ic.id_externo = s.session_id
        )
    LOOP
        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos)
        VALUES ('Visitante Webchat', 'webchat', jsonb_build_object('session_id', rec.session_id))
        RETURNING id INTO v_contact_id;

        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos)
        VALUES (v_contact_id, 'webchat', rec.session_id, jsonb_build_object('session_id', rec.session_id))
        ON CONFLICT (canal, id_externo) DO NOTHING;
    END LOOP;
END;
$$;

UPDATE public.webchat_visitantes v
   SET contacto_id = ic.contacto_id
  FROM public.identidades_canal ic
 WHERE ic.canal = 'webchat'
   AND ic.id_externo = v.session_id;

UPDATE public.webchat_session_closures sc
   SET contacto_id = ic.contacto_id
  FROM public.identidades_canal ic
 WHERE ic.canal = 'webchat'
   AND ic.id_externo = sc.session_id;

ALTER TABLE public.webchat_visitantes
    ALTER COLUMN contacto_id SET NOT NULL;

ALTER TABLE public.webchat_session_closures
    ALTER COLUMN contacto_id SET NOT NULL;

ALTER TABLE public.webchat_visitantes
    ADD CONSTRAINT webchat_visitantes_contacto_fk
        FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE CASCADE;

ALTER TABLE public.webchat_session_closures
    ADD CONSTRAINT webchat_session_closures_contacto_fk
        FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_webchat_visitantes_contacto
    ON public.webchat_visitantes (contacto_id);

CREATE INDEX IF NOT EXISTS idx_webchat_session_closures_contacto
    ON public.webchat_session_closures (contacto_id);

CREATE OR REPLACE FUNCTION public._ensure_webchat_contact(
    p_session_id text,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contact_id uuid;
BEGIN
    IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
        RAISE EXCEPTION 'session_id requerido';
    END IF;

    SELECT contacto_id
      INTO v_contact_id
      FROM public.identidades_canal
     WHERE canal = 'webchat'
       AND id_externo = p_session_id
     LIMIT 1;

    IF v_contact_id IS NULL THEN
        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos)
        VALUES ('Visitante Webchat', 'webchat', jsonb_build_object('session_id', p_session_id))
        RETURNING id INTO v_contact_id;

        BEGIN
            INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos)
            VALUES (v_contact_id, 'webchat', p_session_id, COALESCE(p_metadata, '{}'::jsonb));
        EXCEPTION WHEN unique_violation THEN
            SELECT contacto_id
              INTO v_contact_id
              FROM public.identidades_canal
             WHERE canal = 'webchat'
               AND id_externo = p_session_id
             LIMIT 1;
        END;
    ELSE
        IF p_metadata IS NOT NULL AND p_metadata <> '{}'::jsonb THEN
            UPDATE public.identidades_canal
               SET metadatos = COALESCE(metadatos, '{}'::jsonb) || p_metadata
             WHERE canal = 'webchat'
               AND id_externo = p_session_id;
        END IF;
    END IF;

    RETURN v_contact_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public._ensure_webchat_contact(text, jsonb)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.tg_webchat_visitantes_set_contacto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.contacto_id IS NULL THEN
        NEW.contacto_id := public._ensure_webchat_contact(NEW.session_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS webchat_visitantes_set_contacto ON public.webchat_visitantes;

CREATE TRIGGER webchat_visitantes_set_contacto
BEFORE INSERT OR UPDATE ON public.webchat_visitantes
FOR EACH ROW
EXECUTE FUNCTION public.tg_webchat_visitantes_set_contacto();

CREATE OR REPLACE FUNCTION public.tg_webchat_session_closures_set_contacto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.contacto_id IS NULL THEN
        NEW.contacto_id := public._ensure_webchat_contact(NEW.session_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS webchat_session_closures_set_contacto ON public.webchat_session_closures;

CREATE TRIGGER webchat_session_closures_set_contacto
BEFORE INSERT OR UPDATE ON public.webchat_session_closures
FOR EACH ROW
EXECUTE FUNCTION public.tg_webchat_session_closures_set_contacto();

CREATE OR REPLACE FUNCTION public.record_webchat_visitante(
    p_session_id text,
    p_ip text DEFAULT NULL,
    p_device_type text DEFAULT NULL,
    p_geo jsonb DEFAULT NULL,
    p_cve_ent text DEFAULT NULL,
    p_nom_ent text DEFAULT NULL,
    p_cve_mun text DEFAULT NULL,
    p_nom_mun text DEFAULT NULL,
    p_cvegeo text DEFAULT NULL,
    p_referrer text DEFAULT NULL,
    p_landing_url text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contact_id uuid;
    v_metadata jsonb;
BEGIN
    v_metadata := jsonb_strip_nulls(
        jsonb_build_object(
            'ip', NULLIF(p_ip, ''),
            'device_type', NULLIF(p_device_type, ''),
            'referrer', NULLIF(p_referrer, ''),
            'landing_url', NULLIF(p_landing_url, '')
        )
    );

    v_contact_id := public._ensure_webchat_contact(
        p_session_id,
        COALESCE(v_metadata, '{}'::jsonb)
    );

    INSERT INTO public.webchat_visitantes (
        session_id,
        contacto_id,
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
        ultimo_evento_en
    )
    VALUES (
        p_session_id,
        v_contact_id,
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
        now()
    )
    ON CONFLICT (session_id) DO UPDATE
      SET contacto_id = EXCLUDED.contacto_id,
          ip = COALESCE(EXCLUDED.ip, public.webchat_visitantes.ip),
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
$$;

GRANT EXECUTE ON FUNCTION public.record_webchat_visitante(
    text,
    text,
    text,
    jsonb,
    text,
    text,
    text,
    text,
    text,
    text,
    text
) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.record_webchat_visitante(
    p_session_id text,
    p_ip text DEFAULT NULL,
    p_device_type text DEFAULT NULL,
    p_geo jsonb DEFAULT NULL,
    p_cve_ent text DEFAULT NULL,
    p_nom_ent text DEFAULT NULL,
    p_cve_mun text DEFAULT NULL,
    p_nom_mun text DEFAULT NULL,
    p_cvegeo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.record_webchat_visitante(
        p_session_id,
        p_ip,
        p_device_type,
        p_geo,
        p_cve_ent,
        p_nom_ent,
        p_cve_mun,
        p_nom_mun,
        p_cvegeo,
        NULL,
        NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_webchat_visitante(
    text,
    text,
    text,
    jsonb,
    text,
    text,
    text,
    text,
    text
) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.registrar_mensaje_webchat(
    p_session_id text,
    p_author text,
    p_content text,
    p_response_id text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_inactivity_hours integer DEFAULT NULL
) RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, conversacion_openai_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    v_contact_id := public._ensure_webchat_contact(
        p_session_id,
        COALESCE(p_metadata, '{}'::jsonb)
    );

    IF coalesce(p_author, 'user') = 'user' THEN
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

    UPDATE public.webchat_visitantes
       SET contacto_id = v_contact_id,
           ultimo_evento_en = GREATEST(ultimo_evento_en, v_now)
     WHERE session_id = p_session_id;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_conv_openai;
END;
$$;

COMMENT ON FUNCTION public.registrar_mensaje_webchat(text, text, text, text, jsonb, integer)
    IS 'Registra mensajes del webchat, garantiza el vínculo con contactos, reinicia conversación si han pasado >24h y persiste el conversation_id de OpenAI (conv_...).';

GRANT EXECUTE ON FUNCTION public.registrar_mensaje_webchat(text, text, text, text, jsonb, integer)
    TO postgres, service_role;

COMMIT;
