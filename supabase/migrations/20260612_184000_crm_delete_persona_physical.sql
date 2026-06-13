CREATE OR REPLACE FUNCTION public.crm_delete_persona_physical(
    p_persona_id uuid,
    p_organizacion_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
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
    v_deleted_lead_eventos integer := 0;
    v_deleted_calendar_bookings integer := 0;
    v_deleted_calendar_slot_holds integer := 0;
    v_deleted_web_booking_sessions integer := 0;
    v_deleted_sales_notification_jobs integer := 0;
    v_deleted_actividades integer := 0;
    v_deleted_cotizaciones integer := 0;
    v_deleted_clientes integer := 0;
    v_deleted_llamadas integer := 0;
    v_deleted_ticket_comentarios integer := 0;
    v_deleted_tickets integer := 0;
    v_deleted_web_sessions integer := 0;
    v_deleted_webchat_visitantes integer := 0;
    v_deleted_webchat_session_closures integer := 0;
    v_deleted_identidades integer := 0;
    v_deleted_oportunidades integer := 0;
    v_deleted_leads integer := 0;
    v_deleted_conversaciones integer := 0;
    v_deleted_cuenta_personas integer := 0;
    v_deleted_notas integer := 0;
    v_deleted_personas integer := 0;
    v_deleted_contactos integer := 0;
BEGIN
    EXECUTE 'SET LOCAL row_security = off';
    IF p_organizacion_id IS NOT NULL THEN
        PERFORM set_config('app.current_organizacion_id', p_organizacion_id::text, true);
    ELSE
        PERFORM set_config('app.current_organizacion_id', '', true);
    END IF;

    CREATE TEMP TABLE tmp_target_personas (
        id uuid PRIMARY KEY,
        organizacion_id uuid NOT NULL,
        legacy_contacto_id uuid
    ) ON COMMIT DROP;

    INSERT INTO tmp_target_personas (id, organizacion_id, legacy_contacto_id)
    SELECT
        p.id,
        p.organizacion_id,
        NULLIF(p.metadata->>'legacy_contacto_id', '')::uuid
    FROM public.personas p
    WHERE p.id = p_persona_id
      AND (p_organizacion_id IS NULL OR p.organizacion_id = p_organizacion_id);

    IF NOT EXISTS (SELECT 1 FROM tmp_target_personas) THEN
        RAISE EXCEPTION 'persona_not_found';
    END IF;

    CREATE TEMP TABLE tmp_target_ids (
        id uuid PRIMARY KEY
    ) ON COMMIT DROP;

    INSERT INTO tmp_target_ids (id)
    SELECT id FROM tmp_target_personas
    ON CONFLICT DO NOTHING;

    INSERT INTO tmp_target_ids (id)
    SELECT legacy_contacto_id
    FROM tmp_target_personas
    WHERE legacy_contacto_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    CREATE TEMP TABLE tmp_cleanup_opportunities ON COMMIT DROP AS
    SELECT DISTINCT o.id, o.organizacion_id
    FROM public.oportunidades o
    WHERE TRUE
      AND o.contacto_principal_id IN (SELECT id FROM tmp_target_ids);

    CREATE TEMP TABLE tmp_cleanup_conversations ON COMMIT DROP AS
    SELECT DISTINCT cv.id, cv.organizacion_id
    FROM public.conversaciones cv
    WHERE TRUE
      AND (
        cv.contacto_id IN (SELECT id FROM tmp_target_ids)
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
    WHERE m.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations);

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
        regexp_replace(COALESCE(w.carga->>'WaId', ''), '[^0-9]', '', 'g') IN (SELECT id::text FROM tmp_target_ids)
        OR regexp_replace(COALESCE(w.carga->>'From', ''), '[^0-9]', '', 'g') IN (SELECT id::text FROM tmp_target_ids)
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
       OR av.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR av.persona_id IN (SELECT id FROM tmp_target_ids);
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
       OR cs.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR cs.persona_id IN (SELECT id FROM tmp_target_ids);
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
    USING public.leads l
    WHERE le.organizacion_id = l.organizacion_id
      AND le.lead_id = l.id
      AND (
        l.contacto_id IN (SELECT id FROM tmp_target_ids)
        OR l.convertido_a_contacto_id IN (SELECT id FROM tmp_target_ids)
      );
    GET DIAGNOSTICS v_deleted_lead_eventos = ROW_COUNT;

    DELETE FROM public.calendar_bookings cb
    WHERE cb.contact_id IN (SELECT id FROM tmp_target_ids)
       OR cb.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations);
    GET DIAGNOSTICS v_deleted_calendar_bookings = ROW_COUNT;

    DELETE FROM public.calendar_slot_holds csh
    WHERE csh.contact_id IN (SELECT id FROM tmp_target_ids)
       OR csh.conversacion_id IN (SELECT id FROM tmp_cleanup_conversations);
    GET DIAGNOSTICS v_deleted_calendar_slot_holds = ROW_COUNT;

    DELETE FROM public.web_booking_sessions wbs
    WHERE wbs.contacto_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_web_booking_sessions = ROW_COUNT;

    DELETE FROM public.sales_notification_jobs snj
    WHERE snj.contact_id IN (SELECT id FROM tmp_target_ids)
       OR snj.conversation_id IN (SELECT id FROM tmp_cleanup_conversations)
       OR snj.opportunity_id IN (SELECT id FROM tmp_cleanup_opportunities);
    GET DIAGNOSTICS v_deleted_sales_notification_jobs = ROW_COUNT;

    DELETE FROM public.actividades a
    WHERE a.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR a.persona_id IN (SELECT id FROM tmp_target_ids)
       OR a.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR a.cuenta_id IN (
            SELECT cp.cuenta_id
            FROM public.cuenta_personas cp
            WHERE cp.persona_id IN (SELECT id FROM tmp_target_ids)
       );
    GET DIAGNOSTICS v_deleted_actividades = ROW_COUNT;

    DELETE FROM public.cotizaciones c
    WHERE c.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR c.persona_id IN (SELECT id FROM tmp_target_ids)
       OR c.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR c.cuenta_id IN (
            SELECT cp.cuenta_id
            FROM public.cuenta_personas cp
            WHERE cp.persona_id IN (SELECT id FROM tmp_target_ids)
       );
    GET DIAGNOSTICS v_deleted_cotizaciones = ROW_COUNT;

    DELETE FROM public.clientes c
    WHERE c.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR c.persona_id IN (SELECT id FROM tmp_target_ids)
       OR c.oportunidad_id IN (SELECT id FROM tmp_cleanup_opportunities)
       OR c.cuenta_id IN (
            SELECT cp.cuenta_id
            FROM public.cuenta_personas cp
            WHERE cp.persona_id IN (SELECT id FROM tmp_target_ids)
       );
    GET DIAGNOSTICS v_deleted_clientes = ROW_COUNT;

    DELETE FROM public.llamadas l
    WHERE l.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR l.persona_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_llamadas = ROW_COUNT;

    DELETE FROM public.ticket_comentarios tc
    WHERE tc.autor_cliente_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_ticket_comentarios = ROW_COUNT;

    DELETE FROM public.tickets t
    WHERE t.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR t.persona_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_tickets = ROW_COUNT;

    DELETE FROM public.web_sessions ws
    WHERE ws.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR ws.persona_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_web_sessions = ROW_COUNT;

    DELETE FROM public.webchat_visitantes wv
    WHERE wv.contacto_id IN (SELECT id FROM tmp_target_ids)
      OR wv.persona_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_webchat_visitantes = ROW_COUNT;

    DELETE FROM public.webchat_session_closures wsc
    WHERE wsc.contacto_id IN (SELECT id FROM tmp_target_ids)
      OR wsc.persona_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_webchat_session_closures = ROW_COUNT;

    DELETE FROM public.identidades_canal ic
    WHERE ic.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR ic.persona_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_identidades = ROW_COUNT;

    DELETE FROM public.oportunidades o
    USING tmp_cleanup_opportunities to2
    WHERE o.organizacion_id = to2.organizacion_id
      AND o.id = to2.id;
    GET DIAGNOSTICS v_deleted_oportunidades = ROW_COUNT;

    DELETE FROM public.leads l
    WHERE l.contacto_id IN (SELECT id FROM tmp_target_ids)
       OR l.convertido_a_contacto_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_leads = ROW_COUNT;

    DELETE FROM public.conversaciones cv
    USING tmp_cleanup_conversations tcv
    WHERE cv.organizacion_id = tcv.organizacion_id
      AND cv.id = tcv.id;
    GET DIAGNOSTICS v_deleted_conversaciones = ROW_COUNT;

    DELETE FROM public.cuenta_personas cp
    WHERE cp.persona_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_cuenta_personas = ROW_COUNT;

    DELETE FROM public.notas n
    WHERE n.organizacion_id = p_organizacion_id
      AND n.relacion_id IN (SELECT id FROM tmp_target_ids);
    GET DIAGNOSTICS v_deleted_notas = ROW_COUNT;

    DELETE FROM public.personas p
    USING tmp_target_personas tp
    WHERE p.organizacion_id = tp.organizacion_id
      AND p.id = tp.id;
    GET DIAGNOSTICS v_deleted_personas = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM tmp_target_personas WHERE legacy_contacto_id IS NOT NULL) THEN
        DELETE FROM public.contactos c
        USING tmp_target_personas tp
        WHERE c.organizacion_id = tp.organizacion_id
          AND c.id = tp.legacy_contacto_id;
        GET DIAGNOSTICS v_deleted_contactos = ROW_COUNT;
    END IF;

    SELECT count(*)::integer INTO v_count FROM tmp_target_ids;

    RETURN jsonb_build_object(
        'persona_id', p_persona_id,
        'organizacion_id', p_organizacion_id,
        'target_ids', v_count,
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
            'lead_eventos', v_deleted_lead_eventos,
            'calendar_bookings', v_deleted_calendar_bookings,
            'calendar_slot_holds', v_deleted_calendar_slot_holds,
            'web_booking_sessions', v_deleted_web_booking_sessions,
            'sales_notification_jobs', v_deleted_sales_notification_jobs,
            'actividades', v_deleted_actividades,
            'cotizaciones', v_deleted_cotizaciones,
            'clientes', v_deleted_clientes,
            'llamadas', v_deleted_llamadas,
            'ticket_comentarios', v_deleted_ticket_comentarios,
            'tickets', v_deleted_tickets,
            'web_sessions', v_deleted_web_sessions,
            'webchat_visitantes', v_deleted_webchat_visitantes,
            'webchat_session_closures', v_deleted_webchat_session_closures,
            'identidades_canal', v_deleted_identidades,
            'oportunidades', v_deleted_oportunidades,
            'leads', v_deleted_leads,
            'conversaciones', v_deleted_conversaciones,
            'cuenta_personas', v_deleted_cuenta_personas,
            'notas', v_deleted_notas,
            'personas', v_deleted_personas,
            'contactos', v_deleted_contactos
        )
    );
END;
$function$;

COMMENT ON FUNCTION public.crm_delete_persona_physical(uuid, uuid) IS
'Elimina fisicamente una persona del CRM y limpia dependencias directas y legacy del tenant antes del DELETE. Usa el persona_id como clave principal y elimina tambien el contacto legacy si existe.';
