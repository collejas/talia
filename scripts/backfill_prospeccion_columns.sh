#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env"
BATCH_SIZE="${BATCH_SIZE:-2000}"
RUN_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No existe $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL" ]]; then
  DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL no encontrado en backend/.env" >&2
  exit 1
fi

count_pending() {
  local sql="$1"
  psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<SQL
SET statement_timeout = 0;
WITH pending AS (
  $sql
)
SELECT count(*) FROM pending;
SQL
}

print_overview() {
  local denue_pending google_pending prospectos_pending

  denue_pending="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.resultados r
WHERE r.fuente = 'denue'::public.fuente_resultado
  AND r.columnarized_at IS NULL;
SQL
  )"

  google_pending="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.resultados r
WHERE r.fuente = 'google_places'::public.fuente_resultado
  AND r.columnarized_at IS NULL;
SQL
  )"

  prospectos_pending="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.columnarized_at IS NULL;
SQL
  )"

  echo "Pendientes iniciales -> denue: ${denue_pending}, google: ${google_pending}, prospectos: ${prospectos_pending}"
  echo "Run started at UTC: ${RUN_STARTED_AT}"
}

print_overview

denue_done=0
google_done=0
prospectos_done=0

while true; do
  updated="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v batch_size="$BATCH_SIZE" <<'SQL'
SET statement_timeout = 0;
WITH batch AS (
  SELECT r.id
  FROM public.resultados r
  WHERE r.fuente = 'denue'::public.fuente_resultado
    AND r.columnarized_at IS NULL
  ORDER BY r.creado_en ASC
  LIMIT :batch_size
),
src AS (
  SELECT
    r.id,
    NULLIF(COALESCE(r.raw ->> 'Tipo_vialidad', r.raw -> 'raw' ->> 'Tipo_vialidad'), '') AS tipo_vialidad,
    NULLIF(COALESCE(r.raw ->> 'Calle', r.raw -> 'raw' ->> 'Calle', r.raw ->> 'Nombre_vialidad', r.raw -> 'raw' ->> 'Nombre_vialidad'), '') AS nombre_vialidad,
    NULLIF(COALESCE(r.raw ->> 'Num_Exterior', r.raw -> 'raw' ->> 'Num_Exterior', r.raw ->> 'Numero_exterior', r.raw -> 'raw' ->> 'Numero_exterior'), '') AS numero_exterior,
    NULLIF(COALESCE(r.raw ->> 'Num_Interior', r.raw -> 'raw' ->> 'Num_Interior', r.raw ->> 'Numero_interior', r.raw -> 'raw' ->> 'Numero_interior'), '') AS numero_interior,
    NULLIF(COALESCE(r.raw ->> 'Colonia', r.raw -> 'raw' ->> 'Colonia'), '') AS colonia,
    NULLIF(COALESCE(r.raw ->> 'CP', r.raw -> 'raw' ->> 'CP', r.raw ->> 'Codigo_postal', r.raw -> 'raw' ->> 'Codigo_postal'), '') AS codigo_postal,
    NULLIF(COALESCE(r.raw ->> 'Cve_ent', r.raw -> 'raw' ->> 'Cve_ent', r.raw ->> 'estado_cve'), '') AS estado_cve,
    NULLIF(COALESCE(r.raw ->> 'Entidad', r.raw -> 'raw' ->> 'Entidad', r.raw ->> 'Nom_ent', r.raw -> 'raw' ->> 'Nom_ent', r.raw ->> 'estado_nombre'), '') AS estado_nombre,
    NULLIF(COALESCE(r.raw ->> 'Cve_mun', r.raw -> 'raw' ->> 'Cve_mun', r.raw ->> 'municipio_cve'), '') AS municipio_cve,
    NULLIF(COALESCE(r.raw ->> 'Municipio', r.raw -> 'raw' ->> 'Municipio', r.raw ->> 'Nom_mun', r.raw -> 'raw' ->> 'Nom_mun', r.raw ->> 'municipio_nombre'), '') AS municipio_nombre,
    NULLIF(COALESCE(r.raw ->> 'Cve_loc', r.raw -> 'raw' ->> 'Cve_loc', r.raw ->> 'localidad_cve'), '') AS localidad_cve,
    NULLIF(COALESCE(r.raw ->> 'Localidad', r.raw -> 'raw' ->> 'Localidad', r.raw ->> 'Nom_loc', r.raw -> 'raw' ->> 'Nom_loc', r.raw ->> 'localidad'), '') AS localidad,
    NULLIF(COALESCE(r.raw ->> 'AreaGeo', r.raw -> 'raw' ->> 'AreaGeo', r.raw ->> 'Cvegeo', r.raw -> 'raw' ->> 'Cvegeo', r.raw ->> 'cvegeo', r.raw ->> 'CVEGEO'), '') AS cvegeo,
    NULLIF(COALESCE(r.raw ->> 'Tipo_Asentamiento', r.raw -> 'raw' ->> 'Tipo_Asentamiento', r.raw ->> 'Asentamiento'), '') AS asentamiento,
    NULLIF(COALESCE(r.raw ->> 'Entre_calles', r.raw -> 'raw' ->> 'Entre_calles', r.raw ->> 'EntreCalles'), '') AS entre_calles,
    NULLIF(COALESCE(r.raw ->> 'Referencia', r.raw -> 'raw' ->> 'Referencia'), '') AS referencia
  FROM public.resultados r
  JOIN batch b ON b.id = r.id
),
updated AS (
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
    , columnarized_at = COALESCE(r.columnarized_at, now())
  FROM src
  WHERE r.id = src.id
  RETURNING 1
)
SELECT count(*) FROM updated;
SQL
  )"

  count="${updated//$'\n'/}"
  [[ -z "$count" ]] && count=0
  denue_done=$((denue_done + count))
  remaining="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
  FROM public.resultados r
  WHERE r.fuente = 'denue'::public.fuente_resultado
    AND r.columnarized_at IS NULL;
