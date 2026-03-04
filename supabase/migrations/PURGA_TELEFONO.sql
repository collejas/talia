CREATE OR REPLACE FUNCTION public.cleanup_test_phone_whatsapp(
    p_phone_e164 text,
    p_organizacion_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_digits text := regexp_replace(COALESCE(p_phone_e164, ''), '[^0-9]', '', 'g');
    v_digits_alt text := NULL;
    v_count integer := 0;
    v_deleted_webhooks_by_sid integer := 0;
    v_deleted_webhooks_by_payload integer := 0;
    v_deleted_eventos_entrega integer := 0;
    v_deleted_adjuntos integer := 0;
    v_deleted_mensajes integer := 0;
    v_deleted_asignaciones integer := 0;
    v_deleted_conv_insights integer := 0;
    v_deleted_conv_controls integer := 0;
    v_deleted_conv_summaries integer := 0;
    v_deleted_ejecuciones_asistente integer := 0;
    v_deleted_oportunidad_historial integer := 0;
    v_deleted_oportunidad_scoring integer := 0;
    v_deleted_oportunidades integer := 0;
    v_deleted_conversaciones integer := 0;
    v_deleted_identidades integer := 0;
    v_deleted_web_sessions integer := 0;
    v_deleted_webchat_visitantes integer := 0;
    v_deleted_webchat_session_closures integer := 0;
    v_deleted_actividades integer := 0;
    v_deleted_cotizaciones integer := 0;
    v_deleted_clientes integer := 0;
    v_deleted_llamadas integer := 0;
    v_deleted_tickets integer := 0;
    v_deleted_ticket_comentarios integer := 0;
    v_deleted_prosp_log_phone integer := 0;
    v_deleted_prosp_envio_phone integer := 0;
    v_deleted_prosp_suppressions_phone integer := 0;
    v_deleted_prosp_suppressions_prospect integer := 0;
    v_deleted_prosp_envio_prospect integer := 0;
    v_deleted_prosp_log_prospect integer := 0;
    v_deleted_prospectos integer := 0;
    v_deleted_contactos integer := 0;
BEGIN
    IF v_digits = '' THEN
        RAISE EXCEPTION 'phone_required';
    END IF;

    -- En MX pueden llegar variantes +521XXXXXXXXXX y +52XXXXXXXXXX.
    IF v_digits LIKE '521%' THEN
        v_digits_alt := '52' || substr(v_digits, 4);
    ELSIF v_digits LIKE '52%' THEN
        v_digits_alt := '521' || substr(v_digits, 3);
    END IF;

    CREATE TEMP TABLE tmp_cleanup_phones(phone_digits text PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO tmp_cleanup_phones(phone_digits) VALUES (v_digits) ON CONFLICT DO NOTHING;
    IF v_digits_alt IS NOT NULL AND v_digits_alt <> '' THEN
        INSERT INTO tmp_cleanup_phones(phone_digits) VALUES (v_digits_alt) ON CONFLICT DO NOTHING;
    END IF;

    CREATE TEMP TABLE tmp_cleanup_contacts ON COMMIT DROP AS
    SELECT c.id, c.organizacion_id
    FROM public.contactos c
    WHERE (p_organizacion_id IS NULL OR c.organizacion_id = p_organizacion_id)
      AND regexp_replace(COALESCE(c.telefono_e164, ''), '[^0-9]', '', 'g') IN (
          SELECT phone_digits FROM tmp_cleanup_phones
      );

    CREATE TEMP TABLE tmp_cleanup_conversations ON COMMIT DROP AS
    SELECT cv.id, cv.organizacion_id
    FROM public.conversaciones cv
    JOIN tmp_cleanup_contacts tc
      ON tc.id = cv.contacto_id
     AND tc.organizacion_id = cv.organizacion_id;

    CREATE TEMP TABLE tmp_cleanup_opportunities ON COMMIT DROP AS
    SELECT o.id, o.organizacion_id
    FROM public.oportunidades o
    JOIN tmp_cleanup_contacts tc
      ON tc.id = o.contacto_principal_id
     AND tc.organizacion_id = o.organizacion_id;

    CREATE TEMP TABLE tmp_cleanup_messages ON COMMIT DROP AS
    SELECT m.id, m.organizacion_id, m.twilio_message_sid
    FROM public.mensajes m
    JOIN tmp_cleanup_conversations tcv
      ON tcv.id = m.conversacion_id
     AND tcv.organizacion_id = m.organizacion_id;

    CREATE TEMP TABLE tmp_cleanup_sids ON COMMIT DROP AS
    SELECT DISTINCT tm.twilio_message_sid AS sid
    FROM tmp_cleanup_messages tm
    WHERE tm.twilio_message_sid IS NOT NULL
      AND btrim(tm.twilio_message_sid) <> '';

    CREATE TEMP TABLE tmp_cleanup_prospectos ON COMMIT DROP AS
    SELECT p.id, p.organizacion_id
    FROM public.prospeccion_prospectos p
    WHERE (p_organizacion_id IS NULL OR p.organizacion_id = p_organizacion_id)
      AND (
        regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
        OR regexp_replace(COALESCE(p.phone_e164, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
      );

    DELETE FROM public.webhooks_entrantes w
    WHERE w.id_solicitud IN (SELECT sid FROM tmp_cleanup_sids);
    GET DIAGNOSTICS v_deleted_webhooks_by_sid = ROW_COUNT;

    DELETE FROM public.webhooks_entrantes w
    WHERE w.canal = 'whatsapp'
      AND (
        regexp_replace(COALESCE(w.carga->>'WaId', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
        OR regexp_replace(COALESCE(w.carga->>'From', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
      );
    GET DIAGNOSTICS v_deleted_webhooks_by_payload = ROW_COUNT;

    DELETE FROM public.eventos_entrega e
    USING tmp_cleanup_messages tm
    WHERE e.organizacion_id = tm.organizacion_id
      AND e.mensaje_id = tm.id;
    GET DIAGNOSTICS v_deleted_eventos_entrega = ROW_COUNT;

    DELETE FROM public.adjuntos a
    USING tmp_cleanup_messages tm
    WHERE a.organizacion_id = tm.organizacion_id
      AND a.mensaje_id = tm.id;
    GET DIAGNOSTICS v_deleted_adjuntos = ROW_COUNT;

    -- Evita conflicto con FK compuesta (organizacion_id, ultimo_mensaje_id)
    -- que al borrar mensajes intenta nullificar ambas columnas.
    UPDATE public.conversaciones cv
       SET ultimo_mensaje_id = NULL
      FROM tmp_cleanup_messages tm
     WHERE cv.organizacion_id = tm.organizacion_id
       AND cv.ultimo_mensaje_id = tm.id;

    DELETE FROM public.mensajes m
    USING tmp_cleanup_messages tm
    WHERE m.organizacion_id = tm.organizacion_id
      AND m.id = tm.id;
    GET DIAGNOSTICS v_deleted_mensajes = ROW_COUNT;

    DELETE FROM public.asignaciones_vendedores av
    WHERE av.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations)
       OR av.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR av.contacto_id IN (SELECT id FROM tmp_cleanup_contacts);
    GET DIAGNOSTICS v_deleted_asignaciones = ROW_COUNT;

    DELETE FROM public.conversaciones_insights ci
    USING tmp_cleanup_conversations tcv
    WHERE ci.organizacion_id = tcv.organizacion_id
      AND ci.conversacion_id = tcv.id;
    GET DIAGNOSTICS v_deleted_conv_insights = ROW_COUNT;

    DELETE FROM public.conversaciones_controles cc
    USING tmp_cleanup_conversations tcv
    WHERE cc.organizacion_id = tcv.organizacion_id
      AND cc.conversacion_id = tcv.id;
    GET DIAGNOSTICS v_deleted_conv_controls = ROW_COUNT;

    DELETE FROM public.conversation_summaries cs
    WHERE cs.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations)
       OR cs.contacto_id IN (SELECT id FROM tmp_cleanup_contacts);
    GET DIAGNOSTICS v_deleted_conv_summaries = ROW_COUNT;

    DELETE FROM public.ejecuciones_asistente ea
    USING tmp_cleanup_conversations tcv
    WHERE ea.organizacion_id = tcv.organizacion_id
      AND ea.conversacion_id = tcv.id;
    GET DIAGNOSTICS v_deleted_ejecuciones_asistente = ROW_COUNT;

    DELETE FROM public.oportunidad_etapas_historial h
    USING tmp_cleanup_opportunities to2
    WHERE h.organizacion_id = to2.organizacion_id
      AND h.oportunidad_id = to2.id;
    GET DIAGNOSTICS v_deleted_oportunidad_historial = ROW_COUNT;

    DELETE FROM public.oportunidad_scoring_eventos se
    USING tmp_cleanup_opportunities to2
    WHERE se.organizacion_id = to2.organizacion_id
      AND se.oportunidad_id = to2.id;
    GET DIAGNOSTICS v_deleted_oportunidad_scoring = ROW_COUNT;

    DELETE FROM public.actividades a
    WHERE a.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR a.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_actividades = ROW_COUNT;

    DELETE FROM public.cotizaciones c
    WHERE c.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR c.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_cotizaciones = ROW_COUNT;

    DELETE FROM public.clientes c
    WHERE c.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR c.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_clientes = ROW_COUNT;

    DELETE FROM public.llamadas l
    WHERE l.contacto_id IN (SELECT id FROM tmp_cleanup_contacts);
    GET DIAGNOSTICS v_deleted_llamadas = ROW_COUNT;

    DELETE FROM public.ticket_comentarios tc
    WHERE tc.autor_cliente_id IN (SELECT id FROM tmp_cleanup_contacts);
    GET DIAGNOSTICS v_deleted_ticket_comentarios = ROW_COUNT;

    DELETE FROM public.tickets t
    WHERE t.contacto_id IN (SELECT id FROM tmp_cleanup_contacts);
    GET DIAGNOSTICS v_deleted_tickets = ROW_COUNT;

    DELETE FROM public.web_sessions ws
    WHERE ws.contacto_id IN (SELECT id FROM tmp_cleanup_contacts);
    GET DIAGNOSTICS v_deleted_web_sessions = ROW_COUNT;

    DELETE FROM public.webchat_visitantes wv
    USING tmp_cleanup_contacts tc
    WHERE wv.organizacion_id = tc.organizacion_id
      AND wv.contacto_id = tc.id;
    GET DIAGNOSTICS v_deleted_webchat_visitantes = ROW_COUNT;

    DELETE FROM public.webchat_session_closures wsc
    USING tmp_cleanup_contacts tc
    WHERE wsc.organizacion_id = tc.organizacion_id
      AND wsc.contacto_id = tc.id;
    GET DIAGNOSTICS v_deleted_webchat_session_closures = ROW_COUNT;

    DELETE FROM public.oportunidades o
    USING tmp_cleanup_opportunities to2
    WHERE o.organizacion_id = to2.organizacion_id
      AND o.id = to2.id;
    GET DIAGNOSTICS v_deleted_oportunidades = ROW_COUNT;

    DELETE FROM public.conversaciones cv
    USING tmp_cleanup_conversations tcv
    WHERE cv.organizacion_id = tcv.organizacion_id
      AND cv.id = tcv.id;
    GET DIAGNOSTICS v_deleted_conversaciones = ROW_COUNT;

    DELETE FROM public.identidades_canal ic
    USING tmp_cleanup_contacts tc
    WHERE ic.organizacion_id = tc.organizacion_id
      AND ic.contacto_id = tc.id;
    GET DIAGNOSTICS v_deleted_identidades = ROW_COUNT;

    DELETE FROM public.contactos c
    USING tmp_cleanup_contacts tc
    WHERE c.organizacion_id = tc.organizacion_id
      AND c.id = tc.id;
    GET DIAGNOSTICS v_deleted_contactos = ROW_COUNT;

    DELETE FROM public.prospeccion_contactos_log l
    WHERE l.prospecto_id IN (SELECT id FROM tmp_cleanup_prospectos)
       OR regexp_replace(COALESCE(l.detalle->>'phone', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones);
    GET DIAGNOSTICS v_deleted_prosp_log_phone = ROW_COUNT;

    DELETE FROM public.prospeccion_contacto_envio e
    WHERE e.prospecto_id IN (SELECT id FROM tmp_cleanup_prospectos)
       OR regexp_replace(COALESCE(e.detalle->>'phone', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones);
    GET DIAGNOSTICS v_deleted_prosp_envio_phone = ROW_COUNT;

    DELETE FROM public.prospeccion_contacto_suppressions s
    WHERE s.prospecto_id IN (SELECT id FROM tmp_cleanup_prospectos)
       OR regexp_replace(COALESCE(s.phone_e164, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones);
    GET DIAGNOSTICS v_deleted_prosp_suppressions_phone = ROW_COUNT;

    DELETE FROM public.prospeccion_prospectos p
    USING tmp_cleanup_prospectos tp
    WHERE p.organizacion_id = tp.organizacion_id
      AND p.id = tp.id;
    GET DIAGNOSTICS v_deleted_prospectos = ROW_COUNT;

    RETURN jsonb_build_object(
        'phone_input', p_phone_e164,
        'phone_digits', v_digits,
        'phone_digits_alt', v_digits_alt,
        'organizacion_id', p_organizacion_id,
        'deleted', jsonb_build_object(
            'webhooks_by_sid', v_deleted_webhooks_by_sid,
            'webhooks_by_payload', v_deleted_webhooks_by_payload,
            'eventos_entrega', v_deleted_eventos_entrega,
            'adjuntos', v_deleted_adjuntos,
            'mensajes', v_deleted_mensajes,
            'asignaciones_vendedores', v_deleted_asignaciones,
            'conversaciones_insights', v_deleted_conv_insights,
            'conversaciones_controles', v_deleted_conv_controls,
            'conversation_summaries', v_deleted_conv_summaries,
            'ejecuciones_asistente', v_deleted_ejecuciones_asistente,
            'oportunidad_etapas_historial', v_deleted_oportunidad_historial,
            'oportunidad_scoring_eventos', v_deleted_oportunidad_scoring,
            'actividades', v_deleted_actividades,
            'cotizaciones', v_deleted_cotizaciones,
            'clientes', v_deleted_clientes,
            'llamadas', v_deleted_llamadas,
            'ticket_comentarios', v_deleted_ticket_comentarios,
            'tickets', v_deleted_tickets,
            'web_sessions', v_deleted_web_sessions,
            'webchat_visitantes', v_deleted_webchat_visitantes,
            'webchat_session_closures', v_deleted_webchat_session_closures,
            'oportunidades', v_deleted_oportunidades,
            'conversaciones', v_deleted_conversaciones,
            'identidades_canal', v_deleted_identidades,
            'contactos', v_deleted_contactos,
            'prospeccion_contactos_log', v_deleted_prosp_log_phone,
            'prospeccion_contacto_envio', v_deleted_prosp_envio_phone,
            'prospeccion_contacto_suppressions', v_deleted_prosp_suppressions_phone,
            'prospeccion_prospectos', v_deleted_prospectos
        )
    );
END;
$function$;

COMMENT ON FUNCTION public.cleanup_test_phone_whatsapp(text, uuid) IS
'Elimina rastro de pruebas para un numero de telefono (CRM/WhatsApp/Prospeccion). Uso: select public.cleanup_test_phone_whatsapp(''+5214441302811'', ''00000000-0000-0000-0000-000000000001''::uuid);';
