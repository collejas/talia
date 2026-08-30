BEGIN;

DROP POLICY IF EXISTS tenant_web_tracking_sites_admin_write
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_admin_write
    ON public.tenant_web_tracking_sites
    FOR INSERT
    TO authenticated
    WITH CHECK (
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
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
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
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
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS tenant_web_tracking_domains_admin_write
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_admin_write
    ON public.tenant_web_tracking_domains
    FOR INSERT
    TO authenticated
    WITH CHECK (
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
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
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
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
        ((public.es_admin((SELECT auth.uid())) OR public.es_owner((SELECT auth.uid())))
            AND organizacion_id = (SELECT public.usuario_organizacion_id((SELECT auth.uid()))))
        OR public.es_platform_admin((SELECT auth.uid()))
    );

COMMIT;
