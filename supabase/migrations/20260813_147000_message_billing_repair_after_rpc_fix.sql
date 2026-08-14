BEGIN;

-- Reintenta únicamente mensajes persistidos mientras el RPC de billing estaba
-- fallando por la resolución ambigua de organizacion_id. Es idempotente: el
-- RPC no duplica mensajes ya registrados.
DO $function$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT
            m.id AS mensaje_id,
            m.organizacion_id,
            m.conversacion_id,
            m.proveedor_mensaje_id,
            m.direccion,
            m.creado_en,
            m.datos,
            COALESCE(NULLIF(m.datos->>'provider', ''), CASE
                WHEN m.proveedor_mensaje_id LIKE 'wamid.%' THEN 'meta'
                ELSE 'twilio'
            END) AS proveedor,
            pricing.pricing,
            pricing.evento
        FROM public.mensajes m
        LEFT JOIN public.cobro_mensajes cm
            ON cm.organizacion_id = m.organizacion_id
           AND cm.mensaje_id = m.id
        LEFT JOIN LATERAL (
            SELECT
                e.payload_crudo->'status'->'pricing' AS pricing,
                e.evento
            FROM public.eventos_entrega e
            WHERE e.mensaje_id = m.id
            ORDER BY e.creado_en DESC, e.id DESC
            LIMIT 1
        ) pricing ON true
        WHERE cm.id IS NULL
          AND m.proveedor_mensaje_id IS NOT NULL
          AND btrim(m.proveedor_mensaje_id) <> ''
          AND m.conversacion_id IS NOT NULL
          AND m.creado_en >= '2026-08-13 23:00:00+00'
    LOOP
        PERFORM public.registrar_cobro_mensaje(
            item.organizacion_id,
            item.mensaje_id,
            item.proveedor,
            'whatsapp',
            item.proveedor_mensaje_id,
            COALESCE(item.evento, 'accepted'),
            COALESCE(NULLIF(item.pricing->>'category', ''), 'unknown'),
            NULLIF(item.pricing->>'pricing_model', ''),
            CASE
                WHEN item.pricing->>'billable' IN ('true', 'false')
                    THEN (item.pricing->>'billable')::boolean
                ELSE NULL
            END,
            COALESCE(NULLIF(item.datos->>'meta_template_name', ''), NULLIF(item.datos->>'template_name', '')) IS NOT NULL,
            COALESCE(NULLIF(item.datos->>'meta_template_name', ''), NULLIF(item.datos->>'template_name', '')),
            COALESCE(NULLIF(item.datos->>'meta_template_language', ''), NULLIF(item.datos->>'template_language', '')),
            'repair_after_billing_rpc_fix',
            item.creado_en,
            COALESCE(NULLIF(item.datos->>'meta_category', ''), NULLIF(item.datos->>'whatsapp_meta_category_snapshot', ''))
        );
    END LOOP;
END;
$function$;

COMMIT;
