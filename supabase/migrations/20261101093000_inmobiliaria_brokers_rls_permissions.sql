BEGIN;

DROP POLICY IF EXISTS inmobiliaria_socios_comerciales_org
    ON public.inmobiliaria_socios_comerciales;
CREATE POLICY inmobiliaria_socios_comerciales_select
    ON public.inmobiliaria_socios_comerciales
    FOR SELECT TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));
CREATE POLICY inmobiliaria_socios_comerciales_manage
    ON public.inmobiliaria_socios_comerciales
    FOR INSERT TO authenticated
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    );
CREATE POLICY inmobiliaria_socios_comerciales_update
    ON public.inmobiliaria_socios_comerciales
    FOR UPDATE TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    )
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    );
CREATE POLICY inmobiliaria_socios_comerciales_delete
    ON public.inmobiliaria_socios_comerciales
    FOR DELETE TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    );

DROP POLICY IF EXISTS inmobiliaria_agentes_externos_org
    ON public.inmobiliaria_agentes_externos;
CREATE POLICY inmobiliaria_agentes_externos_select
    ON public.inmobiliaria_agentes_externos
    FOR SELECT TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));
CREATE POLICY inmobiliaria_agentes_externos_insert
    ON public.inmobiliaria_agentes_externos
    FOR INSERT TO authenticated
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    );
CREATE POLICY inmobiliaria_agentes_externos_update
    ON public.inmobiliaria_agentes_externos
    FOR UPDATE TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    )
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    );
CREATE POLICY inmobiliaria_agentes_externos_delete
    ON public.inmobiliaria_agentes_externos
    FOR DELETE TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.current_user_has_perm('inmobiliaria.brokers.manage')
    );

COMMIT;
