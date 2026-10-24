-- Índices para los joins reales de las RPC de métricas WhatsApp.
-- No cambian datos ni contratos y quedan limitados por organización.

create index if not exists eventos_entrega_org_mensaje_evento_idx
    on public.eventos_entrega (organizacion_id, mensaje_id, evento)
    where mensaje_id is not null;

create index if not exists eventos_entrega_org_provider_evento_idx
    on public.eventos_entrega (organizacion_id, proveedor_mensaje_id, evento)
    where proveedor_mensaje_id is not null;

create index if not exists conversaciones_org_whatsapp_prosp_batch_idx
    on public.conversaciones (
        organizacion_id,
        ((inbox_context ->> 'batch_id')),
        ultimo_mensaje_en desc
    )
    where canal = 'whatsapp'
      and lower(coalesce(inbox_context ->> 'source', '')) = 'prospeccion'
      and inbox_context ? 'batch_id';

create index if not exists conversaciones_org_whatsapp_prosp_campaign_idx
    on public.conversaciones (
        organizacion_id,
        ((inbox_context ->> 'campana_id')),
        ultimo_mensaje_en desc
    )
    where canal = 'whatsapp'
      and lower(coalesce(inbox_context ->> 'source', '')) = 'prospeccion'
      and inbox_context ? 'campana_id';

analyze public.eventos_entrega;
analyze public.conversaciones;