SQL
  )"
  echo "DENUE resultados batch updated: $count | acumulado: $denue_done | pendientes: $remaining"
  touched="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v started_at="$RUN_STARTED_AT" <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.resultados r
WHERE r.actualizado_en >= :'started_at'::timestamptz
  AND r.fuente = 'denue'::public.fuente_resultado;
SQL
  )"
  echo "DENUE resultados touched since start: $touched"
  [[ "$count" -eq 0 ]] && break
done

while true; do
  updated="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v batch_size="$BATCH_SIZE" <<'SQL'
SET statement_timeout = 0;
WITH batch AS (
  SELECT r.id
  FROM public.resultados r
  WHERE r.fuente = 'google_places'::public.fuente_resultado
    AND r.columnarized_at IS NULL
  ORDER BY r.creado_en ASC
  LIMIT :batch_size
),
src AS (
  SELECT
    r.id,
    NULLIF(COALESCE(r.raw ->> 'primaryType', r.raw -> 'raw' ->> 'primaryType'), '') AS google_primary_type,
    NULLIF(COALESCE(
      r.raw ->> 'primaryTypeDisplayName',
      r.raw -> 'raw' ->> 'primaryTypeDisplayName',
      r.raw -> 'raw' #>> '{primaryTypeDisplayName,text}'
    ), '') AS google_primary_type_display_name,
    CASE
      WHEN jsonb_typeof(COALESCE(r.raw -> 'types', r.raw -> 'raw' -> 'types')) = 'array' THEN (
        SELECT array_agg(value)
        FROM jsonb_array_elements_text(COALESCE(r.raw -> 'types', r.raw -> 'raw' -> 'types')) AS value
      )
      ELSE NULL
    END AS google_types
  FROM public.resultados r
  JOIN batch b ON b.id = r.id
),
updated AS (
  UPDATE public.resultados r
  SET
    address_full = COALESCE(r.address_full, NULLIF(r.address, ''), NULLIF(r.raw ->> 'formattedAddress', ''), NULLIF(r.raw -> 'raw' ->> 'formattedAddress', '')),
    google_primary_type = COALESCE(r.google_primary_type, src.google_primary_type),
    google_primary_type_display_name = COALESCE(r.google_primary_type_display_name, src.google_primary_type_display_name),
    google_types = COALESCE(r.google_types, src.google_types),
    columnarized_at = COALESCE(r.columnarized_at, now())
  FROM src
  WHERE r.id = src.id
  RETURNING 1
)
SELECT count(*) FROM updated;
SQL
  )"

  count="${updated//$'\n'/}"
  [[ -z "$count" ]] && count=0
  google_done=$((google_done + count))
  remaining="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
  FROM public.resultados r
  WHERE r.fuente = 'google_places'::public.fuente_resultado
    AND r.columnarized_at IS NULL;
