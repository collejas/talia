BEGIN;

WITH denue_src AS (
    SELECT
        r.id,
        NULLIF(r.raw -> 'raw' ->> 'Tipo_vialidad', '') AS tipo_vialidad,
        NULLIF(r.raw -> 'raw' ->> 'Calle', '') AS nombre_vialidad,
        NULLIF(r.raw -> 'raw' ->> 'Num_Exterior', '') AS numero_exterior,
        NULLIF(r.raw -> 'raw' ->> 'Num_Interior', '') AS numero_interior,
        NULLIF(r.raw -> 'raw' ->> 'Colonia', '') AS colonia,
        NULLIF(r.raw -> 'raw' ->> 'CP', '') AS codigo_postal,
        NULLIF(r.raw -> 'raw' ->> 'Cve_ent', '') AS estado_cve,
        NULLIF(r.raw -> 'raw' ->> 'Entidad', '') AS estado_nombre,
        NULLIF(r.raw -> 'raw' ->> 'Cve_mun', '') AS municipio_cve,
        NULLIF(r.raw -> 'raw' ->> 'Municipio', '') AS municipio_nombre,
        NULLIF(r.raw -> 'raw' ->> 'Cve_loc', '') AS localidad_cve,
        NULLIF(r.raw -> 'raw' ->> 'Localidad', '') AS localidad,
        NULLIF(r.raw -> 'raw' ->> 'AreaGeo', '') AS cvegeo,
        NULLIF(r.raw -> 'raw' ->> 'Tipo_Asentamiento', '') AS asentamiento,
        NULLIF(r.raw -> 'raw' ->> 'Entre_calles', '') AS entre_calles,
        NULLIF(r.raw -> 'raw' ->> 'Referencia', '') AS referencia
    FROM public.resultados r
    WHERE r.fuente = 'denue'::public.fuente_resultado
      AND r.raw -> 'raw' IS NOT NULL
)
UPDATE public.resultados r
SET
    address_full = COALESCE(
        NULLIF(CONCAT_WS(
            ', ',
            NULLIF(CONCAT_WS(' ', NULLIF(src.tipo_vialidad, ''), NULLIF(src.nombre_vialidad, '')), ''),
            NULLIF(CONCAT_WS(' ', NULLIF(src.numero_exterior, ''), NULLIF(src.numero_interior, '')), ''),
            NULLIF(src.colonia, ''),
            NULLIF(src.codigo_postal, ''),
            NULLIF(src.municipio_nombre, ''),
            NULLIF(src.estado_nombre, '')
        ), ''),
        r.address_full,
        r.address
    ),
    address = COALESCE(
        NULLIF(CONCAT_WS(
            ', ',
            NULLIF(CONCAT_WS(' ', NULLIF(src.tipo_vialidad, ''), NULLIF(src.nombre_vialidad, '')), ''),
            NULLIF(CONCAT_WS(' ', NULLIF(src.numero_exterior, ''), NULLIF(src.numero_interior, '')), ''),
            NULLIF(src.colonia, ''),
            NULLIF(src.codigo_postal, '')
        ), ''),
        r.address
    ),
    tipo_vialidad = COALESCE(src.tipo_vialidad, r.tipo_vialidad),
    nombre_vialidad = COALESCE(src.nombre_vialidad, r.nombre_vialidad),
    numero_exterior = COALESCE(src.numero_exterior, r.numero_exterior),
    numero_interior = COALESCE(src.numero_interior, r.numero_interior),
    colonia = COALESCE(src.colonia, r.colonia),
    codigo_postal = COALESCE(src.codigo_postal, r.codigo_postal),
    estado_cve = COALESCE(src.estado_cve, r.estado_cve),
    estado_nombre = COALESCE(src.estado_nombre, r.estado_nombre),
    municipio_cve = COALESCE(src.municipio_cve, r.municipio_cve),
    municipio_nombre = COALESCE(src.municipio_nombre, r.municipio_nombre),
    localidad_cve = COALESCE(src.localidad_cve, r.localidad_cve),
    localidad = COALESCE(src.localidad, r.localidad),
    cvegeo = COALESCE(src.cvegeo, r.cvegeo),
    asentamiento = COALESCE(src.asentamiento, r.asentamiento),
    entre_calles = COALESCE(src.entre_calles, r.entre_calles),
    referencia = COALESCE(src.referencia, r.referencia)
FROM denue_src src
WHERE r.id = src.id
  AND (
      r.address_full IS NULL
      OR r.address IS NULL
      OR r.tipo_vialidad IS NULL
      OR r.nombre_vialidad IS NULL
      OR r.numero_exterior IS NULL
      OR r.numero_interior IS NULL
      OR r.colonia IS NULL
      OR r.codigo_postal IS NULL
      OR r.estado_cve IS NULL
      OR r.estado_nombre IS NULL
      OR r.municipio_cve IS NULL
      OR r.municipio_nombre IS NULL
      OR r.localidad_cve IS NULL
      OR r.localidad IS NULL
      OR r.cvegeo IS NULL
      OR r.asentamiento IS NULL
      OR r.entre_calles IS NULL
      OR r.referencia IS NULL
  );

