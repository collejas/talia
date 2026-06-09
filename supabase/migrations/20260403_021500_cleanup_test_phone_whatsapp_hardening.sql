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
    v_local_digits text := NULL;
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
    v_deleted_prospectos integer := 0;
    v_deleted_personas integer := 0;
    v_deleted_contactos integer := 0;
    v_deleted_cuentas integer := 0;
    v_deleted_cuenta_personas integer := 0;
    v_deleted_cuenta_direcciones integer := 0;
    v_deleted_cliente_documentos integer := 0;
    v_deleted_cliente_portal_tokens integer := 0;
    v_deleted_cliente_responsables integer := 0;
    v_deleted_leads integer := 0;
    v_deleted_lead_eventos integer := 0;
    v_deleted_calendar_bookings integer := 0;
    v_deleted_calendar_slot_holds integer := 0;
    v_deleted_web_booking_sessions integer := 0;
    v_deleted_sales_notification_jobs integer := 0;
BEGIN
    EXECUTE 'SET LOCAL row_security = off';
    IF p_organizacion_id IS NOT NULL THEN
        PERFORM set_config('app.current_organizacion_id', p_organizacion_id::text, true);
    ELSE
        PERFORM set_config('app.current_organizacion_id', '', true);
    END IF;

    IF v_digits = '' THEN
        RAISE EXCEPTION 'phone_required';
    END IF;

    IF v_digits LIKE '521%' AND length(v_digits) >= 13 THEN
        v_local_digits := substr(v_digits, 4);
    ELSIF v_digits LIKE '52%' AND length(v_digits) >= 12 THEN
        v_local_digits := substr(v_digits, 3);
    ELSIF length(v_digits) = 10 THEN
        v_local_digits := v_digits;
    ELSIF length(v_digits) = 11 AND v_digits LIKE '1%' THEN
        v_local_digits := substr(v_digits, 2);
    END IF;

    CREATE TEMP TABLE tmp_cleanup_phones(phone_digits text PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO tmp_cleanup_phones(phone_digits)
    VALUES (v_digits)
    ON CONFLICT DO NOTHING;

    IF v_digits LIKE '521%' THEN
        INSERT INTO tmp_cleanup_phones(phone_digits)
        VALUES ('52' || substr(v_digits, 4))
        ON CONFLICT DO NOTHING;
    ELSIF v_digits LIKE '52%' THEN
        INSERT INTO tmp_cleanup_phones(phone_digits)
        VALUES ('521' || substr(v_digits, 3))
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_local_digits IS NOT NULL AND v_local_digits <> '' THEN
        INSERT INTO tmp_cleanup_phones(phone_digits)
        VALUES (v_local_digits)
        ON CONFLICT DO NOTHING;

        INSERT INTO tmp_cleanup_phones(phone_digits)
        VALUES ('52' || v_local_digits)
        ON CONFLICT DO NOTHING;

        INSERT INTO tmp_cleanup_phones(phone_digits)
        VALUES ('521' || v_local_digits)
        ON CONFLICT DO NOTHING;

        INSERT INTO tmp_cleanup_phones(phone_digits)
        VALUES ('521521' || v_local_digits)
        ON CONFLICT DO NOTHING;
    END IF;

    CREATE TEMP TABLE tmp_cleanup_prospectos ON COMMIT DROP AS
    SELECT p.id, p.organizacion_id
    FROM public.prospeccion_prospectos p
    WHERE TRUE
      AND (
        regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
        OR regexp_replace(COALESCE(p.phone_e164, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
      );

    CREATE TEMP TABLE tmp_cleanup_personas ON COMMIT DROP AS
    SELECT DISTINCT p.id, p.organizacion_id
    FROM public.personas p
    WHERE TRUE
      AND regexp_replace(COALESCE(p.telefono_principal_e164, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones);

    CREATE TEMP TABLE tmp_cleanup_contacts ON COMMIT DROP AS
    SELECT DISTINCT c.id, c.organizacion_id
    FROM public.contactos c
    WHERE TRUE
      AND (
        regexp_replace(COALESCE(c.telefono_e164, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
        OR c.id IN (
            SELECT NULLIF(p.metadata->>'crm_contacto_id', '')::uuid
            FROM public.prospeccion_prospectos p
            WHERE p.id IN (SELECT id FROM tmp_cleanup_prospectos)
              AND NULLIF(p.metadata->>'crm_contacto_id', '') IS NOT NULL
        )
        OR c.id IN (
            SELECT ic.contacto_id
            FROM public.identidades_canal ic
            WHERE TRUE
              AND (
                regexp_replace(COALESCE(ic.metadatos->>'telefono', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
                OR regexp_replace(COALESCE(ic.id_externo, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
              )
        )
      );

    CREATE TEMP TABLE tmp_cleanup_opportunities ON COMMIT DROP AS
    SELECT DISTINCT o.id, o.organizacion_id
    FROM public.oportunidades o
    WHERE TRUE
      AND (
        o.contacto_principal_id IN (SELECT id FROM tmp_cleanup_personas)
        OR o.contacto_principal_id IN (SELECT id FROM tmp_cleanup_contacts)
        OR NULLIF(o.metadata->>'prospecto_id', '')::uuid IN (SELECT id FROM tmp_cleanup_prospectos)
        OR o.id IN (
            SELECT NULLIF(p.metadata->>'crm_oportunidad_id', '')::uuid
            FROM public.prospeccion_prospectos p
            WHERE p.id IN (SELECT id FROM tmp_cleanup_prospectos)
              AND NULLIF(p.metadata->>'crm_oportunidad_id', '') IS NOT NULL
        )
      );

    CREATE TEMP TABLE tmp_cleanup_cuentas ON COMMIT DROP AS
    SELECT DISTINCT c.id, c.organizacion_id
    FROM public.cuentas c
    WHERE TRUE
      AND (
        c.id IN (
            SELECT DISTINCT ct.cuenta_id
            FROM public.contactos ct
            WHERE ct.id IN (SELECT id FROM tmp_cleanup_contacts)
              AND ct.cuenta_id IS NOT NULL
        )
        OR c.id IN (
            SELECT DISTINCT o.cuenta_id
            FROM public.oportunidades o
            WHERE o.id IN (SELECT id FROM tmp_cleanup_opportunities)
              AND o.cuenta_id IS NOT NULL
        )
        OR c.id IN (
            SELECT DISTINCT cp.cuenta_id
            FROM public.cuenta_personas cp
            WHERE cp.persona_id IN (SELECT id FROM tmp_cleanup_personas)
              AND cp.cuenta_id IS NOT NULL
        )
      );

    CREATE TEMP TABLE tmp_cleanup_leads ON COMMIT DROP AS
    SELECT DISTINCT l.id, l.organizacion_id
    FROM public.leads l
    WHERE TRUE
      AND (
        l.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
        OR l.convertido_a_contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
        OR l.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas)
        OR l.convertido_a_cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas)
      );

    CREATE TEMP TABLE tmp_cleanup_conversations ON COMMIT DROP AS
    SELECT DISTINCT cv.id, cv.organizacion_id
    FROM public.conversaciones cv
    WHERE TRUE
      AND (
        cv.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
        OR cv.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
        OR cv.persona_id IN (SELECT id FROM tmp_cleanup_personas)
        OR cv.id IN (
            SELECT NULLIF(o.metadata->>'conversation_id', '')::uuid
            FROM public.oportunidades o
            WHERE o.id IN (SELECT id FROM tmp_cleanup_opportunities)
              AND NULLIF(o.metadata->>'conversation_id', '') IS NOT NULL
        )
        OR cv.id IN (
            SELECT NULLIF(o.metadata->>'conversacion_id', '')::uuid
            FROM public.oportunidades o
            WHERE o.id IN (SELECT id FROM tmp_cleanup_opportunities)
              AND NULLIF(o.metadata->>'conversacion_id', '') IS NOT NULL
        )
      );

    CREATE TEMP TABLE tmp_cleanup_messages ON COMMIT DROP AS
    SELECT DISTINCT m.id, m.organizacion_id, m.twilio_message_sid
    FROM public.mensajes m
    WHERE TRUE
      AND (
        m.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations)
        OR regexp_replace(COALESCE(m.datos->>'phone_e164', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
        OR regexp_replace(COALESCE(m.datos->>'telefono', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
      );

    CREATE TEMP TABLE tmp_cleanup_sids ON COMMIT DROP AS
    SELECT DISTINCT tm.twilio_message_sid AS sid
    FROM tmp_cleanup_messages tm
    WHERE tm.twilio_message_sid IS NOT NULL
      AND btrim(tm.twilio_message_sid) <> '';

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

    UPDATE public.conversaciones cv
       SET ultimo_mensaje_id = NULL
     WHERE cv.ultimo_mensaje_id IN (SELECT id FROM tmp_cleanup_messages)
       AND (p_organizacion_id IS NULL OR cv.organizacion_id = p_organizacion_id);

    DELETE FROM public.mensajes m
    USING tmp_cleanup_messages tm
    WHERE m.organizacion_id = tm.organizacion_id
      AND m.id = tm.id;
    GET DIAGNOSTICS v_deleted_mensajes = ROW_COUNT;

    DELETE FROM public.asignaciones_vendedores av
    WHERE av.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations)
       OR av.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR av.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR av.persona_id IN (SELECT id FROM tmp_cleanup_personas);
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
       OR cs.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR cs.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR cs.persona_id IN (SELECT id FROM tmp_cleanup_personas);
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

    DELETE FROM public.lead_eventos le
    USING tmp_cleanup_leads tl
    WHERE le.organizacion_id = tl.organizacion_id
      AND le.lead_id = tl.id;
    GET DIAGNOSTICS v_deleted_lead_eventos = ROW_COUNT;

    DELETE FROM public.calendar_bookings cb
    WHERE cb.contact_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR cb.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations);
    GET DIAGNOSTICS v_deleted_calendar_bookings = ROW_COUNT;

    DELETE FROM public.calendar_slot_holds csh
    WHERE csh.contact_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR csh.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations);
    GET DIAGNOSTICS v_deleted_calendar_slot_holds = ROW_COUNT;

    DELETE FROM public.web_booking_sessions wbs
    WHERE wbs.contacto_id IN (SELECT id FROM tmp_cleanup_contacts);
    GET DIAGNOSTICS v_deleted_web_booking_sessions = ROW_COUNT;

    DELETE FROM public.sales_notification_jobs snj
    WHERE snj.contact_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR snj.conversation_id IN (SELECT id FROM tmp_cleanup_conversations)
       OR snj.opportunity_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_sales_notification_jobs = ROW_COUNT;

    DELETE FROM public.cliente_responsables cr
    WHERE cr.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas)
       OR cr.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_cliente_responsables = ROW_COUNT;

    DELETE FROM public.cliente_documentos cd
    WHERE cd.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas)
       OR cd.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_cliente_documentos = ROW_COUNT;

    DELETE FROM public.cliente_portal_tokens cpt
    WHERE cpt.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas)
       OR cpt.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_cliente_portal_tokens = ROW_COUNT;

    DELETE FROM public.cuenta_direcciones cd
    WHERE cd.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas);
    GET DIAGNOSTICS v_deleted_cuenta_direcciones = ROW_COUNT;

    DELETE FROM public.oportunidades o
    WHERE o.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas);
    GET DIAGNOSTICS v_deleted_oportunidades = ROW_COUNT;

    DELETE FROM public.cuenta_personas cp
    WHERE cp.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas)
       OR cp.persona_id IN (SELECT id FROM tmp_cleanup_personas);
    GET DIAGNOSTICS v_deleted_cuenta_personas = ROW_COUNT;

    DELETE FROM public.actividades a
    WHERE a.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR a.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR a.persona_id IN (SELECT id FROM tmp_cleanup_personas)
       OR a.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR a.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas);
    GET DIAGNOSTICS v_deleted_actividades = ROW_COUNT;

    DELETE FROM public.cotizaciones c
    WHERE c.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR c.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR c.persona_id IN (SELECT id FROM tmp_cleanup_personas)
       OR c.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR c.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas);
    GET DIAGNOSTICS v_deleted_cotizaciones = ROW_COUNT;

    DELETE FROM public.clientes c
    WHERE c.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR c.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR c.persona_id IN (SELECT id FROM tmp_cleanup_personas)
       OR c.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR c.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas);
    GET DIAGNOSTICS v_deleted_clientes = ROW_COUNT;

    DELETE FROM public.llamadas l
    WHERE l.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR l.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR l.persona_id IN (SELECT id FROM tmp_cleanup_personas)
       OR l.persona_id IN (SELECT id FROM tmp_cleanup_personas);
    GET DIAGNOSTICS v_deleted_llamadas = ROW_COUNT;

    DELETE FROM public.ticket_comentarios tc
    WHERE tc.autor_cliente_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR tc.autor_cliente_id IN (SELECT id FROM tmp_cleanup_personas);
    GET DIAGNOSTICS v_deleted_ticket_comentarios = ROW_COUNT;

    DELETE FROM public.tickets t
    WHERE t.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR t.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR t.persona_id IN (SELECT id FROM tmp_cleanup_personas)
       OR t.persona_id IN (SELECT id FROM tmp_cleanup_personas);
    GET DIAGNOSTICS v_deleted_tickets = ROW_COUNT;

    DELETE FROM public.web_sessions ws
    WHERE ws.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR ws.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR ws.persona_id IN (SELECT id FROM tmp_cleanup_personas)
       OR ws.persona_id IN (SELECT id FROM tmp_cleanup_personas);
    GET DIAGNOSTICS v_deleted_web_sessions = ROW_COUNT;

    DELETE FROM public.webchat_visitantes wv
    WHERE wv.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
      OR wv.persona_id IN (SELECT id FROM tmp_cleanup_personas);
    GET DIAGNOSTICS v_deleted_webchat_visitantes = ROW_COUNT;

    DELETE FROM public.webchat_session_closures wsc
    WHERE wsc.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
      OR wsc.persona_id IN (SELECT id FROM tmp_cleanup_personas);
    GET DIAGNOSTICS v_deleted_webchat_session_closures = ROW_COUNT;

    DELETE FROM public.oportunidades o
    USING tmp_cleanup_opportunities to2
    WHERE o.organizacion_id = to2.organizacion_id
      AND o.id = to2.id;
    GET DIAGNOSTICS v_deleted_oportunidades = ROW_COUNT;

    DELETE FROM public.leads l
    USING tmp_cleanup_leads tl
    WHERE l.organizacion_id = tl.organizacion_id
      AND l.id = tl.id;
    GET DIAGNOSTICS v_deleted_leads = ROW_COUNT;

    DELETE FROM public.conversaciones cv
    USING tmp_cleanup_conversations tcv
    WHERE cv.organizacion_id = tcv.organizacion_id
      AND cv.id = tcv.id;
    GET DIAGNOSTICS v_deleted_conversaciones = ROW_COUNT;

    DELETE FROM public.identidades_canal ic
    WHERE ic.contacto_id IN (SELECT id FROM tmp_cleanup_contacts)
       OR ic.contacto_id IN (SELECT id FROM tmp_cleanup_personas)
       OR ic.persona_id IN (SELECT id FROM tmp_cleanup_personas)
       OR regexp_replace(COALESCE(ic.metadatos->>'telefono', ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones)
       OR regexp_replace(COALESCE(ic.id_externo, ''), '[^0-9]', '', 'g') IN (SELECT phone_digits FROM tmp_cleanup_phones);
    GET DIAGNOSTICS v_deleted_identidades = ROW_COUNT;

    DELETE FROM public.contactos c
    USING tmp_cleanup_contacts tc
    WHERE c.organizacion_id = tc.organizacion_id
      AND c.id = tc.id;
    GET DIAGNOSTICS v_deleted_contactos = ROW_COUNT;

    DELETE FROM public.oportunidades o
    WHERE o.cuenta_id IN (SELECT id FROM tmp_cleanup_cuentas);

    DELETE FROM public.cuentas c
    USING tmp_cleanup_cuentas tc
    WHERE c.organizacion_id = tc.organizacion_id
      AND c.id = tc.id;
    GET DIAGNOSTICS v_deleted_cuentas = ROW_COUNT;

    DELETE FROM public.personas p
    USING tmp_cleanup_personas tp
    WHERE p.organizacion_id = tp.organizacion_id
      AND p.id = tp.id;
    GET DIAGNOSTICS v_deleted_personas = ROW_COUNT;

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

    PERFORM public.inbox_conversation_snapshot_mv_refresh();

    SELECT count(*)::integer INTO v_count FROM tmp_cleanup_phones;

    RETURN jsonb_build_object(
        'phone_input', p_phone_e164,
        'phone_digits', v_digits,
        'phone_digits_local', v_local_digits,
        'normalized_phone_variants', v_count,
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
            'calendar_bookings', v_deleted_calendar_bookings,
            'calendar_slot_holds', v_deleted_calendar_slot_holds,
            'web_booking_sessions', v_deleted_web_booking_sessions,
            'sales_notification_jobs', v_deleted_sales_notification_jobs,
            'cliente_responsables', v_deleted_cliente_responsables,
            'cliente_documentos', v_deleted_cliente_documentos,
            'cliente_portal_tokens', v_deleted_cliente_portal_tokens,
            'cuenta_direcciones', v_deleted_cuenta_direcciones,
            'cuenta_personas', v_deleted_cuenta_personas,
            'oportunidades', v_deleted_oportunidades,
            'leads', v_deleted_leads,
            'conversaciones', v_deleted_conversaciones,
            'identidades_canal', v_deleted_identidades,
            'contactos', v_deleted_contactos,
            'cuentas', v_deleted_cuentas,
            'prospeccion_contactos_log', v_deleted_prosp_log_phone,
            'prospeccion_contacto_envio', v_deleted_prosp_envio_phone,
            'prospeccion_contacto_suppressions', v_deleted_prosp_suppressions_phone,
            'prospeccion_prospectos', v_deleted_prospectos,
            'personas', v_deleted_personas
        )
    );
END;
$function$;

COMMENT ON FUNCTION public.cleanup_test_phone_whatsapp(text, uuid) IS
'Elimina rastro de pruebas para un numero de telefono (CRM/WhatsApp/Prospeccion). Soporta variantes locales de 10 digitos, +52 y +521. Uso: select public.cleanup_test_phone_whatsapp(''+5214441302811'', ''00000000-0000-0000-0000-000000000001''::uuid);';