SQL
  )"
  echo "Google resultados batch updated: $count | acumulado: $google_done | pendientes: $remaining"
  touched="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v started_at="$RUN_STARTED_AT" <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.resultados r
WHERE r.actualizado_en >= :'started_at'::timestamptz
  AND r.fuente = 'google_places'::public.fuente_resultado;
SQL
  )"
  echo "Google resultados touched since start: $touched"
  [[ "$count" -eq 0 ]] && break
done

while true; do
  updated="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v batch_size="$BATCH_SIZE" <<'SQL'
SET statement_timeout = 0;
WITH batch AS (
  SELECT p.id
  FROM public.prospeccion_prospectos p
  WHERE p.columnarized_at IS NULL
  ORDER BY p.creado_en ASC
  LIMIT :batch_size
),
updated AS (
  UPDATE public.prospeccion_prospectos p
  SET
    nombre_comercial = COALESCE(p.nombre_comercial, NULLIF(p.display_name, ''), NULLIF(p.name, '')),
    address_full = COALESCE(p.address_full, r.address_full, NULLIF(p.address, ''), r.address),
    tipo_vialidad = COALESCE(p.tipo_vialidad, r.tipo_vialidad),
    nombre_vialidad = COALESCE(p.nombre_vialidad, r.nombre_vialidad),
    numero_exterior = COALESCE(p.numero_exterior, r.numero_exterior),
    colonia = COALESCE(p.colonia, r.colonia),
    codigo_postal = COALESCE(p.codigo_postal, r.codigo_postal),
    estado_cve = COALESCE(p.estado_cve, r.estado_cve),
    estado_nombre = COALESCE(p.estado_nombre, r.estado_nombre),
    municipio_cve = COALESCE(p.municipio_cve, r.municipio_cve),
    municipio_nombre = COALESCE(p.municipio_nombre, r.municipio_nombre),
    localidad = COALESCE(p.localidad, r.localidad),
    cvegeo = COALESCE(p.cvegeo, r.cvegeo),
    google_primary_type = COALESCE(p.google_primary_type, r.google_primary_type),
    google_primary_type_display_name = COALESCE(p.google_primary_type_display_name, r.google_primary_type_display_name),
    google_types = COALESCE(p.google_types, r.google_types),
    busqueda_ref = COALESCE(
      p.busqueda_ref,
      NULLIF(BTRIM(COALESCE(
        p.busqueda_id::text,
        p.metadata ->> 'busqueda_id',
        p.metadata ->> 'busqueda_query',
        p.metadata ->> 'query',
        p.metadata -> 'busqueda_meta' ->> 'query'
      )), '')
    ),
    query_sort = COALESCE(
      p.query_sort,
      NULLIF(BTRIM(COALESCE(
        p.metadata ->> 'query',
        p.metadata ->> 'busqueda_query',
        p.metadata -> 'busqueda_meta' ->> 'query',
        p.metadata ->> 'busqueda_id',
        p.busqueda_id::text
      )), '')
    ),
    columnarized_at = COALESCE(p.columnarized_at, now())
  FROM public.resultados r
  WHERE p.resultado_id = r.id
    AND p.id IN (SELECT id FROM batch)
  RETURNING 1
)
SELECT count(*) FROM updated;
SQL
  )"

  count="${updated//$'\n'/}"
  [[ -z "$count" ]] && count=0
  prospectos_done=$((prospectos_done + count))
  remaining="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE
  p.columnarized_at IS NULL;
SQL
  )"
  echo "Prospectos batch updated: $count | acumulado: $prospectos_done | pendientes: $remaining"
  touched="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v started_at="$RUN_STARTED_AT" <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.actualizado_en >= :'started_at'::timestamptz;
SQL
  )"
  echo "Prospectos touched since start: $touched"
  [[ "$count" -eq 0 ]] && break
done

while true; do
  updated="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v batch_size="$BATCH_SIZE" <<'SQL'
