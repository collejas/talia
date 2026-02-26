BEGIN;

WITH agg AS (
  SELECT
    r.organizacion_id,
    r.busqueda_id AS id,
    r.fuente,
    MIN(r.creado_en) AS creado_en,
    COUNT(*)::int AS total_encontrados,
    MAX(NULLIF(BTRIM(r.raw->>'query'), '')) AS raw_query,
    AVG(r.lat) FILTER (WHERE r.lat IS NOT NULL) AS lat_avg,
    AVG(r.lng) FILTER (WHERE r.lng IS NOT NULL) AS lng_avg
  FROM public.resultados r
  WHERE r.busqueda_id IS NOT NULL
  GROUP BY r.organizacion_id, r.busqueda_id, r.fuente
), missing AS (
  SELECT a.*
  FROM agg a
  LEFT JOIN public.busquedas b
    ON b.organizacion_id = a.organizacion_id
   AND b.id = a.id
  WHERE b.id IS NULL
)
INSERT INTO public.busquedas (
  id,
  organizacion_id,
  fuente,
  query,
  radio_m,
  lat,
  lng,
  total_encontrados,
  meta,
  creado_en,
  creado_por
)
SELECT
  m.id,
  m.organizacion_id,
  m.fuente,
  COALESCE(
    m.raw_query,
    CASE
      WHEN m.fuente = 'google_places'::public.fuente_resultado THEN 'Busqueda Google'
      WHEN m.fuente = 'denue'::public.fuente_resultado THEN 'Busqueda DENUE'
      ELSE 'Busqueda recuperada'
    END
  ) AS query,
  NULL::integer AS radio_m,
  m.lat_avg,
  m.lng_avg,
  m.total_encontrados,
  jsonb_build_object('source', 'backfill_resultados', 'recovered_at', now()) AS meta,
  m.creado_en,
  NULL::uuid AS creado_por
FROM missing m
ON CONFLICT (id) DO UPDATE
SET
  organizacion_id = EXCLUDED.organizacion_id,
  fuente = EXCLUDED.fuente,
  query = COALESCE(NULLIF(BTRIM(public.busquedas.query), ''), EXCLUDED.query),
  lat = COALESCE(public.busquedas.lat, EXCLUDED.lat),
  lng = COALESCE(public.busquedas.lng, EXCLUDED.lng),
  total_encontrados = GREATEST(COALESCE(public.busquedas.total_encontrados, 0), COALESCE(EXCLUDED.total_encontrados, 0)),
  meta = COALESCE(public.busquedas.meta, '{}'::jsonb) || EXCLUDED.meta,
  creado_en = LEAST(public.busquedas.creado_en, EXCLUDED.creado_en);

COMMIT;
