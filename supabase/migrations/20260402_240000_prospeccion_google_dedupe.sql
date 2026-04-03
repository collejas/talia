-- Deduplicate Google Places prospectos by external_id (place id)

SET statement_timeout TO '15min';

-- Ensure external_id column exists
ALTER TABLE public.prospeccion_prospectos
  ADD COLUMN IF NOT EXISTS external_id text;

-- Backfill external_id for Google prospectos from resultados
UPDATE public.prospeccion_prospectos AS p
SET external_id = r.external_id
FROM public.resultados AS r
WHERE p.external_id IS NULL
  AND p.fuente = 'google_places'
  AND p.resultado_id = r.id
  AND r.external_id IS NOT NULL;

-- Build duplicate mapping table (Google only)
CREATE TEMP TABLE google_dupes ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    organizacion_id,
    external_id,
    row_number() OVER (
      PARTITION BY organizacion_id, external_id
      ORDER BY creado_en ASC, id ASC
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY organizacion_id, external_id
      ORDER BY creado_en ASC, id ASC
    ) AS canonical_id
  FROM public.prospeccion_prospectos
  WHERE fuente = 'google_places'
    AND external_id IS NOT NULL
)
SELECT id AS dup_id, organizacion_id, canonical_id
FROM ranked
WHERE rn > 1;

-- Repoint envio records to canonical prospecto, avoiding conflicts
DO $$
DECLARE
  batch_size int := 1000;
  batch_count int;
BEGIN
  LOOP
    CREATE TEMP TABLE google_dupes_batch ON COMMIT DROP AS
    SELECT * FROM google_dupes LIMIT batch_size;

    SELECT count(*) INTO batch_count FROM google_dupes_batch;
    IF batch_count = 0 THEN
      DROP TABLE google_dupes_batch;
      EXIT;
    END IF;

    -- Conflicts where canonical already has the envio record
    WITH conflicts AS (
      SELECT
        e.id AS loser_id,
        e.organizacion_id,
        e.batch_id,
        e.canal,
        d.canonical_id,
        e2.id AS winner_id
      FROM public.prospeccion_contacto_envio e
      JOIN google_dupes_batch d
        ON e.organizacion_id = d.organizacion_id
       AND e.prospecto_id = d.dup_id
      JOIN public.prospeccion_contacto_envio e2
        ON e2.organizacion_id = d.organizacion_id
       AND e2.batch_id = e.batch_id
       AND e2.canal = e.canal
       AND e2.prospecto_id = d.canonical_id
    )
    UPDATE public.prospeccion_contactos_log l
    SET envio_id = c.winner_id
    FROM conflicts c
    WHERE l.organizacion_id = c.organizacion_id
      AND l.envio_id = c.loser_id;

    WITH conflicts AS (
      SELECT
        e.id AS loser_id,
        e.organizacion_id,
        e.batch_id,
        e.canal,
        d.canonical_id,
        e2.id AS winner_id
      FROM public.prospeccion_contacto_envio e
      JOIN google_dupes_batch d
        ON e.organizacion_id = d.organizacion_id
       AND e.prospecto_id = d.dup_id
      JOIN public.prospeccion_contacto_envio e2
        ON e2.organizacion_id = d.organizacion_id
       AND e2.batch_id = e.batch_id
       AND e2.canal = e.canal
       AND e2.prospecto_id = d.canonical_id
    )
    DELETE FROM public.prospeccion_contacto_envio e
    USING conflicts c
    WHERE e.id = c.loser_id;

    -- Internal conflicts within this batch (same batch/canal -> same canonical)
    WITH internal_conflicts AS (
      SELECT
        e.id AS loser_id,
        e.organizacion_id,
        e.batch_id,
        e.canal,
        d.canonical_id,
        e2.id AS winner_id
      FROM public.prospeccion_contacto_envio e
      JOIN google_dupes_batch d
        ON e.organizacion_id = d.organizacion_id
       AND e.prospecto_id = d.dup_id
      JOIN public.prospeccion_contacto_envio e2
        ON e2.organizacion_id = d.organizacion_id
       AND e2.batch_id = e.batch_id
       AND e2.canal = e.canal
      JOIN google_dupes_batch d2
        ON e2.organizacion_id = d2.organizacion_id
       AND e2.prospecto_id = d2.dup_id
      WHERE d2.canonical_id = d.canonical_id
        AND e2.id < e.id
    )
    UPDATE public.prospeccion_contactos_log l
    SET envio_id = c.winner_id
    FROM internal_conflicts c
    WHERE l.organizacion_id = c.organizacion_id
      AND l.envio_id = c.loser_id;

    WITH internal_conflicts AS (
      SELECT
        e.id AS loser_id,
        e.organizacion_id,
        e.batch_id,
        e.canal,
        d.canonical_id,
        e2.id AS winner_id
      FROM public.prospeccion_contacto_envio e
      JOIN google_dupes_batch d
        ON e.organizacion_id = d.organizacion_id
       AND e.prospecto_id = d.dup_id
      JOIN public.prospeccion_contacto_envio e2
        ON e2.organizacion_id = d.organizacion_id
       AND e2.batch_id = e.batch_id
       AND e2.canal = e.canal
      JOIN google_dupes_batch d2
        ON e2.organizacion_id = d2.organizacion_id
       AND e2.prospecto_id = d2.dup_id
      WHERE d2.canonical_id = d.canonical_id
        AND e2.id < e.id
    )
    DELETE FROM public.prospeccion_contacto_envio e
    USING internal_conflicts c
    WHERE e.id = c.loser_id;

    -- Move remaining envio rows to canonical prospecto
    UPDATE public.prospeccion_contacto_envio e
    SET prospecto_id = d.canonical_id
    FROM google_dupes_batch d
    WHERE e.organizacion_id = d.organizacion_id
      AND e.prospecto_id = d.dup_id;

    -- Update suppressions and logs (no unique constraints to conflict)
    UPDATE public.prospeccion_contacto_suppressions s
    SET prospecto_id = d.canonical_id
    FROM google_dupes_batch d
    WHERE s.organizacion_id = d.organizacion_id
      AND s.prospecto_id = d.dup_id;

    UPDATE public.prospeccion_contactos_log l
    SET prospecto_id = d.canonical_id
    FROM google_dupes_batch d
    WHERE l.organizacion_id = d.organizacion_id
      AND l.prospecto_id = d.dup_id;

    -- Remove processed dupes from temp
    DELETE FROM google_dupes d
    USING google_dupes_batch b
    WHERE d.dup_id = b.dup_id;

    DROP TABLE google_dupes_batch;
  END LOOP;
