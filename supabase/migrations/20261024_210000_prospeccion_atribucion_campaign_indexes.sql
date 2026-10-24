-- Acelera la reconstrucción por campaña de la caché de métricas de correo.
-- La RPC primero resuelve los lotes de una campaña y después filtra por la
-- fecha efectiva del envío; el índice anterior priorizaba organización/fecha
-- y dejaba el filtro por batch para una etapa posterior.
create index if not exists prospeccion_envio_batch_canal_event_ts_idx
    on public.prospeccion_contacto_envio (
        batch_id,
        canal,
        (
            case
                when canal = 'correo' then coalesce(
                    proveedor_aceptado_en,
                    despacho_iniciado_en,
                    procesado_en,
                    creado_en,
                    programado_en
                )
                else coalesce(procesado_en, creado_en, programado_en)
            end
        )
    );

-- Permite localizar directamente las sesiones web atribuidas a un envio,
-- evitando recorrer todas las URLs del periodo para cada reconstrucción.
create index if not exists webchat_visitantes_org_envio_utm_evento_idx
    on public.webchat_visitantes (
        organizacion_id,
        (
            nullif(
                substring(
                    landing_url from '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'
                ),
                ''
            )::uuid
        ),
        ultimo_evento_en
    )
    where landing_url is not null and landing_url <> '';
