-- Preparacion durable de campanas Postmark.
-- La tabla conserva el snapshot de cada destinatario antes de renderizarlo
-- en prospeccion_contacto_envio. El payload/detalle son contenido variable del
-- mensaje; la identidad, orden, canal y estado permanecen en columnas.

ALTER TABLE public.prospeccion_contacto_batch
    ADD COLUMN IF NOT EXISTS preparacion_estado text NOT NULL DEFAULT 'no_requerida',
    ADD COLUMN IF NOT EXISTS preparacion_total integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS preparacion_preparados integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS preparacion_fallidos integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS preparacion_iniciada_en timestamptz,
    ADD COLUMN IF NOT EXISTS preparacion_finalizada_en timestamptz,
    ADD COLUMN IF NOT EXISTS preparacion_error text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_batch_preparacion_estado_check'
          AND conrelid = 'public.prospeccion_contacto_batch'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_batch
            ADD CONSTRAINT prospeccion_contacto_batch_preparacion_estado_check
            CHECK (preparacion_estado IN ('no_requerida', 'pendiente', 'procesando', 'completada', 'fallida'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_batch_preparacion_counts_check'
          AND conrelid = 'public.prospeccion_contacto_batch'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_batch
            ADD CONSTRAINT prospeccion_contacto_batch_preparacion_counts_check
            CHECK (preparacion_total >= 0 AND preparacion_preparados >= 0 AND preparacion_fallidos >= 0);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.prospeccion_postmark_campaign_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    batch_id uuid NOT NULL REFERENCES public.prospeccion_contacto_batch(id) ON DELETE CASCADE,
    prospecto_id uuid NOT NULL REFERENCES public.prospeccion_prospectos(id) ON DELETE CASCADE,
    canal text NOT NULL,
    ordinal integer NOT NULL,
    numero_lote integer NOT NULL DEFAULT 1,
    lote_programado_en timestamptz,
    programado_en timestamptz NOT NULL DEFAULT now(),
    plantilla_id uuid,
    version_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pendiente',
    intento_actual integer NOT NULL DEFAULT 0,
    max_reintentos integer NOT NULL DEFAULT 3,
    claimed_at timestamptz,
    prepared_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_postmark_targets_canal_check
        CHECK (canal = 'correo'),
    CONSTRAINT prospeccion_postmark_targets_ordinal_check
        CHECK (ordinal >= 0),
    CONSTRAINT prospeccion_postmark_targets_lote_check
        CHECK (numero_lote >= 1),
    CONSTRAINT prospeccion_postmark_targets_status_check
        CHECK (status IN ('pendiente', 'procesando', 'preparado', 'fallido', 'cancelado')),
    CONSTRAINT prospeccion_postmark_targets_unique
        UNIQUE (batch_id, prospecto_id, canal)
);

CREATE INDEX IF NOT EXISTS prospeccion_postmark_targets_ready_idx
    ON public.prospeccion_postmark_campaign_targets
       (organizacion_id, status, programado_en, ordinal, id)
    WHERE status IN ('pendiente', 'procesando');

CREATE INDEX IF NOT EXISTS prospeccion_postmark_targets_batch_idx
    ON public.prospeccion_postmark_campaign_targets
       (organizacion_id, batch_id, status, ordinal, id);

ALTER TABLE public.prospeccion_postmark_campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_postmark_campaign_targets FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.prospeccion_postmark_campaign_targets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_claim_postmark_campaign_targets(
    p_organizacion_id uuid,
    p_batch_id uuid,
    p_limit integer DEFAULT 500,
    p_stale_after_seconds integer DEFAULT 900
)
RETURNS SETOF public.prospeccion_postmark_campaign_targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
BEGIN
    IF p_organizacion_id IS NULL OR p_batch_id IS NULL THEN
        RAISE EXCEPTION 'postmark_campaign_targets_invalid_input' USING ERRCODE = '22023';
    END IF;
    IF p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
        RAISE EXCEPTION 'postmark_campaign_targets_invalid_stale_window' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT t.id
        FROM public.prospeccion_postmark_campaign_targets AS t
        WHERE t.organizacion_id = p_organizacion_id
          AND t.batch_id = p_batch_id
          AND (
              (t.status = 'pendiente' AND t.programado_en <= now())
              OR (
                  t.status = 'procesando'
                  AND t.claimed_at < now() - make_interval(secs => p_stale_after_seconds)
              )
          )
        ORDER BY t.ordinal, t.id
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.prospeccion_postmark_campaign_targets AS t
    SET status = 'procesando',
        intento_actual = t.intento_actual + 1,
        claimed_at = now(),
        updated_at = now()
    FROM candidates AS c
    WHERE t.id = c.id
    RETURNING t.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_claim_postmark_campaign_targets(uuid, uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_claim_postmark_campaign_targets(uuid, uuid, integer, integer)
    TO service_role;

CREATE OR REPLACE FUNCTION public.tenant_finish_postmark_campaign_targets(
    p_organizacion_id uuid,
    p_batch_id uuid,
    p_target_ids uuid[],
    p_success boolean,
    p_error text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_count integer;
BEGIN
    IF p_organizacion_id IS NULL OR p_batch_id IS NULL OR p_target_ids IS NULL
       OR cardinality(p_target_ids) = 0 THEN
        RAISE EXCEPTION 'postmark_campaign_targets_finish_invalid_input' USING ERRCODE = '22023';
    END IF;

    UPDATE public.prospeccion_postmark_campaign_targets AS t
    SET status = CASE WHEN p_success THEN 'preparado' ELSE 'fallido' END,
        prepared_at = CASE WHEN p_success THEN now() ELSE prepared_at END,
        last_error = CASE WHEN p_success THEN NULL ELSE left(p_error, 2000) END,
        updated_at = now()
    WHERE t.organizacion_id = p_organizacion_id
      AND t.batch_id = p_batch_id
      AND t.id = ANY(p_target_ids)
      AND t.status = 'procesando';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_finish_postmark_campaign_targets(uuid, uuid, uuid[], boolean, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_finish_postmark_campaign_targets(uuid, uuid, uuid[], boolean, text)
    TO service_role;

CREATE OR REPLACE FUNCTION public.tenant_sync_postmark_campaign_preparation(
    p_organizacion_id uuid,
    p_batch_id uuid
)
RETURNS TABLE (
    total integer,
    preparados integer,
    fallidos integer,
    pendientes integer,
    estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_total integer;
    v_preparados integer;
    v_fallidos integer;
    v_pendientes integer;
    v_estado text;
BEGIN
    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE status = 'preparado')::integer,
        count(*) FILTER (WHERE status = 'fallido')::integer,
        count(*) FILTER (WHERE status IN ('pendiente', 'procesando'))::integer
    INTO v_total, v_preparados, v_fallidos, v_pendientes
    FROM public.prospeccion_postmark_campaign_targets
    WHERE organizacion_id = p_organizacion_id
      AND batch_id = p_batch_id;

    v_estado := CASE
        WHEN v_pendientes > 0 THEN 'procesando'
        WHEN v_fallidos > 0 AND v_preparados = 0 THEN 'fallida'
        ELSE 'completada'
    END;

    UPDATE public.prospeccion_contacto_batch
    SET preparacion_estado = v_estado,
        preparacion_total = v_total,
        preparacion_preparados = v_preparados,
        preparacion_fallidos = v_fallidos,
        preparacion_iniciada_en = COALESCE(preparacion_iniciada_en, now()),
        preparacion_finalizada_en = CASE WHEN v_pendientes = 0 THEN now() ELSE preparacion_finalizada_en END,
        preparacion_error = CASE WHEN v_fallidos > 0 THEN 'postmark_target_preparation_failed' ELSE NULL END,
        estado = CASE WHEN v_pendientes > 0 THEN 'en_proceso' ELSE estado END
    WHERE id = p_batch_id
      AND organizacion_id = p_organizacion_id;

    RETURN QUERY SELECT v_total, v_preparados, v_fallidos, v_pendientes, v_estado;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_sync_postmark_campaign_preparation(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_sync_postmark_campaign_preparation(uuid, uuid)
    TO service_role;

COMMENT ON TABLE public.prospeccion_postmark_campaign_targets IS
    'Manifiesto durable de destinatarios Postmark antes de crear envios y bloques /email/batch de hasta 500.';
