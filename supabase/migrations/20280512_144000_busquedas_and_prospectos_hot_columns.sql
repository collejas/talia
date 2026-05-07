BEGIN;

ALTER TABLE public.busquedas
    ADD COLUMN IF NOT EXISTS status text,
    ADD COLUMN IF NOT EXISTS modo text,
    ADD COLUMN IF NOT EXISTS source text,
    ADD COLUMN IF NOT EXISTS recovered_at timestamptz,
    ADD COLUMN IF NOT EXISTS denue_job_id uuid,
    ADD COLUMN IF NOT EXISTS denue_batch_size integer,
    ADD COLUMN IF NOT EXISTS advanced_filters jsonb;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS buscador_job_id uuid,
    ADD COLUMN IF NOT EXISTS buscador_result_id uuid,
    ADD COLUMN IF NOT EXISTS buscador_url text;

CREATE OR REPLACE FUNCTION public.tg_touch_busquedas_hot_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE
    v_meta jsonb := COALESCE(NEW.meta, NEW.metadata, '{}'::jsonb);
    v_clean_meta jsonb;
    v_old_status text := NULL;
    v_old_modo text := NULL;
    v_old_source text := NULL;
    v_old_recovered_at timestamptz := NULL;
    v_old_denue_job_id uuid := NULL;
    v_old_denue_batch_size integer := NULL;
    v_old_advanced_filters jsonb := NULL;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old_status := OLD.status;
        v_old_modo := OLD.modo;
        v_old_source := OLD.source;
        v_old_recovered_at := OLD.recovered_at;
        v_old_denue_job_id := OLD.denue_job_id;
        v_old_denue_batch_size := OLD.denue_batch_size;
        v_old_advanced_filters := OLD.advanced_filters;
    END IF;

    NEW.status := COALESCE(NULLIF(v_meta ->> 'status', ''), NEW.status, v_old_status);
    NEW.modo := COALESCE(NULLIF(v_meta ->> 'modo', ''), NEW.modo, v_old_modo);
    NEW.source := COALESCE(NULLIF(v_meta ->> 'source', ''), NEW.source, v_old_source, NEW.fuente::text);
    NEW.recovered_at := COALESCE(
        NULLIF(v_meta ->> 'recovered_at', '')::timestamptz,
        NEW.recovered_at,
        v_old_recovered_at
    );
    NEW.denue_job_id := COALESCE(
        NULLIF(v_meta ->> 'denue_job_id', '')::uuid,
        NEW.denue_job_id,
        v_old_denue_job_id
    );
    NEW.denue_batch_size := COALESCE(
        NULLIF(v_meta ->> 'denue_batch_size', '')::integer,
        NEW.denue_batch_size,
        v_old_denue_batch_size
    );
    NEW.advanced_filters := COALESCE(
        v_meta -> 'advanced_filters',
        NEW.advanced_filters,
        v_old_advanced_filters
    );
    v_clean_meta := v_meta - ARRAY[
        'query',
        'total_encontrados',
        'status',
        'modo',
        'source',
        'recovered_at',
        'denue_job_id',
        'denue_batch_size',
        'advanced_filters'
    ]::text[];
    NEW.meta := v_clean_meta;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_touch_prospeccion_prospectos_hot_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE
    v_metadata jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
    v_clean_metadata jsonb;
    v_old_buscador_job_id uuid := NULL;
    v_old_buscador_result_id uuid := NULL;
    v_old_buscador_url text := NULL;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old_buscador_job_id := OLD.buscador_job_id;
        v_old_buscador_result_id := OLD.buscador_result_id;
        v_old_buscador_url := OLD.buscador_url;
    END IF;

    NEW.buscador_job_id := COALESCE(
        NULLIF(v_metadata ->> 'buscador_job_id', '')::uuid,
        NEW.buscador_job_id,
        v_old_buscador_job_id
    );
    NEW.buscador_result_id := COALESCE(
        NULLIF(v_metadata ->> 'buscador_result_id', '')::uuid,
        NEW.buscador_result_id,
        v_old_buscador_result_id
    );
    NEW.buscador_url := COALESCE(NULLIF(v_metadata ->> 'buscador_url', ''), NEW.buscador_url, v_old_buscador_url);
    v_clean_metadata := v_metadata - ARRAY['buscador_job_id', 'buscador_result_id', 'buscador_url']::text[];
    NEW.metadata := v_clean_metadata;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS busquedas_touch_hot_columns ON public.busquedas;
