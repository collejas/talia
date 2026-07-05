BEGIN;

ALTER TABLE public.oportunidad_codigo_contadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_folio_contadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oportunidad_codigo_contadores_select ON public.oportunidad_codigo_contadores;
DROP POLICY IF EXISTS oportunidad_codigo_contadores_insert ON public.oportunidad_codigo_contadores;
DROP POLICY IF EXISTS oportunidad_codigo_contadores_update ON public.oportunidad_codigo_contadores;
DROP POLICY IF EXISTS oportunidad_codigo_contadores_delete ON public.oportunidad_codigo_contadores;

CREATE POLICY oportunidad_codigo_contadores_select
    ON public.oportunidad_codigo_contadores
    FOR SELECT
    TO authenticated, service_role
    USING (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY oportunidad_codigo_contadores_insert
    ON public.oportunidad_codigo_contadores
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY oportunidad_codigo_contadores_update
    ON public.oportunidad_codigo_contadores
    FOR UPDATE
    TO authenticated, service_role
    USING (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

DROP POLICY IF EXISTS cotizacion_folio_contadores_select ON public.cotizacion_folio_contadores;
DROP POLICY IF EXISTS cotizacion_folio_contadores_insert ON public.cotizacion_folio_contadores;
DROP POLICY IF EXISTS cotizacion_folio_contadores_update ON public.cotizacion_folio_contadores;
DROP POLICY IF EXISTS cotizacion_folio_contadores_delete ON public.cotizacion_folio_contadores;

CREATE POLICY cotizacion_folio_contadores_select
    ON public.cotizacion_folio_contadores
    FOR SELECT
    TO authenticated, service_role
    USING (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY cotizacion_folio_contadores_insert
    ON public.cotizacion_folio_contadores
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY cotizacion_folio_contadores_update
    ON public.cotizacion_folio_contadores
    FOR UPDATE
    TO authenticated, service_role
    USING (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

COMMIT;
