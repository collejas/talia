BEGIN;

-- Sincroniza referencias comerciales entre inventario y catálogo.
-- No inventa datos históricos: solo copia relaciones que ya existan en alguna
-- de las dos tablas para mantener consistencia entre unidad, catálogo,
-- oportunidad y persona.

UPDATE public.propiedad_unidades AS u
SET
    oportunidad_id = COALESCE(u.oportunidad_id, c.oportunidad_id),
    catalog_item_id = COALESCE(u.catalog_item_id, c.id)
FROM public.catalog_items AS c
WHERE c.unidad_id = u.id
  AND (
    u.oportunidad_id IS DISTINCT FROM COALESCE(u.oportunidad_id, c.oportunidad_id)
    OR u.catalog_item_id IS DISTINCT FROM COALESCE(u.catalog_item_id, c.id)
  );

UPDATE public.catalog_items AS c
SET
    unidad_id = COALESCE(c.unidad_id, u.id),
    oportunidad_id = COALESCE(c.oportunidad_id, u.oportunidad_id),
    persona_id = COALESCE(
        c.persona_id,
        (
            SELECT o.persona_id
            FROM public.oportunidades AS o
            WHERE o.id = COALESCE(c.oportunidad_id, u.oportunidad_id)
            LIMIT 1
        )
    )
FROM public.propiedad_unidades AS u
WHERE c.unidad_id = u.id
  AND (
    c.unidad_id IS DISTINCT FROM COALESCE(c.unidad_id, u.id)
    OR c.oportunidad_id IS DISTINCT FROM COALESCE(c.oportunidad_id, u.oportunidad_id)
    OR c.persona_id IS DISTINCT FROM COALESCE(
        c.persona_id,
        (
            SELECT o.persona_id
            FROM public.oportunidades AS o
            WHERE o.id = COALESCE(c.oportunidad_id, u.oportunidad_id)
            LIMIT 1
        )
    )
  );

COMMIT;
