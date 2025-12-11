BEGIN;

-- Constante para organización predeterminada (tenant global por defecto)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.organizaciones WHERE id = '00000000-0000-0000-0000-000000000001') THEN
        INSERT INTO public.organizaciones (id, nombre)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Default')
        ON CONFLICT (id) DO NOTHING;
    END IF;
END;
$$;

-- 1. Busquedas
ALTER TABLE public.busquedas
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.busquedas b
SET organizacion_id = COALESCE(
    (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = b.creado_por LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::uuid
)
WHERE organizacion_id IS NULL;

ALTER TABLE public.busquedas
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.busquedas
    DROP CONSTRAINT IF EXISTS busquedas_organizacion_id_fkey;

ALTER TABLE public.busquedas
    ADD CONSTRAINT busquedas_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS busquedas_organizacion_idx
    ON public.busquedas (organizacion_id, creado_en DESC);

DROP POLICY IF EXISTS p_select_busquedas ON public.busquedas;
DROP POLICY IF EXISTS p_insert_busquedas ON public.busquedas;

CREATE POLICY busquedas_admin_all
    ON public.busquedas
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY busquedas_member_org
    ON public.busquedas
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 2. Resultados
ALTER TABLE public.resultados
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.resultados r
SET organizacion_id = COALESCE(
    b.organizacion_id,
    '00000000-0000-0000-0000-000000000001'::uuid
)
FROM public.busquedas b
WHERE r.busqueda_id = b.id
  AND r.organizacion_id IS NULL;

ALTER TABLE public.resultados
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.resultados
    DROP CONSTRAINT IF EXISTS resultados_organizacion_id_fkey;

ALTER TABLE public.resultados
    ADD CONSTRAINT resultados_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS resultados_organizacion_idx
    ON public.resultados (organizacion_id, creado_en DESC);

DROP POLICY IF EXISTS p_select_resultados ON public.resultados;
DROP POLICY IF EXISTS p_insert_resultados ON public.resultados;

CREATE POLICY resultados_admin_all
    ON public.resultados
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY resultados_member_org
    ON public.resultados
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 3. Prospeccion prospectos
ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.prospeccion_prospectos p
SET organizacion_id = COALESCE(
    b.organizacion_id,
    (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = p.creado_por LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::uuid
)
FROM public.busquedas b
WHERE p.busqueda_id = b.id
  AND p.organizacion_id IS NULL;

UPDATE public.prospeccion_prospectos p
SET organizacion_id = COALESCE(
    (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = p.creado_por LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::uuid
)
WHERE p.organizacion_id IS NULL;

ALTER TABLE public.prospeccion_prospectos
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.prospeccion_prospectos
    DROP CONSTRAINT IF EXISTS prospeccion_prospectos_organizacion_id_fkey;

ALTER TABLE public.prospeccion_prospectos
    ADD CONSTRAINT prospeccion_prospectos_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_organizacion_idx
    ON public.prospeccion_prospectos (organizacion_id, creado_en DESC);

DROP POLICY IF EXISTS p_select_prospeccion_prospectos ON public.prospeccion_prospectos;
DROP POLICY IF EXISTS p_insert_prospeccion_prospectos ON public.prospeccion_prospectos;
DROP POLICY IF EXISTS p_update_prospeccion_prospectos ON public.prospeccion_prospectos;

CREATE POLICY prospeccion_prospectos_admin_all
    ON public.prospeccion_prospectos
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_prospectos_member_org
    ON public.prospeccion_prospectos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 4. Prospeccion contactos log
ALTER TABLE public.prospeccion_contactos_log
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.prospeccion_contactos_log l
SET organizacion_id = COALESCE(
    p.organizacion_id,
    '00000000-0000-0000-0000-000000000001'::uuid
)
FROM public.prospeccion_prospectos p
WHERE l.prospecto_id = p.id
  AND l.organizacion_id IS NULL;

ALTER TABLE public.prospeccion_contactos_log
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.prospeccion_contactos_log
    DROP CONSTRAINT IF EXISTS prospeccion_contactos_log_organizacion_id_fkey;

ALTER TABLE public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_org_idx
    ON public.prospeccion_contactos_log (organizacion_id, creado_en DESC);

DROP POLICY IF EXISTS p_select_prospeccion_contactos_log ON public.prospeccion_contactos_log;
DROP POLICY IF EXISTS p_insert_prospeccion_contactos_log ON public.prospeccion_contactos_log;

CREATE POLICY prospeccion_contactos_log_admin_all
    ON public.prospeccion_contactos_log
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_contactos_log_member_org
    ON public.prospeccion_contactos_log
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 5. Prospeccion contacto batch
ALTER TABLE public.prospeccion_contacto_batch
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.prospeccion_contacto_batch b
SET organizacion_id = COALESCE(
    (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = b.iniciado_por LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::uuid
)
WHERE b.organizacion_id IS NULL;

ALTER TABLE public.prospeccion_contacto_batch
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.prospeccion_contacto_batch
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_organizacion_id_fkey;

ALTER TABLE public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_batch_org_idx
    ON public.prospeccion_contacto_batch (organizacion_id, creado_en DESC);

DROP POLICY IF EXISTS p_select_prospeccion_contacto_batch ON public.prospeccion_contacto_batch;
DROP POLICY IF EXISTS p_insert_prospeccion_contacto_batch ON public.prospeccion_contacto_batch;
DROP POLICY IF EXISTS p_update_prospeccion_contacto_batch ON public.prospeccion_contacto_batch;

CREATE POLICY prospeccion_contacto_batch_admin_all
    ON public.prospeccion_contacto_batch
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_contacto_batch_member_org
    ON public.prospeccion_contacto_batch
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 6. Prospeccion contacto envio
ALTER TABLE public.prospeccion_contacto_envio
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.prospeccion_contacto_envio e
SET organizacion_id = COALESCE(
    b.organizacion_id,
    (SELECT p.organizacion_id FROM public.prospeccion_prospectos p WHERE p.id = e.prospecto_id LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::uuid
)
FROM public.prospeccion_contacto_batch b
WHERE e.batch_id = b.id
  AND e.organizacion_id IS NULL;

ALTER TABLE public.prospeccion_contacto_envio
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.prospeccion_contacto_envio
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_envio_organizacion_id_fkey;

ALTER TABLE public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_idx
    ON public.prospeccion_contacto_envio (organizacion_id, programado_en);

DROP POLICY IF EXISTS p_select_prospeccion_contacto_envio ON public.prospeccion_contacto_envio;
DROP POLICY IF EXISTS p_insert_prospeccion_contacto_envio ON public.prospeccion_contacto_envio;
DROP POLICY IF EXISTS p_update_prospeccion_contacto_envio ON public.prospeccion_contacto_envio;

CREATE POLICY prospeccion_contacto_envio_admin_all
    ON public.prospeccion_contacto_envio
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_contacto_envio_member_org
    ON public.prospeccion_contacto_envio
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 7. Prospeccion prospectos audit
ALTER TABLE public.prospeccion_prospectos_audit
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.prospeccion_prospectos_audit a
SET organizacion_id = COALESCE(
    p.organizacion_id,
    '00000000-0000-0000-0000-000000000001'::uuid
)
FROM public.prospeccion_prospectos p
WHERE a.prospecto_id = p.id
  AND a.organizacion_id IS NULL;

ALTER TABLE public.prospeccion_prospectos_audit
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.prospeccion_prospectos_audit
    DROP CONSTRAINT IF EXISTS prospeccion_prospectos_audit_organizacion_id_fkey;

ALTER TABLE public.prospeccion_prospectos_audit
    ADD CONSTRAINT prospeccion_prospectos_audit_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_audit_org_idx
    ON public.prospeccion_prospectos_audit (organizacion_id, realizado_en DESC);

DROP POLICY IF EXISTS p_select_prospeccion_prospectos_audit ON public.prospeccion_prospectos_audit;
DROP POLICY IF EXISTS p_insert_prospeccion_prospectos_audit ON public.prospeccion_prospectos_audit;

CREATE POLICY prospeccion_prospectos_audit_admin_all
    ON public.prospeccion_prospectos_audit
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_prospectos_audit_member_org
    ON public.prospeccion_prospectos_audit
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 8. Prospeccion contacto templates
ALTER TABLE public.prospeccion_contacto_templates
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.prospeccion_contacto_templates t
SET organizacion_id = COALESCE(
    (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = t.creado_por LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::uuid
)
WHERE t.organizacion_id IS NULL;

ALTER TABLE public.prospeccion_contacto_templates
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_organizacion_id_fkey;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_idx
    ON public.prospeccion_contacto_templates (organizacion_id, creado_en DESC);

DROP POLICY IF EXISTS p_select_prospeccion_contacto_templates ON public.prospeccion_contacto_templates;
DROP POLICY IF EXISTS p_insert_prospeccion_contacto_templates ON public.prospeccion_contacto_templates;
DROP POLICY IF EXISTS p_update_prospeccion_contacto_templates ON public.prospeccion_contacto_templates;

CREATE POLICY prospeccion_contacto_templates_admin_all
    ON public.prospeccion_contacto_templates
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_contacto_templates_member_org
    ON public.prospeccion_contacto_templates
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- 9. Tablas para el Buscador
CREATE TABLE IF NOT EXISTS public.prospeccion_buscador_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    creado_por uuid DEFAULT auth.uid(),
    status text NOT NULL DEFAULT 'pending',
    params jsonb NOT NULL DEFAULT '{}'::jsonb,
    stats jsonb,
    total integer,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    duration_ms integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS prospeccion_buscador_jobs_org_idx
    ON public.prospeccion_buscador_jobs (organizacion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prospeccion_buscador_jobs_status_idx
    ON public.prospeccion_buscador_jobs (organizacion_id, status, created_at DESC);

ALTER TABLE public.prospeccion_buscador_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.prospeccion_buscador_resultados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES public.prospeccion_buscador_jobs(id) ON DELETE CASCADE,
    organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    url text,
    dominio text,
    correo text,
    telefono text,
    contacto jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospeccion_buscador_resultados_job_idx
    ON public.prospeccion_buscador_resultados (job_id);

CREATE INDEX IF NOT EXISTS prospeccion_buscador_resultados_org_idx
    ON public.prospeccion_buscador_resultados (organizacion_id, creado_en DESC);

ALTER TABLE public.prospeccion_buscador_resultados ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospeccion_buscador_jobs_admin_all
    ON public.prospeccion_buscador_jobs
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_buscador_jobs_member_org
    ON public.prospeccion_buscador_jobs
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY prospeccion_buscador_resultados_admin_all
    ON public.prospeccion_buscador_resultados
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY prospeccion_buscador_resultados_member_org
    ON public.prospeccion_buscador_resultados
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
