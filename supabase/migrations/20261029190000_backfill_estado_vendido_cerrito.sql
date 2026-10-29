BEGIN;

-- La operación histórica de Cerrito ya está marcada como vendida. Esta
-- migración alinea el estado de la unidad y registra su movimiento histórico.

INSERT INTO public.propiedad_unidad_movimientos (
    organizacion_id,
    unidad_id,
    oportunidad_id,
    persona_id,
    cuenta_id,
    estado_anterior,
    estado_nuevo,
    precio,
    moneda,
    motivo,
    creado_por
)
SELECT
    '39e32c05-bfc2-4794-8aab-225873f2bf19',
    u.id,
    oi.oportunidad_id,
    oi.cliente_principal_id,
    o.cuenta_id,
    u.status,
    'vendido'::public.propiedad_status,
    COALESCE(oi.precio_final, oi.precio_acordado, q.total),
    COALESCE(oi.moneda, q.moneda, 'MXN'),
    'backfill_operacion_vendida',
    oi.agente_usuario_id
FROM public.operaciones_inmobiliarias oi
JOIN public.propiedad_unidades u ON u.id = oi.unidad_id
JOIN public.oportunidades o
  ON o.organizacion_id = oi.organizacion_id
 AND o.id = oi.oportunidad_id
LEFT JOIN public.cotizaciones q
  ON q.organizacion_id = oi.organizacion_id
 AND q.oportunidad_id = oi.oportunidad_id
 AND q.unidad_id = oi.unidad_id
WHERE oi.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND oi.id = '9090dc8a-b613-4aa3-9b65-208967a06e30'
  AND oi.estado = 'vendida'
  AND u.status <> 'vendido'::public.propiedad_status
  AND NOT EXISTS (
      SELECT 1
      FROM public.propiedad_unidad_movimientos m
      WHERE m.organizacion_id = oi.organizacion_id
        AND m.unidad_id = oi.unidad_id
        AND m.oportunidad_id = oi.oportunidad_id
        AND m.estado_nuevo = 'vendido'::public.propiedad_status
  );

UPDATE public.propiedad_unidades
SET status = 'vendido'::public.propiedad_status,
    actualizado_en = now()
WHERE id = '7114b859-78bb-4120-9300-e8e06065e0a3'
  AND oportunidad_id = '75bc43ff-6ba2-422e-bd55-9e6c117fef75'
  AND status <> 'vendido'::public.propiedad_status;

COMMIT;
