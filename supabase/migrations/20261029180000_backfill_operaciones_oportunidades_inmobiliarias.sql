BEGIN;

-- Completa operaciones históricas para oportunidades inmobiliarias ganadas que
-- ya tienen propuesta aceptada, unidad, propiedad y comprador explícitos.
-- El alcance se limita a tenants con propiedades habilitado.

INSERT INTO public.operaciones_inmobiliarias (
    organizacion_id,
    unidad_id,
    oportunidad_id,
    cliente_principal_id,
    agente_usuario_id,
    estado,
    forma_adquisicion,
    precio_acordado,
    precio_final,
    moneda,
    estado_validacion,
    observaciones_validacion
)
SELECT
    q.organizacion_id,
    q.unidad_id,
    q.oportunidad_id,
    q.persona_id,
    q.creada_por_usuario_id,
    'vendida',
    'por_definir',
    q.total,
    q.total,
    q.moneda,
    'pendiente_captura',
    'Backfill histórico: operación reconstruida desde oportunidad inmobiliaria y propuesta aceptada.'
FROM public.cotizaciones q
JOIN public.oportunidades o
  ON o.organizacion_id = q.organizacion_id
 AND o.id = q.oportunidad_id
JOIN public.organizaciones org
  ON org.id = q.organizacion_id
JOIN public.propiedad_unidades u
  ON u.id = q.unidad_id
JOIN public.propiedad_desarrollos d
  ON d.id = q.propiedad_id
 AND d.organizacion_id = q.organizacion_id
WHERE org.config #>> '{features,propiedades,enabled}' = 'true'
  AND lower(o.estado) = 'ganada'
  AND o.dominio_comercial = 'propiedades'
  AND q.estatus = 'aceptada'
  AND q.dominio_comercial = 'propiedades'
  AND q.unidad_id IS NOT NULL
  AND q.propiedad_id IS NOT NULL
  AND q.persona_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.operaciones_inmobiliarias oi
      WHERE oi.organizacion_id = q.organizacion_id
        AND oi.oportunidad_id = q.oportunidad_id
        AND oi.unidad_id = q.unidad_id
  );

UPDATE public.cotizaciones q
SET operacion_inmobiliaria_id = oi.id
FROM public.operaciones_inmobiliarias oi
JOIN public.organizaciones org ON org.id = oi.organizacion_id
WHERE q.organizacion_id = oi.organizacion_id
  AND q.oportunidad_id = oi.oportunidad_id
  AND q.unidad_id = oi.unidad_id
  AND org.config #>> '{features,propiedades,enabled}' = 'true'
  AND q.estatus = 'aceptada'
  AND q.dominio_comercial = 'propiedades'
  AND q.operacion_inmobiliaria_id IS NULL;

COMMIT;
