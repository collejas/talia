-- Evita que un reintento del proveedor vuelva a materializar el mismo evento
-- en el log operativo. La fuente canónica de eventos de correo es
-- prospeccion_correo_eventos; este índice protege la compatibilidad de los
-- reportes que todavía leen una fila representativa desde contactos_log.
create unique index if not exists prospeccion_contactos_log_brevo_event_key
    on public.prospeccion_contactos_log (
        organizacion_id,
        envio_id,
        coalesce(trim(detalle->>'message_id'), ''),
        lower(coalesce(detalle->>'event', detalle->'brevo'->>'event', '')),
        coalesce(trim(detalle->>'date'), '')
    )
    where canal = 'correo'
      and envio_id is not null
      and nullif(trim(detalle->>'message_id'), '') is not null
      and nullif(trim(coalesce(detalle->>'event', detalle->'brevo'->>'event', '')), '') is not null
      and nullif(trim(detalle->>'date'), '') is not null;
