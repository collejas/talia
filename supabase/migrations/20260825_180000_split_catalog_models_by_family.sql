BEGIN;

-- Model names are scoped by tenant and family. The same display name can
-- legitimately exist under different lines/families.
DROP INDEX IF EXISTS public.modelos_productos_unq_org_nombre;
CREATE UNIQUE INDEX modelos_productos_unq_org_familia_nombre
    ON public.modelos_productos (organizacion_id, familia_id, lower(btrim(nombre)));

WITH nuevos_modelos AS (
    INSERT INTO public.modelos_productos (
        organizacion_id,
        familia_id,
        codigo,
        nombre,
        descripcion,
        metadata,
        activo
    )
    VALUES
        (
            '00000000-0000-0000-0000-000000000001'::uuid,
            '91ca3c89-a993-4b45-a9aa-6b63740cbab7'::uuid,
            'MOD-D6D2512E-RENTA',
            'Departamento Sunset',
            NULL,
            '{}'::jsonb,
            true
        ),
        (
            '00000000-0000-0000-0000-000000000001'::uuid,
            '9e32248c-bc3a-4a78-ab69-5bd5635dc72c'::uuid,
            'MOD-FCF11688-VENTA',
            'Departamento View',
            NULL,
            '{}'::jsonb,
            true
        )
    RETURNING id, codigo
), reasignaciones AS (
    SELECT
        id AS nuevo_modelo_id,
        CASE codigo
            WHEN 'MOD-D6D2512E-RENTA' THEN 'd6d2512e-4fc5-4e47-ae67-fffa51728739'::uuid
            WHEN 'MOD-FCF11688-VENTA' THEN 'fcf11688-0c7b-4fd9-af48-99d08684223f'::uuid
        END AS modelo_origen_id,
        CASE codigo
            WHEN 'MOD-D6D2512E-RENTA' THEN '91ca3c89-a993-4b45-a9aa-6b63740cbab7'::uuid
            WHEN 'MOD-FCF11688-VENTA' THEN '9e32248c-bc3a-4a78-ab69-5bd5635dc72c'::uuid
        END AS familia_id
    FROM nuevos_modelos
)
UPDATE public.catalog_items ci
SET modelo_id = r.nuevo_modelo_id,
    actualizado_en = now()
FROM reasignaciones r
WHERE ci.organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND ci.modelo_id = r.modelo_origen_id
  AND ci.familia_id = r.familia_id;

COMMIT;
