-- Índice auxiliar para localizar rápidamente eventos Brevo repetidos durante
-- la limpieza operativa y la deduplicación del webhook.
create index if not exists prospeccion_contactos_log_brevo_event_lookup_idx
    on public.prospeccion_contactos_log (
        organizacion_id,
        envio_id,
        (trim(detalle->>'message_id')),
        (lower(coalesce(detalle->>'event', detalle->'brevo'->>'event', ''))),
        (trim(detalle->>'date'))
    )
    where canal = 'correo'
      and envio_id is not null
      and nullif(trim(detalle->>'message_id'), '') is not null
      and nullif(trim(coalesce(detalle->>'event', detalle->'brevo'->>'event', '')), '') is not null
      and nullif(trim(detalle->>'date'), '') is not null;
