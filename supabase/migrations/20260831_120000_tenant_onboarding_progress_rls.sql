BEGIN;

-- El avance del onboarding contiene decisiones y posición del tenant.
-- Debe quedar aislado por organización aunque el flujo normal use el backend.
ALTER TABLE public.tenant_onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding_progress FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_onboarding_progress FROM anon;
REVOKE ALL ON public.tenant_onboarding_progress FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_onboarding_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_onboarding_progress TO service_role;

DROP POLICY IF EXISTS tenant_onboarding_progress_member_select
    ON public.tenant_onboarding_progress;
DROP POLICY IF EXISTS tenant_onboarding_progress_admin_insert
    ON public.tenant_onboarding_progress;
DROP POLICY IF EXISTS tenant_onboarding_progress_admin_update
    ON public.tenant_onboarding_progress;

CREATE POLICY tenant_onboarding_progress_member_select
    ON public.tenant_onboarding_progress
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

CREATE POLICY tenant_onboarding_progress_admin_insert
    ON public.tenant_onboarding_progress
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND (
            public.es_admin((SELECT auth.uid()))
            OR public.es_owner((SELECT auth.uid()))
        )
        AND (actualizado_por IS NULL OR actualizado_por = (SELECT auth.uid()))
    );

CREATE POLICY tenant_onboarding_progress_admin_update
    ON public.tenant_onboarding_progress
    FOR UPDATE
    TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND (
            public.es_admin((SELECT auth.uid()))
            OR public.es_owner((SELECT auth.uid()))
        )
    )
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND (
            public.es_admin((SELECT auth.uid()))
            OR public.es_owner((SELECT auth.uid()))
        )
        AND (actualizado_por IS NULL OR actualizado_por = (SELECT auth.uid()))
    );

COMMENT ON TABLE public.tenant_onboarding_progress IS
    'Decisiones y posición del tenant dentro de la configuración guiada; protegido por organización mediante RLS.';

COMMIT;
