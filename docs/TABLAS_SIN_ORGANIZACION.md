• Quedó un montón de tablas con filas para la organización 00000000-0000-0000-0000-000000000001. Saqué los conteos ejecutando un
  UNION ALL que consulta cada tabla con organizacion_id (excepto RR.HH., porque la migración 194000 los excluye). Estas son las que
  todavía tienen registros > 0:

  - public.resultados: 53 501
  - public.prospeccion_prospectos_audit: 11 364
  - public.prospeccion_prospectos: 10 201
  - public.prospeccion_contactos_log: 159
  - public.prospeccion_buscador_resultados: 16 893
  - public.prospeccion_buscador_jobs: 165
  - public.prospeccion_contacto_batch: 56
  - public.prospeccion_contacto_envio: 76
  - public.prospeccion_contacto_templates: 4
  - public.prospeccion_prospecto_contacto_stats: 19
  - public.webhooks_entrantes: 36
  - public.webchat_visitantes: 28
  - public.webchat_session_closures: 18
  - public.mensajes: 78
  - public.contactos: 20
  - public.conversaciones: 20
  - public.conversaciones_controles: 2
  - public.conversaciones_insights: 3
  - public.conversation_summaries: 10
  - public.actividades: 14
  - public.leads: 0 (pero public.oportunidades: 18 y public.oportunidad_etapas_historial: 13)
  - public.cotizaciones: 3 y public.cotizacion_items: 3
  - public.busquedas: 121
  - public.eventos_entrega: 51
  - public.identidades_canal: 6
  - public.etapas_pipeline: 15
  - public.catalog_items: 4
  - public.logos: 3
  - public.panel_calendar_settings: 1
  - public.panel_email_templates: 1
  - public.calendar_availability_patterns: 5
  - public.calendar_resources: 1
  - public.permisos: 17
  - public.roles: 7, public.roles_permisos: 47, public.roles_codigo_counters: 1
  - public.usuarios: 3, public.usuarios_roles: 3
  - public.quote_templates: 1

  Todo lo demás del listado devolvió 0. Básicamente, la variante “preserve RRHH” dejó intactos todos los módulos de prospección,
  mensajería/webchat y configuración básica (permisos/roles), además de los catálogos relacionados.


# query de verificacion:

  SELECT 'public.prospeccion_contactos_log'      AS table_name, count(*) AS remaining FROM public.prospeccion_contactos_log
  WHERE organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.prospeccion_buscador_jobs',         count(*)              FROM public.prospeccion_buscador_jobs         WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.prospeccion_contacto_batch',        count(*)              FROM public.prospeccion_contacto_batch        WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.prospeccion_contacto_envio',        count(*)              FROM public.prospeccion_contacto_envio        WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.prospeccion_contacto_templates',    count(*)              FROM public.prospeccion_contacto_templates    WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.prospeccion_prospecto_contacto_stats', count(*)           FROM public.prospeccion_prospecto_contacto_stats WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.webhooks_entrantes',                count(*)              FROM public.webhooks_entrantes                WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.webchat_visitantes',                count(*)              FROM public.webchat_visitantes                WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.webchat_session_closures',          count(*)              FROM public.webchat_session_closures          WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.mensajes',                          count(*)              FROM public.mensajes                          WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.contactos',                         count(*)              FROM public.contactos                         WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.conversaciones',                    count(*)              FROM public.conversaciones                    WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.conversaciones_controles',          count(*)              FROM public.conversaciones_controles          WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.conversaciones_insights',           count(*)              FROM public.conversaciones_insights           WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.conversation_summaries',            count(*)              FROM public.conversation_summaries            WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.actividades',                       count(*)              FROM public.actividades                       WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.leads',                             count(*)              FROM public.leads                             WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.oportunidades',                     count(*)              FROM public.oportunidades                     WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.oportunidad_etapas_historial',      count(*)              FROM public.oportunidad_etapas_historial      WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.cotizaciones',                      count(*)              FROM public.cotizaciones                      WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.cotizacion_items',                  count(*)              FROM public.cotizacion_items                  WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.busquedas',                         count(*)              FROM public.busquedas                         WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'public.eventos_entrega',                   count(*)              FROM public.eventos_entrega                   WHERE
  organizacion_id = '00000000-0000-0000-0000-000000000001';