-- Acelera la RPC de atribución sin indexar todo el JSON histórico.
-- Solo incluye eventos que la métrica realmente consume.
create index if not exists prospeccion_contactos_log_atribucion_relevante_idx
    on public.prospeccion_contactos_log (organizacion_id, envio_id)
    where (
        lower(coalesce(accion, '')) in ('reply_inbound', 'respondido', 'postmark_open', 'postmark_click')
        or lower(coalesce(detalle->>'event', detalle->'brevo'->>'event', '')) in ('unique_opened', 'opened', 'unique_click', 'click')
        or lower(coalesce(detalle->>'direction', '')) in ('inbound', 'incoming')
        or coalesce(detalle->>'respondio', '') = 'true'
        or coalesce(detalle->>'respuesta', '') <> ''
    );
