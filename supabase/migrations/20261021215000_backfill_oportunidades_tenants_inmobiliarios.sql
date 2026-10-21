-- Normaliza oportunidades históricas de tenants que operan exclusivamente
-- en modalidad inmobiliaria. No cambia nombres técnicos ni cotizaciones.
UPDATE public.oportunidades AS o
SET dominio_comercial = 'propiedades'
FROM public.organizaciones AS org
WHERE o.organizacion_id = org.id
  AND o.organizacion_id IN (
      '39e32c05-bfc2-4794-8aab-225873f2bf19'::uuid,
      '7608c713-a9fb-460e-8b00-5878591b90d7'::uuid
  )
  AND COALESCE(org.config->'features'->'propiedades'->>'enabled', 'false') = 'true'
  AND COALESCE(org.config->'features'->'productos'->>'enabled', 'false') <> 'true'
  AND o.dominio_comercial IS DISTINCT FROM 'propiedades';
