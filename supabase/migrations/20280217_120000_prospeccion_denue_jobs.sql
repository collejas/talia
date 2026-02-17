BEGIN;

-- Jobs para ejecutar búsquedas DENUE asíncronas (persistencia + estado/progreso).
CREATE TABLE IF NOT EXISTS public.prospeccion_denue_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    creado_por uuid DEFAULT auth.uid(),
    busqueda_id uuid NOT NULL REFERENCES public.busquedas(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    params jsonb NOT NULL DEFAULT '{}'::jsonb,
    progress jsonb NOT NULL DEFAULT '{}'::jsonb,
    stats jsonb,
    total integer,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    duration_ms integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_denue_jobs_org_busqueda_key
    ON public.prospeccion_denue_jobs (organizacion_id, busqueda_id);

CREATE INDEX IF NOT EXISTS prospeccion_denue_jobs_org_idx
    ON public.prospeccion_denue_jobs (organizacion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prospeccion_denue_jobs_status_idx
    ON public.prospeccion_denue_jobs (organizacion_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS prospeccion_denue_jobs_busqueda_idx
    ON public.prospeccion_denue_jobs (busqueda_id);

ALTER TABLE public.prospeccion_denue_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospeccion_denue_jobs_admin_all ON public.prospeccion_denue_jobs;
DROP POLICY IF EXISTS prospeccion_denue_jobs_member_org ON public.prospeccion_denue_jobs;

CREATE POLICY prospeccion_denue_jobs_admin_all
    ON public.prospeccion_denue_jobs
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_denue_jobs_member_org
    ON public.prospeccion_denue_jobs
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;

