BEGIN;

WITH targets AS (
  SELECT
    c.id,
    c.organizacion_id,
    CASE
      WHEN lower(btrim(COALESCE(c.tipo, ''))) IN ('persona_fisica_actividad_empresarial', 'pfae') THEN 'PFAE-'
      ELSE 'Emp-'
    END AS prefix,
    row_number() OVER (
      PARTITION BY
        c.organizacion_id,
        CASE
          WHEN lower(btrim(COALESCE(c.tipo, ''))) IN ('persona_fisica_actividad_empresarial', 'pfae') THEN 'PFAE-'
          ELSE 'Emp-'
        END
      ORDER BY c.creado_en ASC NULLS LAST, c.id ASC
    ) AS rn
  FROM public.cuentas c
  WHERE c.codigo_cuenta IS NULL OR btrim(c.codigo_cuenta) = ''
),
bases AS (
  SELECT
    grouped.organizacion_id,
    grouped.prefix,
    COALESCE(MAX(grouped.code_n), 0) AS max_n
  FROM (
    SELECT
      c.organizacion_id,
      CASE
        WHEN c.codigo_cuenta ~ '^PFAE-[0-9]+$' THEN 'PFAE-'
        ELSE 'Emp-'
      END AS prefix,
      CASE
        WHEN c.codigo_cuenta ~ '^PFAE-[0-9]+$' THEN substring(c.codigo_cuenta FROM '^PFAE-([0-9]+)$')::bigint
        WHEN c.codigo_cuenta ~ '^Emp-[0-9]+$' THEN substring(c.codigo_cuenta FROM '^Emp-([0-9]+)$')::bigint
      END AS code_n
    FROM public.cuentas c
    WHERE c.codigo_cuenta IS NOT NULL
      AND btrim(c.codigo_cuenta) <> ''
  ) grouped
  GROUP BY grouped.organizacion_id, grouped.prefix
),
assigned AS (
  SELECT
    t.id,
    t.organizacion_id,
    t.prefix || (COALESCE(b.max_n, 0) + t.rn)::text AS new_code
  FROM targets t
  LEFT JOIN bases b
    ON b.organizacion_id = t.organizacion_id
   AND b.prefix = t.prefix
)
UPDATE public.cuentas c
SET codigo_cuenta = a.new_code
FROM assigned a
WHERE c.id = a.id
  AND (c.codigo_cuenta IS NULL OR btrim(c.codigo_cuenta) = '');

COMMIT;
