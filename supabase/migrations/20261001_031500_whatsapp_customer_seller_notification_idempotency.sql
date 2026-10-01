create table if not exists public.whatsapp_customer_seller_notifications (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  conversacion_id uuid not null references public.conversaciones(id),
  oportunidad_id uuid references public.oportunidades(id),
  seller_id uuid not null references public.usuarios(id),
  trigger text not null,
  estado text not null default 'reservado'
    check (estado in ('reservado', 'enviado', 'fallido')),
  proveedor_mensaje_id text,
  ultimo_error text,
  reservado_en timestamptz not null default now(),
  enviado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  unique (organizacion_id, conversacion_id, seller_id)
);

create index if not exists whatsapp_customer_seller_notifications_conversation_idx
  on public.whatsapp_customer_seller_notifications (organizacion_id, conversacion_id);

create index if not exists whatsapp_customer_seller_notifications_state_idx
  on public.whatsapp_customer_seller_notifications (estado, actualizado_en desc);

alter table public.whatsapp_customer_seller_notifications enable row level security;
