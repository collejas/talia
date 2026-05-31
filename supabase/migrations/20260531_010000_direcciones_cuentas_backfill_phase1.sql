BEGIN;

-- ============================================================================
-- Fase 1: materializar direcciones legacy en el modelo nuevo
-- ============================================================================
--
-- Criterios:
-- - No guardar datos de direccion en metadata.
-- - Mantener compatibilidad con cuentas legacy.
-- - Crear una direccion fiscal por cada cuenta con domicilio legacy.
-- - Crear la relacion fiscal correspondiente en cuenta_direcciones.
-- - Dejar el modelo listo para que backend/UI agreguen direccion operativa
--   y sucursales en fases posteriores.

WITH legacy_accounts AS (
    SELECT
        c.id AS cuenta_id,
        c.organizacion_id,
        COALESCE(NULLIF(btrim(c.pais), ''), NULLIF(btrim(c.direccion->>'pais'), '')) AS pais,
        COALESCE(NULLIF(btrim(c.clave_entidad), ''), NULLIF(btrim(c.direccion->>'clave_entidad'), '')) AS clave_entidad,
        COALESCE(NULLIF(btrim(c.entidad), ''), NULLIF(btrim(c.direccion->>'entidad'), '')) AS entidad,
        COALESCE(NULLIF(btrim(c.clave_municipio), ''), NULLIF(btrim(c.direccion->>'clave_municipio'), '')) AS clave_municipio,
        COALESCE(NULLIF(btrim(c.municipio), ''), NULLIF(btrim(c.direccion->>'municipio'), '')) AS municipio,
        COALESCE(NULLIF(btrim(c.clave_localidad), ''), NULLIF(btrim(c.direccion->>'clave_localidad'), '')) AS clave_localidad,
        COALESCE(NULLIF(btrim(c.localidad), ''), NULLIF(btrim(c.direccion->>'localidad'), '')) AS localidad,
        COALESCE(NULLIF(btrim(c.tipo_vialidad), ''), NULLIF(btrim(c.direccion->>'tipo_vialidad'), '')) AS tipo_vialidad,
        COALESCE(NULLIF(btrim(c.nombre_vialidad), ''), NULLIF(btrim(c.direccion->>'nombre_vialidad'), '')) AS nombre_vialidad,
        COALESCE(NULLIF(btrim(c.numero_exterior), ''), NULLIF(btrim(c.direccion->>'numero_exterior'), '')) AS numero_exterior,
        COALESCE(NULLIF(btrim(c.letra_exterior), ''), NULLIF(btrim(c.direccion->>'letra_exterior'), '')) AS letra_exterior,
        COALESCE(NULLIF(btrim(c.edificio), ''), NULLIF(btrim(c.direccion->>'edificio'), '')) AS edificio,
        COALESCE(NULLIF(btrim(c.edificio_piso), ''), NULLIF(btrim(c.direccion->>'edificio_piso'), '')) AS edificio_piso,
        COALESCE(NULLIF(btrim(c.numero_interior), ''), NULLIF(btrim(c.direccion->>'numero_interior'), '')) AS numero_interior,
        COALESCE(NULLIF(btrim(c.letra_interior), ''), NULLIF(btrim(c.direccion->>'letra_interior'), '')) AS letra_interior,
        COALESCE(NULLIF(btrim(c.tipo_asentamiento), ''), NULLIF(btrim(c.direccion->>'tipo_asentamiento'), '')) AS tipo_asentamiento,
        COALESCE(NULLIF(btrim(c.nombre_asentamiento), ''), NULLIF(btrim(c.direccion->>'nombre_asentamiento'), '')) AS nombre_asentamiento,
        COALESCE(NULLIF(btrim(c.tipo_centro_comercial), ''), NULLIF(btrim(c.direccion->>'tipo_centro_comercial'), '')) AS tipo_centro_comercial,
        COALESCE(NULLIF(btrim(c.corredor_industrial), ''), NULLIF(btrim(c.direccion->>'corredor_industrial'), '')) AS corredor_industrial,
        COALESCE(NULLIF(btrim(c.numero_local), ''), NULLIF(btrim(c.direccion->>'numero_local'), '')) AS numero_local,
        COALESCE(NULLIF(btrim(c.codigo_postal), ''), NULLIF(btrim(c.direccion->>'codigo_postal'), '')) AS codigo_postal,
        COALESCE(
            c.latitud,
            CASE
                WHEN NULLIF(btrim(c.direccion->>'latitud'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN NULLIF(btrim(c.direccion->>'latitud'), '')::numeric
                ELSE NULL
            END
        ) AS latitud,
        COALESCE(
            c.longitud,
            CASE
                WHEN NULLIF(btrim(c.direccion->>'longitud'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN NULLIF(btrim(c.direccion->>'longitud'), '')::numeric
                ELSE NULL
            END
        ) AS longitud
    FROM public.cuentas c
    WHERE
        NULLIF(btrim(c.pais), '') IS NOT NULL
        OR NULLIF(btrim(c.clave_entidad), '') IS NOT NULL
        OR NULLIF(btrim(c.entidad), '') IS NOT NULL
        OR NULLIF(btrim(c.clave_municipio), '') IS NOT NULL
        OR NULLIF(btrim(c.municipio), '') IS NOT NULL
        OR NULLIF(btrim(c.clave_localidad), '') IS NOT NULL
        OR NULLIF(btrim(c.localidad), '') IS NOT NULL
        OR NULLIF(btrim(c.tipo_vialidad), '') IS NOT NULL
        OR NULLIF(btrim(c.nombre_vialidad), '') IS NOT NULL
        OR NULLIF(btrim(c.numero_exterior), '') IS NOT NULL
        OR NULLIF(btrim(c.letra_exterior), '') IS NOT NULL
        OR NULLIF(btrim(c.edificio), '') IS NOT NULL
        OR NULLIF(btrim(c.edificio_piso), '') IS NOT NULL
        OR NULLIF(btrim(c.numero_interior), '') IS NOT NULL
        OR NULLIF(btrim(c.letra_interior), '') IS NOT NULL
        OR NULLIF(btrim(c.tipo_asentamiento), '') IS NOT NULL
        OR NULLIF(btrim(c.nombre_asentamiento), '') IS NOT NULL
        OR NULLIF(btrim(c.tipo_centro_comercial), '') IS NOT NULL
        OR NULLIF(btrim(c.corredor_industrial), '') IS NOT NULL
        OR NULLIF(btrim(c.numero_local), '') IS NOT NULL
        OR NULLIF(btrim(c.codigo_postal), '') IS NOT NULL
        OR c.latitud IS NOT NULL
        OR c.longitud IS NOT NULL
        OR (c.direccion IS NOT NULL AND c.direccion <> '{}'::jsonb)
)
INSERT INTO public.direcciones (
    id,
    organizacion_id,
    tipo,
    pais,
    clave_entidad,
    entidad,
    clave_municipio,
    municipio,
    clave_localidad,
    localidad,
    tipo_vialidad,
    nombre_vialidad,
    numero_exterior,
    letra_exterior,
    edificio,
    edificio_piso,
    numero_interior,
    letra_interior,
    tipo_asentamiento,
    nombre_asentamiento,
    tipo_centro_comercial,
    corredor_industrial,
    numero_local,
    codigo_postal,
    latitud,
    longitud,
    metadata
)
SELECT
    extensions.uuid_generate_v5(
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        la.cuenta_id::text || ':fiscal'
    ) AS id,
    la.organizacion_id,
    'fiscal' AS tipo,
    la.pais,
    la.clave_entidad,
    la.entidad,
    la.clave_municipio,
    la.municipio,
    la.clave_localidad,
    la.localidad,
    la.tipo_vialidad,
    la.nombre_vialidad,
    la.numero_exterior,
    la.letra_exterior,
    la.edificio,
    la.edificio_piso,
    la.numero_interior,
    la.letra_interior,
    la.tipo_asentamiento,
    la.nombre_asentamiento,
    la.tipo_centro_comercial,
    la.corredor_industrial,
    la.numero_local,
    la.codigo_postal,
    la.latitud,
    la.longitud,
    '{}'::jsonb AS metadata
FROM legacy_accounts la
ON CONFLICT (id) DO UPDATE SET
    organizacion_id = EXCLUDED.organizacion_id,
    tipo = EXCLUDED.tipo,
    pais = EXCLUDED.pais,
    clave_entidad = EXCLUDED.clave_entidad,
    entidad = EXCLUDED.entidad,
    clave_municipio = EXCLUDED.clave_municipio,
    municipio = EXCLUDED.municipio,
    clave_localidad = EXCLUDED.clave_localidad,
    localidad = EXCLUDED.localidad,
    tipo_vialidad = EXCLUDED.tipo_vialidad,
    nombre_vialidad = EXCLUDED.nombre_vialidad,
    numero_exterior = EXCLUDED.numero_exterior,
    letra_exterior = EXCLUDED.letra_exterior,
    edificio = EXCLUDED.edificio,
    edificio_piso = EXCLUDED.edificio_piso,
    numero_interior = EXCLUDED.numero_interior,
    letra_interior = EXCLUDED.letra_interior,
    tipo_asentamiento = EXCLUDED.tipo_asentamiento,
    nombre_asentamiento = EXCLUDED.nombre_asentamiento,
    tipo_centro_comercial = EXCLUDED.tipo_centro_comercial,
    corredor_industrial = EXCLUDED.corredor_industrial,
    numero_local = EXCLUDED.numero_local,
    codigo_postal = EXCLUDED.codigo_postal,
    latitud = EXCLUDED.latitud,
    longitud = EXCLUDED.longitud,
    metadata = EXCLUDED.metadata,
    actualizado_en = now();

WITH legacy_accounts AS (
    SELECT
        c.id AS cuenta_id,
        c.organizacion_id,
        COALESCE(NULLIF(btrim(c.pais), ''), NULLIF(btrim(c.direccion->>'pais'), '')) AS pais,
        COALESCE(NULLIF(btrim(c.clave_entidad), ''), NULLIF(btrim(c.direccion->>'clave_entidad'), '')) AS clave_entidad,
        COALESCE(NULLIF(btrim(c.entidad), ''), NULLIF(btrim(c.direccion->>'entidad'), '')) AS entidad,
        COALESCE(NULLIF(btrim(c.clave_municipio), ''), NULLIF(btrim(c.direccion->>'clave_municipio'), '')) AS clave_municipio,
        COALESCE(NULLIF(btrim(c.municipio), ''), NULLIF(btrim(c.direccion->>'municipio'), '')) AS municipio,
        COALESCE(NULLIF(btrim(c.clave_localidad), ''), NULLIF(btrim(c.direccion->>'clave_localidad'), '')) AS clave_localidad,
        COALESCE(NULLIF(btrim(c.localidad), ''), NULLIF(btrim(c.direccion->>'localidad'), '')) AS localidad,
        COALESCE(NULLIF(btrim(c.tipo_vialidad), ''), NULLIF(btrim(c.direccion->>'tipo_vialidad'), '')) AS tipo_vialidad,
        COALESCE(NULLIF(btrim(c.nombre_vialidad), ''), NULLIF(btrim(c.direccion->>'nombre_vialidad'), '')) AS nombre_vialidad,
        COALESCE(NULLIF(btrim(c.numero_exterior), ''), NULLIF(btrim(c.direccion->>'numero_exterior'), '')) AS numero_exterior,
        COALESCE(NULLIF(btrim(c.letra_exterior), ''), NULLIF(btrim(c.direccion->>'letra_exterior'), '')) AS letra_exterior,
        COALESCE(NULLIF(btrim(c.edificio), ''), NULLIF(btrim(c.direccion->>'edificio'), '')) AS edificio,
        COALESCE(NULLIF(btrim(c.edificio_piso), ''), NULLIF(btrim(c.direccion->>'edificio_piso'), '')) AS edificio_piso,
        COALESCE(NULLIF(btrim(c.numero_interior), ''), NULLIF(btrim(c.direccion->>'numero_interior'), '')) AS numero_interior,
        COALESCE(NULLIF(btrim(c.letra_interior), ''), NULLIF(btrim(c.direccion->>'letra_interior'), '')) AS letra_interior,
        COALESCE(NULLIF(btrim(c.tipo_asentamiento), ''), NULLIF(btrim(c.direccion->>'tipo_asentamiento'), '')) AS tipo_asentamiento,
        COALESCE(NULLIF(btrim(c.nombre_asentamiento), ''), NULLIF(btrim(c.direccion->>'nombre_asentamiento'), '')) AS nombre_asentamiento,
        COALESCE(NULLIF(btrim(c.tipo_centro_comercial), ''), NULLIF(btrim(c.direccion->>'tipo_centro_comercial'), '')) AS tipo_centro_comercial,
        COALESCE(NULLIF(btrim(c.corredor_industrial), ''), NULLIF(btrim(c.direccion->>'corredor_industrial'), '')) AS corredor_industrial,
        COALESCE(NULLIF(btrim(c.numero_local), ''), NULLIF(btrim(c.direccion->>'numero_local'), '')) AS numero_local,
        COALESCE(NULLIF(btrim(c.codigo_postal), ''), NULLIF(btrim(c.direccion->>'codigo_postal'), '')) AS codigo_postal,
        COALESCE(
            c.latitud,
            CASE
                WHEN NULLIF(btrim(c.direccion->>'latitud'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN NULLIF(btrim(c.direccion->>'latitud'), '')::numeric
                ELSE NULL
            END
        ) AS latitud,
        COALESCE(
            c.longitud,
            CASE
                WHEN NULLIF(btrim(c.direccion->>'longitud'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN NULLIF(btrim(c.direccion->>'longitud'), '')::numeric
                ELSE NULL
            END
        ) AS longitud
    FROM public.cuentas c
    WHERE
        NULLIF(btrim(c.pais), '') IS NOT NULL
        OR NULLIF(btrim(c.clave_entidad), '') IS NOT NULL
        OR NULLIF(btrim(c.entidad), '') IS NOT NULL
        OR NULLIF(btrim(c.clave_municipio), '') IS NOT NULL
        OR NULLIF(btrim(c.municipio), '') IS NOT NULL
        OR NULLIF(btrim(c.clave_localidad), '') IS NOT NULL
        OR NULLIF(btrim(c.localidad), '') IS NOT NULL
        OR NULLIF(btrim(c.tipo_vialidad), '') IS NOT NULL
        OR NULLIF(btrim(c.nombre_vialidad), '') IS NOT NULL
        OR NULLIF(btrim(c.numero_exterior), '') IS NOT NULL
        OR NULLIF(btrim(c.letra_exterior), '') IS NOT NULL
        OR NULLIF(btrim(c.edificio), '') IS NOT NULL
        OR NULLIF(btrim(c.edificio_piso), '') IS NOT NULL
        OR NULLIF(btrim(c.numero_interior), '') IS NOT NULL
        OR NULLIF(btrim(c.letra_interior), '') IS NOT NULL
        OR NULLIF(btrim(c.tipo_asentamiento), '') IS NOT NULL
        OR NULLIF(btrim(c.nombre_asentamiento), '') IS NOT NULL
        OR NULLIF(btrim(c.tipo_centro_comercial), '') IS NOT NULL
        OR NULLIF(btrim(c.corredor_industrial), '') IS NOT NULL
        OR NULLIF(btrim(c.numero_local), '') IS NOT NULL
        OR NULLIF(btrim(c.codigo_postal), '') IS NOT NULL
        OR c.latitud IS NOT NULL
        OR c.longitud IS NOT NULL
        OR (c.direccion IS NOT NULL AND c.direccion <> '{}'::jsonb)
)
INSERT INTO public.cuenta_direcciones (
    id,
    organizacion_id,
    cuenta_id,
    direccion_id,
    tipo_relacion,
    es_principal,
    activo,
    notas,
    metadata
)
SELECT
    extensions.uuid_generate_v5(
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        la.cuenta_id::text || ':fiscal-rel'
    ) AS id,
    la.organizacion_id,
    la.cuenta_id,
    extensions.uuid_generate_v5(
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        la.cuenta_id::text || ':fiscal'
    ) AS direccion_id,
    'fiscal' AS tipo_relacion,
    false AS es_principal,
    true AS activo,
    NULL::text AS notas,
    '{}'::jsonb AS metadata
FROM legacy_accounts la
ON CONFLICT (id) DO UPDATE SET
    organizacion_id = EXCLUDED.organizacion_id,
    cuenta_id = EXCLUDED.cuenta_id,
    direccion_id = EXCLUDED.direccion_id,
    tipo_relacion = EXCLUDED.tipo_relacion,
    es_principal = EXCLUDED.es_principal,
    activo = EXCLUDED.activo,
    notas = EXCLUDED.notas,
    metadata = EXCLUDED.metadata,
    actualizado_en = now();

CREATE UNIQUE INDEX IF NOT EXISTS cuenta_direcciones_fiscal_activa_uidx
    ON public.cuenta_direcciones (cuenta_id)
    WHERE activo AND tipo_relacion = 'fiscal';

COMMIT;
