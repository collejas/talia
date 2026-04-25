BEGIN;

WITH denue_src AS (
    SELECT
        r.id,
        regexp_split_to_array(
            regexp_replace(COALESCE(NULLIF(r.raw -> 'raw' ->> 'Ubicacion', ''), ''), '\s*,\s*', ',', 'g'),
            ','
        ) AS parts
    FROM public.resultados r
    WHERE r.fuente = 'denue'::public.fuente_resultado
      AND NULLIF(r.raw -> 'raw' ->> 'Ubicacion', '') IS NOT NULL
),
denue_geo AS (
    SELECT
        id,
        NULLIF(trim(parts[array_length(parts, 1)]), '') AS estado_nombre,
        NULLIF(trim(parts[GREATEST(array_length(parts, 1) - 1, 1)]), '') AS municipio_nombre,
        NULLIF(trim(parts[1]), '') AS localidad
    FROM denue_src
    WHERE array_length(parts, 1) IS NOT NULL
)
UPDATE public.resultados r
SET
    estado_nombre = COALESCE(r.estado_nombre, g.estado_nombre),
    municipio_nombre = COALESCE(r.municipio_nombre, g.municipio_nombre),
    localidad = COALESCE(r.localidad, g.localidad)
FROM denue_geo g
WHERE r.id = g.id
  AND (
      r.estado_nombre IS NULL
      OR r.municipio_nombre IS NULL
      OR r.localidad IS NULL
  );

UPDATE public.prospeccion_prospectos p
SET
    estado_nombre = COALESCE(p.estado_nombre, r.estado_nombre),
    municipio_nombre = COALESCE(p.municipio_nombre, r.municipio_nombre),
    localidad = COALESCE(p.localidad, r.localidad)
FROM public.resultados r
WHERE p.resultado_id = r.id
  AND r.fuente = 'denue'::public.fuente_resultado
  AND (
      p.estado_nombre IS NULL
      OR p.municipio_nombre IS NULL
      OR p.localidad IS NULL
  );

COMMIT;
