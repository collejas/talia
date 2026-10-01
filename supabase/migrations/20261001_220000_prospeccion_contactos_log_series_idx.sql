-- Reduce the cost of the response series query used by prospeccion/metricas.
-- The API scopes by batch, channel, action and event timestamp before paging.
create index if not exists prospeccion_contactos_log_batch_canal_accion_creado_idx
    on public.prospeccion_contactos_log (batch_id, canal, accion, creado_en asc);
