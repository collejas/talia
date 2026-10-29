-- Tenants inmobiliarios exclusivos deben presentar todas sus oportunidades
-- con el dominio de propiedades, independientemente de la etapa del embudo.
UPDATE public.oportunidades AS o
SET dominio_comercial = 'propiedades'
WHERE o.organizacion_id IN (
    '39e32c05-bfc2-4794-8aab-225873f2bf19'::uuid,
    '7608c713-a9fb-460e-8b00-5878591b90d7'::uuid
)
  AND o.dominio_comercial IS DISTINCT FROM 'propiedades';