END $$;

-- Delete duplicated prospectos (Google only), after references have been repointed
ALTER TABLE public.prospeccion_prospectos DISABLE TRIGGER t_prospeccion_prospectos_audit;

DELETE FROM public.prospeccion_prospectos p
USING google_dupes d
WHERE p.organizacion_id = d.organizacion_id
  AND p.id = d.dup_id;

-- Final cleanup: remove any remaining duplicates by external_id (Google only)
DO $$
DECLARE
  batch_size int := 1000;
  batch_count int;
BEGIN
  LOOP
    WITH ranked AS (
      SELECT
        id,
        organizacion_id,
        external_id,
        row_number() OVER (
          PARTITION BY organizacion_id, external_id
          ORDER BY creado_en ASC, id ASC
        ) AS rn
      FROM public.prospeccion_prospectos
      WHERE fuente = 'google_places' AND external_id IS NOT NULL
    ),
    dupes AS (
      SELECT id
      FROM ranked
      WHERE rn > 1
      LIMIT batch_size
    )
    DELETE FROM public.prospeccion_prospectos p
    USING dupes d
    WHERE p.id = d.id;

    GET DIAGNOSTICS batch_count = ROW_COUNT;
    EXIT WHEN batch_count = 0;
  END LOOP;
END $$;

ALTER TABLE public.prospeccion_prospectos ENABLE TRIGGER t_prospeccion_prospectos_audit;

-- Unique key for Google deduplication (external_id scoped per org)
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_prospectos_google_external_id_key
  ON public.prospeccion_prospectos (organizacion_id, external_id)
  WHERE fuente = 'google_places' AND external_id IS NOT NULL;