SET statement_timeout = 0;
WITH batch AS (
  SELECT p.id
  FROM public.prospeccion_prospectos p
  WHERE p.fuente = 'denue'::public.fuente_resultado
    AND (
      p.address_full IS NULL
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
    )
  ORDER BY p.creado_en ASC
  LIMIT :batch_size
),
updated AS (
  UPDATE public.prospeccion_prospectos p
  SET
    address = COALESCE(p.address, r.address),
    address_full = COALESCE(p.address_full, r.address_full, r.address),
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
  WHERE p.resultado_id = r.id
    AND p.id IN (SELECT id FROM batch)
  RETURNING 1
)
SELECT count(*) FROM updated;
SQL
  )"

  count="${updated//$'\n'/}"
  [[ -z "$count" ]] && count=0
  prospectos_done=$((prospectos_done + count))
  remaining="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.fuente = 'denue'::public.fuente_resultado
  AND (
    p.address_full IS NULL
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
SQL
  )"
  echo "Prospectos DENUE address reconcile batch updated: $count | acumulado: $prospectos_done | pendientes: $remaining"
  touched="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v started_at="$RUN_STARTED_AT" <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.actualizado_en >= :'started_at'::timestamptz
  AND p.fuente = 'denue'::public.fuente_resultado;
SQL
  )"
  echo "Prospectos DENUE touched since start: $touched"
  [[ "$count" -eq 0 ]] && break
done

while true; do
  updated="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v batch_size="$BATCH_SIZE" <<'SQL'
