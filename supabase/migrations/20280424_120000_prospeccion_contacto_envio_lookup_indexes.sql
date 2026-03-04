-- Mejora de lookup para fallback de Inbox/Prospeccion por telefono/correo en detalle JSON.

create index if not exists prospeccion_contacto_envio_detalle_phone_canal_creado_idx
on public.prospeccion_contacto_envio ((detalle->>'phone'), canal, creado_en desc);

create index if not exists prospeccion_contacto_envio_detalle_email_canal_creado_idx
on public.prospeccion_contacto_envio ((lower(detalle->>'email')), canal, creado_en desc);
