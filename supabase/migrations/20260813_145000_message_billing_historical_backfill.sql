BEGIN;

-- Backfill histórico controlado:
-- * solo mensajes con tenant, conversación e identificador del proveedor;
-- * no modifica public.mensajes ni public.eventos_entrega;
-- * usa la tarifa inicial configurada como tarifa vigente desde el primer
--   mensaje histórico, porque antes de esta feature no existía un precio
--   GEOACTIV histórico versionado;
-- * pricing Meta se recupera del último evento histórico que lo conserve.

UPDATE public.cobro_tarifas_app ta
SET vigente_desde = source.first_message_at,
    actualizado_en = now(),
    motivo = coalesce(ta.motivo, 'Tarifa inicial aplicada al backfill histórico')
FROM (
    SELECT min(m.creado_en) AS first_message_at
    FROM public.mensajes m
    JOIN public.conversaciones c
      ON c.organizacion_id = m.organizacion_id
     AND c.id = m.conversacion_id
    WHERE m.organizacion_id IS NOT NULL
      AND nullif(trim(m.twilio_message_sid), '') IS NOT NULL
) source
WHERE ta.alcance = 'global'
  AND ta.activo
  AND ta.vigente_hasta IS NULL
  AND source.first_message_at IS NOT NULL;

UPDATE public.cobro_tarifas_proveedor tp
SET vigente_desde = source.first_message_at,
    actualizado_en = now()
FROM (
    SELECT min(m.creado_en) AS first_message_at
    FROM public.mensajes m
    JOIN public.conversaciones c
      ON c.organizacion_id = m.organizacion_id
     AND c.id = m.conversacion_id
    WHERE m.organizacion_id IS NOT NULL
      AND nullif(trim(m.twilio_message_sid), '') IS NOT NULL
) source
WHERE tp.proveedor = 'meta'
  AND tp.canal = 'whatsapp'
  AND tp.pais_codigo_iso2 = 'MX'
  AND tp.categoria_meta = 'unknown'
  AND tp.iniciador_hilo = 'empresa'
  AND tp.activo
  AND tp.vigente_hasta IS NULL
  AND source.first_message_at IS NOT NULL;

DO $backfill$
DECLARE
    v_message record;
    v_pricing record;
    v_provider text;
    v_status text;
BEGIN
    FOR v_message IN
        SELECT m.id,
               m.organizacion_id,
               m.twilio_message_sid,
               m.creado_en,
               coalesce(m.datos->>'provider', '') AS configured_provider,
               coalesce(m.datos->>'template_name', '') AS template_name,
               coalesce(m.datos->>'template_language', '') AS template_language
        FROM public.mensajes m
        JOIN public.conversaciones c
          ON c.organizacion_id = m.organizacion_id
         AND c.id = m.conversacion_id
        WHERE m.organizacion_id IS NOT NULL
          AND nullif(trim(m.twilio_message_sid), '') IS NOT NULL
        ORDER BY m.creado_en, m.id
    LOOP
        v_provider := CASE
            WHEN v_message.twilio_message_sid LIKE 'wamid.%' THEN 'meta'
            WHEN lower(v_message.configured_provider) IN ('meta', 'twilio') THEN lower(v_message.configured_provider)
            ELSE 'twilio'
        END;

        SELECT
            e.payload_crudo->'status'->'pricing'->>'category' AS categoria,
            e.payload_crudo->'status'->'pricing'->>'pricing_model' AS pricing_model,
            CASE
                WHEN e.payload_crudo->'status'->'pricing'->>'billable' IS NULL THEN NULL
                ELSE (e.payload_crudo->'status'->'pricing'->>'billable')::boolean
            END AS billable,
            e.evento AS evento
        INTO v_pricing
        FROM public.eventos_entrega e
        WHERE e.mensaje_id = v_message.id
          AND e.proveedor = 'meta'
          AND e.payload_crudo->'status'->'pricing' IS NOT NULL
        ORDER BY e.creado_en DESC, e.id DESC
        LIMIT 1;

        SELECT coalesce(e.evento, 'accepted')
        INTO v_status
        FROM public.eventos_entrega e
        WHERE e.mensaje_id = v_message.id
        ORDER BY e.creado_en DESC, e.id DESC
        LIMIT 1;

        PERFORM public.registrar_cobro_mensaje(
            v_message.organizacion_id,
            v_message.id,
            v_provider,
            'whatsapp',
            v_message.twilio_message_sid,
            coalesce(v_status, 'accepted'),
            coalesce(v_pricing.categoria, 'unknown'),
            v_pricing.pricing_model,
            v_pricing.billable,
            v_message.template_name <> '',
            nullif(v_message.template_name, ''),
            nullif(v_message.template_language, ''),
            'historical_backfill_20260813',
            v_message.creado_en
        );
    END LOOP;
END;
$backfill$;

COMMIT;