SET statement_timeout = 0;
WITH batch AS (
  SELECT p.id
  FROM public.prospeccion_prospectos p
  WHERE p.fuente = 'denue'::public.fuente_resultado
    AND p.resultado_id IS NULL
    AND p.external_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.resultados r
      WHERE r.fuente = 'denue'::public.fuente_resultado
        AND r.external_id = p.external_id
    )
    AND (
      p.address_full IS NULL
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
    )
  ORDER BY p.creado_en ASC
  LIMIT :batch_size
),
src AS (
  SELECT
    p.id,
    p.address AS current_address,
    p.address_full AS current_address_full,
    p.tipo_vialidad AS current_tipo_vialidad,
    p.nombre_vialidad AS current_nombre_vialidad,
    p.numero_exterior AS current_numero_exterior,
    p.numero_interior AS current_numero_interior,
    p.colonia AS current_colonia,
    p.codigo_postal AS current_codigo_postal,
    p.estado_cve AS current_estado_cve,
    p.estado_nombre AS current_estado_nombre,
    p.municipio_cve AS current_municipio_cve,
    p.municipio_nombre AS current_municipio_nombre,
    p.localidad_cve AS current_localidad_cve,
    p.localidad AS current_localidad,
    p.cvegeo AS current_cvegeo,
    p.asentamiento AS current_asentamiento,
    p.entre_calles AS current_entre_calles,
    p.referencia AS current_referencia,
    r.id AS resultado_id,
    r.address AS address,
    r.address_full AS address_full,
    r.tipo_vialidad,
    r.nombre_vialidad,
    r.numero_exterior,
    r.numero_interior,
    r.colonia,
    r.codigo_postal,
    r.estado_cve,
    r.estado_nombre,
    r.municipio_cve,
    r.municipio_nombre,
    r.localidad_cve,
    r.localidad,
    r.cvegeo,
    r.asentamiento,
    r.entre_calles,
    r.referencia
  FROM public.prospeccion_prospectos p
  JOIN batch b ON b.id = p.id
  JOIN LATERAL (
    SELECT r.*
    FROM public.resultados r
    WHERE r.fuente = 'denue'::public.fuente_resultado
      AND r.external_id = p.external_id
    ORDER BY r.creado_en DESC, r.id DESC
    LIMIT 1
  ) r ON true
  WHERE
    (p.address IS NULL AND r.address IS NOT NULL)
    OR (p.address_full IS NULL AND r.address_full IS NOT NULL)
    OR (p.tipo_vialidad IS NULL AND r.tipo_vialidad IS NOT NULL)
    OR (p.nombre_vialidad IS NULL AND r.nombre_vialidad IS NOT NULL)
    OR (p.numero_exterior IS NULL AND r.numero_exterior IS NOT NULL)
    OR (p.numero_interior IS NULL AND r.numero_interior IS NOT NULL)
    OR (p.colonia IS NULL AND r.colonia IS NOT NULL)
    OR (p.codigo_postal IS NULL AND r.codigo_postal IS NOT NULL)
    OR (p.estado_cve IS NULL AND r.estado_cve IS NOT NULL)
    OR (p.estado_nombre IS NULL AND r.estado_nombre IS NOT NULL)
    OR (p.municipio_cve IS NULL AND r.municipio_cve IS NOT NULL)
    OR (p.municipio_nombre IS NULL AND r.municipio_nombre IS NOT NULL)
    OR (p.localidad_cve IS NULL AND r.localidad_cve IS NOT NULL)
    OR (p.localidad IS NULL AND r.localidad IS NOT NULL)
    OR (p.cvegeo IS NULL AND r.cvegeo IS NOT NULL)
    OR (p.asentamiento IS NULL AND r.asentamiento IS NOT NULL)
    OR (p.entre_calles IS NULL AND r.entre_calles IS NOT NULL)
    OR (p.referencia IS NULL AND r.referencia IS NOT NULL)
),
updated AS (
  UPDATE public.prospeccion_prospectos p
  SET
    resultado_id = COALESCE(p.resultado_id, src.resultado_id),
    address = COALESCE(p.address, src.address, p.address_full, src.address_full),
    address_full = COALESCE(p.address_full, src.address_full, NULLIF(p.address, ''), src.address),
    tipo_vialidad = COALESCE(p.tipo_vialidad, src.tipo_vialidad),
    nombre_vialidad = COALESCE(p.nombre_vialidad, src.nombre_vialidad),
    numero_exterior = COALESCE(p.numero_exterior, src.numero_exterior),
    numero_interior = COALESCE(p.numero_interior, src.numero_interior),
    colonia = COALESCE(p.colonia, src.colonia),
    codigo_postal = COALESCE(p.codigo_postal, src.codigo_postal),
    estado_cve = COALESCE(p.estado_cve, src.estado_cve),
    estado_nombre = COALESCE(p.estado_nombre, src.estado_nombre),
    municipio_cve = COALESCE(p.municipio_cve, src.municipio_cve),
    municipio_nombre = COALESCE(p.municipio_nombre, src.municipio_nombre),
    localidad_cve = COALESCE(p.localidad_cve, src.localidad_cve),
    localidad = COALESCE(p.localidad, src.localidad),
    cvegeo = COALESCE(p.cvegeo, src.cvegeo),
    asentamiento = COALESCE(p.asentamiento, src.asentamiento),
    entre_calles = COALESCE(p.entre_calles, src.entre_calles),
    referencia = COALESCE(p.referencia, src.referencia)
  FROM src
  WHERE p.id = src.id
  RETURNING 1
)
SELECT count(*) FROM updated;
SQL
  )"

  count="${updated//$'\n'/}"
  [[ -z "$count" ]] && count=0
  prospectos_done=$((prospectos_done + count))
  remaining="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.fuente = 'denue'::public.fuente_resultado
  AND p.resultado_id IS NULL
  AND p.external_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.resultados r
    WHERE r.fuente = 'denue'::public.fuente_resultado
      AND r.external_id = p.external_id
  )
  AND (
    p.address_full IS NULL
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
SQL
  )"
  echo "Prospectos DENUE external_id reconcile batch updated: $count | acumulado: $prospectos_done | pendientes: $remaining"
  touched="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v started_at="$RUN_STARTED_AT" <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.actualizado_en >= :'started_at'::timestamptz
  AND p.fuente = 'denue'::public.fuente_resultado;
SQL
  )"
  echo "Prospectos DENUE external_id touched since start: $touched"
  [[ "$count" -eq 0 ]] && break
done

while true; do
  updated="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v batch_size="$BATCH_SIZE" <<'SQL'
