-- Purga puntual (ordenado) sin tocar RLS ni triggers.

DO $$
DECLARE
    target uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    PERFORM set_config('row_security', 'off', true);
    SET session_replication_role = replica;

    -- Prospección: contactos/logs/envíos/resultados
    DELETE FROM public.prospeccion_contactos_log      WHERE organizacion_id = target;
    DELETE FROM public.prospeccion_contacto_envio     WHERE organizacion_id = target;
    DELETE FROM public.prospeccion_contacto_batch     WHERE organizacion_id = target;
    DELETE FROM public.prospeccion_contacto_templates WHERE organizacion_id = target;
    DELETE FROM public.prospeccion_buscador_resultados WHERE organizacion_id = target;
    DELETE FROM public.prospeccion_buscador_jobs      WHERE organizacion_id = target;
    DELETE FROM public.prospeccion_contacto_listas    WHERE organizacion_id = target;
    DELETE FROM public.prospeccion_contacto_envio     WHERE organizacion_id = target;

    -- Conversaciones / webchat
    DELETE FROM public.conversation_summaries         WHERE organizacion_id = target;
    DELETE FROM public.conversaciones_insights        WHERE organizacion_id = target;
    DELETE FROM public.conversaciones_controles       WHERE organizacion_id = target;
    DELETE FROM public.conversaciones                 WHERE organizacion_id = target;
    DELETE FROM public.mensajes                       WHERE organizacion_id = target;
    DELETE FROM public.webchat_session_closures       WHERE organizacion_id = target;
    DELETE FROM public.webchat_visitantes             WHERE organizacion_id = target;
    DELETE FROM public.webhooks_entrantes             WHERE organizacion_id = target;

    -- CRM / Cotizaciones / Oportunidades
    DELETE FROM public.cotizacion_items               WHERE organizacion_id = target;
    DELETE FROM public.cotizaciones                   WHERE organizacion_id = target;
    DELETE FROM public.oportunidad_etapas_historial   WHERE organizacion_id = target;
    DELETE FROM public.oportunidades                  WHERE organizacion_id = target;
    DELETE FROM public.actividades                    WHERE organizacion_id = target;
    DELETE FROM public.leads                          WHERE organizacion_id = target;
    DELETE FROM public.contactos                      WHERE organizacion_id = target;

    -- Busquedas y eventos
    DELETE FROM public.busquedas                      WHERE organizacion_id = target;
    DELETE FROM public.eventos_entrega                WHERE organizacion_id = target;

    SET session_replication_role = DEFAULT;
END$$;
