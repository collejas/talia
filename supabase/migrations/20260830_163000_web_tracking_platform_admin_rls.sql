BEGIN;

-- Permite que el administrador maestro opere instalaciones de cualquier
-- organización desde la vista de configuración seleccionada.
CREATE OR REPLACE FUNCTION public.es_platform_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.platform_admins
        WHERE user_id = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION public.es_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_platform_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS tenant_web_tracking_sites_member_read
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_member_read
    ON public.tenant_web_tracking_sites
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid())))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_sites_admin_write
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_admin_write
    ON public.tenant_web_tracking_sites
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_sites_admin_update
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_admin_update
    ON public.tenant_web_tracking_sites
    FOR UPDATE
    TO authenticated
    USING (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_sites_admin_delete
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_admin_delete
    ON public.tenant_web_tracking_sites
    FOR DELETE
    TO authenticated
    USING (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_domains_member_read
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_member_read
    ON public.tenant_web_tracking_domains
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid())))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_domains_admin_write
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_admin_write
    ON public.tenant_web_tracking_domains
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_domains_admin_update
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_admin_update
    ON public.tenant_web_tracking_domains
    FOR UPDATE
    TO authenticated
    USING (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_domains_admin_delete
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_admin_delete
    ON public.tenant_web_tracking_domains
    FOR DELETE
    TO authenticated
    USING (
        (public.es_admin((SELECT auth.uid()))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

COMMIT;