SET statement_timeout = 0;
WITH batch AS (
  SELECT p.id
  FROM public.prospeccion_prospectos p
  WHERE p.fuente = 'denue'::public.fuente_resultado
    AND p.resultado_id IS NULL
    AND p.external_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.resultados r
      WHERE r.fuente = 'denue'::public.fuente_resultado
        AND r.external_id = p.external_id
    )
  ORDER BY p.creado_en ASC
  LIMIT :batch_size
),
parsed AS (
  SELECT
    p.id,
    p.tipo_vialidad AS current_tipo_vialidad,
    p.nombre_vialidad AS current_nombre_vialidad,
    p.numero_exterior AS current_numero_exterior,
    p.numero_interior AS current_numero_interior,
    p.colonia AS current_colonia,
    p.codigo_postal AS current_codigo_postal,
    btrim(split_part(p.address_full, ',', 1)) AS first_part,
    NULLIF(btrim(split_part(p.address_full, ',', 2)), '') AS second_part,
    NULLIF(btrim(split_part(p.address_full, ',', 3)), '') AS third_part,
    NULLIF(btrim(split_part(p.address_full, ',', array_length(string_to_array(p.address_full, ','), 1))), '') AS last_part
  FROM public.prospeccion_prospectos p
  JOIN batch b ON b.id = p.id
),
src AS (
  SELECT
    id,
    NULLIF(regexp_replace(first_part, '\s.*$', '', ''), '') AS tipo_vialidad,
    NULLIF(btrim(regexp_replace(first_part, '^\S+\s*', '')), '') AS nombre_vialidad,
    NULLIF(split_part(coalesce(second_part, ''), ' ', 1), '') AS numero_exterior,
    NULLIF(btrim(regexp_replace(coalesce(second_part, ''), '^\S+\s*', '')), '') AS numero_interior,
    third_part AS colonia,
    CASE WHEN last_part ~ '^\d{5}$' THEN last_part END AS codigo_postal
  FROM parsed
  WHERE
    (current_tipo_vialidad IS NULL AND NULLIF(regexp_replace(first_part, '\s.*$', '', ''), '') IS NOT NULL)
    OR (current_nombre_vialidad IS NULL AND NULLIF(btrim(regexp_replace(first_part, '^\S+\s*', '')), '') IS NOT NULL)
    OR (current_numero_exterior IS NULL AND NULLIF(split_part(coalesce(second_part, ''), ' ', 1), '') IS NOT NULL)
    OR (current_numero_interior IS NULL AND NULLIF(btrim(regexp_replace(coalesce(second_part, ''), '^\S+\s*', '')), '') IS NOT NULL)
    OR (current_colonia IS NULL AND third_part IS NOT NULL)
    OR (current_codigo_postal IS NULL AND CASE WHEN last_part ~ '^\d{5}$' THEN last_part END IS NOT NULL)
),
updated AS (
  UPDATE public.prospeccion_prospectos p
  SET
    address = COALESCE(p.address, p.address_full),
    tipo_vialidad = COALESCE(p.tipo_vialidad, src.tipo_vialidad),
    nombre_vialidad = COALESCE(p.nombre_vialidad, src.nombre_vialidad),
    numero_exterior = COALESCE(p.numero_exterior, src.numero_exterior),
    numero_interior = COALESCE(p.numero_interior, src.numero_interior),
    colonia = COALESCE(p.colonia, src.colonia),
    codigo_postal = COALESCE(p.codigo_postal, src.codigo_postal)
  FROM src
  WHERE p.id = src.id
  RETURNING 1
)
SELECT count(*) FROM updated;
SQL
  )"

  count="${updated//$'\n'/}"
  [[ -z "$count" ]] && count=0
  prospectos_done=$((prospectos_done + count))
  remaining="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.fuente = 'denue'::public.fuente_resultado
  AND p.resultado_id IS NULL
  AND p.external_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.resultados r
    WHERE r.fuente = 'denue'::public.fuente_resultado
      AND r.external_id = p.external_id
  )
  AND (
    p.tipo_vialidad IS NULL
    OR p.nombre_vialidad IS NULL
    OR p.numero_exterior IS NULL
    OR p.numero_interior IS NULL
    OR p.colonia IS NULL
    OR p.codigo_postal IS NULL
  );
SQL
  )"
  echo "Prospectos DENUE address parse batch updated: $count | acumulado: $prospectos_done | pendientes: $remaining"
  touched="$(
    psql "$DATABASE_URL" -qAtv ON_ERROR_STOP=1 -v started_at="$RUN_STARTED_AT" <<'SQL'
SET statement_timeout = 0;
SELECT count(*)
FROM public.prospeccion_prospectos p
WHERE p.actualizado_en >= :'started_at'::timestamptz
  AND p.fuente = 'denue'::public.fuente_resultado;
SQL
  )"
  echo "Prospectos DENUE parse touched since start: $touched"
  [[ "$count" -eq 0 ]] && break
done

echo "Backfill terminado. Totales -> denue: $denue_done, google: $google_done, prospectos: $prospectos_done"