CREATE TRIGGER busquedas_touch_hot_columns
BEFORE INSERT OR UPDATE ON public.busquedas
FOR EACH ROW
EXECUTE FUNCTION public.tg_touch_busquedas_hot_columns();

DROP TRIGGER IF EXISTS prospeccion_prospectos_touch_hot_columns ON public.prospeccion_prospectos;
CREATE TRIGGER prospeccion_prospectos_touch_hot_columns
BEFORE INSERT OR UPDATE ON public.prospeccion_prospectos
FOR EACH ROW
EXECUTE FUNCTION public.tg_touch_prospeccion_prospectos_hot_columns();

UPDATE public.busquedas b
SET
    status = COALESCE(b.status, NULLIF(COALESCE(b.meta, b.metadata, '{}'::jsonb) ->> 'status', '')),
    modo = COALESCE(b.modo, NULLIF(COALESCE(b.meta, b.metadata, '{}'::jsonb) ->> 'modo', '')),
    source = COALESCE(b.source, NULLIF(COALESCE(b.meta, b.metadata, '{}'::jsonb) ->> 'source', ''), b.fuente::text),
    recovered_at = COALESCE(
        b.recovered_at,
        NULLIF(COALESCE(b.meta, b.metadata, '{}'::jsonb) ->> 'recovered_at', '')::timestamptz
    ),
    denue_job_id = COALESCE(
        b.denue_job_id,
        NULLIF(COALESCE(b.meta, b.metadata, '{}'::jsonb) ->> 'denue_job_id', '')::uuid
    ),
    denue_batch_size = COALESCE(
        b.denue_batch_size,
        NULLIF(COALESCE(b.meta, b.metadata, '{}'::jsonb) ->> 'denue_batch_size', '')::integer
    ),
    advanced_filters = COALESCE(
        b.advanced_filters,
        COALESCE(b.meta, b.metadata, '{}'::jsonb) -> 'advanced_filters'
    ),
    meta = COALESCE(b.meta, b.metadata, '{}'::jsonb) - ARRAY[
        'query',
        'total_encontrados',
        'status',
        'modo',
        'source',
        'recovered_at',
        'denue_job_id',
        'denue_batch_size',
        'advanced_filters'
    ]::text[];

UPDATE public.prospeccion_prospectos p
SET
    buscador_job_id = COALESCE(
        p.buscador_job_id,
        NULLIF(COALESCE(p.metadata, '{}'::jsonb) ->> 'buscador_job_id', '')::uuid
    ),
    buscador_result_id = COALESCE(
        p.buscador_result_id,
        NULLIF(COALESCE(p.metadata, '{}'::jsonb) ->> 'buscador_result_id', '')::uuid
    ),
    buscador_url = COALESCE(
        p.buscador_url,
        NULLIF(COALESCE(p.metadata, '{}'::jsonb) ->> 'buscador_url', '')
    ),
    metadata = COALESCE(p.metadata, '{}'::jsonb) - ARRAY['buscador_job_id', 'buscador_result_id', 'buscador_url']::text[];

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_buscador_job_id_idx
    ON public.prospeccion_prospectos (buscador_job_id)
    WHERE buscador_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_buscador_result_id_idx
    ON public.prospeccion_prospectos (buscador_result_id)
    WHERE buscador_result_id IS NOT NULL;

COMMENT ON COLUMN public.busquedas.status IS 'Estado materializado de la búsqueda: queued, running, completed, failed, canceled.';
COMMENT ON COLUMN public.busquedas.modo IS 'Modo lógico de la búsqueda, por ejemplo radio o area_act.';
COMMENT ON COLUMN public.busquedas.source IS 'Origen lógico de la búsqueda, derivado del metadata o de la fuente.';
COMMENT ON COLUMN public.busquedas.recovered_at IS 'Marca de recuperación usada por jobs reanudados o recuperados.';
COMMENT ON COLUMN public.busquedas.denue_job_id IS 'Identificador del job DENUE asociado a la búsqueda.';
COMMENT ON COLUMN public.busquedas.denue_batch_size IS 'Tamaño de lote DENUE usado para la búsqueda.';
COMMENT ON COLUMN public.busquedas.advanced_filters IS 'Filtros avanzados estructurados de la búsqueda.';

COMMENT ON COLUMN public.prospeccion_prospectos.buscador_job_id IS 'Job del buscador que originó el prospecto.';
COMMENT ON COLUMN public.prospeccion_prospectos.buscador_result_id IS 'Resultado del buscador relacionado con el prospecto.';
COMMENT ON COLUMN public.prospeccion_prospectos.buscador_url IS 'URL fuente detectada por el buscador.';

COMMIT;