WITH denue_src AS (
    SELECT
        r.id,
        NULLIF(r.raw -> 'raw' ->> 'Tipo_vialidad', '') AS tipo_vialidad,
        NULLIF(r.raw -> 'raw' ->> 'Calle', '') AS nombre_vialidad,
        NULLIF(r.raw -> 'raw' ->> 'Num_Exterior', '') AS numero_exterior,
        NULLIF(r.raw -> 'raw' ->> 'Num_Interior', '') AS numero_interior,
        NULLIF(r.raw -> 'raw' ->> 'Colonia', '') AS colonia,
        NULLIF(r.raw -> 'raw' ->> 'CP', '') AS codigo_postal,
        NULLIF(r.raw -> 'raw' ->> 'Cve_ent', '') AS estado_cve,
        NULLIF(r.raw -> 'raw' ->> 'Entidad', '') AS estado_nombre,
        NULLIF(r.raw -> 'raw' ->> 'Cve_mun', '') AS municipio_cve,
        NULLIF(r.raw -> 'raw' ->> 'Municipio', '') AS municipio_nombre,
        NULLIF(r.raw -> 'raw' ->> 'Cve_loc', '') AS localidad_cve,
        NULLIF(r.raw -> 'raw' ->> 'Localidad', '') AS localidad,
        NULLIF(r.raw -> 'raw' ->> 'AreaGeo', '') AS cvegeo,
        NULLIF(r.raw -> 'raw' ->> 'Tipo_Asentamiento', '') AS asentamiento,
        NULLIF(r.raw -> 'raw' ->> 'Entre_calles', '') AS entre_calles,
        NULLIF(r.raw -> 'raw' ->> 'Referencia', '') AS referencia
    FROM public.resultados r
    WHERE r.fuente = 'denue'::public.fuente_resultado
      AND r.raw -> 'raw' IS NOT NULL
)
UPDATE public.prospeccion_prospectos p
SET
    nombre_comercial = COALESCE(p.nombre_comercial, NULLIF(p.display_name, ''), NULLIF(p.name, '')),
    address_full = COALESCE(p.address_full, r.address_full, NULLIF(p.address, '')),
    address = COALESCE(p.address, r.address),
    tipo_vialidad = COALESCE(p.tipo_vialidad, r.tipo_vialidad),
    nombre_vialidad = COALESCE(p.nombre_vialidad, r.nombre_vialidad),
    numero_exterior = COALESCE(p.numero_exterior, r.numero_exterior),
    numero_interior = COALESCE(p.numero_interior, r.numero_interior),
    colonia = COALESCE(p.colonia, r.colonia),
    codigo_postal = COALESCE(p.codigo_postal, r.codigo_postal),
    estado_cve = COALESCE(p.estado_cve, r.estado_cve),
    estado_nombre = COALESCE(p.estado_nombre, r.estado_nombre),
    municipio_cve = COALESCE(p.municipio_cve, r.municipio_cve),
    municipio_nombre = COALESCE(p.municipio_nombre, r.municipio_nombre),
    localidad_cve = COALESCE(p.localidad_cve, r.localidad_cve),
    localidad = COALESCE(p.localidad, r.localidad),
    cvegeo = COALESCE(p.cvegeo, r.cvegeo),
    asentamiento = COALESCE(p.asentamiento, r.asentamiento),
    entre_calles = COALESCE(p.entre_calles, r.entre_calles),
    referencia = COALESCE(p.referencia, r.referencia)
FROM public.resultados r
JOIN denue_src src ON src.id = r.id
WHERE p.resultado_id = r.id
  AND r.fuente = 'denue'::public.fuente_resultado
  AND (
      p.nombre_comercial IS NULL
      OR p.address_full IS NULL
      OR p.address IS NULL
      OR p.tipo_vialidad IS NULL
      OR p.nombre_vialidad IS NULL
      OR p.numero_exterior IS NULL
      OR p.numero_interior IS NULL
      OR p.colonia IS NULL
      OR p.codigo_postal IS NULL
      OR p.estado_cve IS NULL
      OR p.estado_nombre IS NULL
      OR p.municipio_cve IS NULL
      OR p.municipio_nombre IS NULL
      OR p.localidad_cve IS NULL
      OR p.localidad IS NULL
      OR p.cvegeo IS NULL
      OR p.asentamiento IS NULL
      OR p.entre_calles IS NULL
      OR p.referencia IS NULL
  );

COMMIT;
