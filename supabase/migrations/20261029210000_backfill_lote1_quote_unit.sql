BEGIN;

-- Oportunidad histórica previa al refactor:
-- el catalog_item conservó la unidad correcta, pero la partida de la
-- cotización no tenía propiedad_id ni unidad_id explícitos.
UPDATE public.cotizacion_items AS ci
SET
    propiedad_id = cat.propiedad_id,
    unidad_id = cat.unidad_id
FROM public.cotizaciones AS c
JOIN public.catalog_items AS cat
    ON cat.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'::uuid
WHERE ci.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'::uuid
  AND c.id = ci.cotizacion_id
  AND c.organizacion_id = ci.organizacion_id
  AND cat.id = ci.catalog_item_id
  AND c.oportunidad_id = '7417010a-7be1-4a22-9882-3386a83b3984'::uuid
  AND c.dominio_comercial = 'propiedades'
  AND c.estatus = 'borrador'
  AND cat.unidad_id = '5ea1b8f6-b681-4119-9a19-8eab0d24675d'::uuid
  AND ci.propiedad_id IS NULL
  AND ci.unidad_id IS NULL;

COMMIT;
