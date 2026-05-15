BEGIN;

-- Auditoría de movimientos inmobiliarios.
-- Servicio escribe con service_role; usuarios autenticados solo leen su organización.
ALTER TABLE public.propiedad_unidad_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propiedad_unidad_movimientos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.propiedad_unidad_movimientos FROM anon;
REVOKE ALL ON public.propiedad_unidad_movimientos FROM authenticated;
GRANT SELECT ON public.propiedad_unidad_movimientos TO authenticated;

DROP POLICY IF EXISTS propiedad_unidad_movimientos_admin_all ON public.propiedad_unidad_movimientos;
DROP POLICY IF EXISTS propiedad_unidad_movimientos_member_org ON public.propiedad_unidad_movimientos;

CREATE POLICY propiedad_unidad_movimientos_admin_all
    ON public.propiedad_unidad_movimientos
    FOR SELECT
    TO authenticated
    USING (public.es_admin(auth.uid()));

CREATE POLICY propiedad_unidad_movimientos_member_org
    ON public.propiedad_unidad_movimientos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMENT ON TABLE public.propiedad_unidad_movimientos
    IS 'Historial de estados comerciales de las unidades inmobiliarias. Lectura limitada por organización.';

-- Cache de CRM.
-- No debe ser accesible desde anon/authenticated; el backend la consulta con service_role.
ALTER TABLE public.crm_response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_response_cache FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.crm_response_cache FROM anon;
REVOKE ALL ON public.crm_response_cache FROM authenticated;

DROP POLICY IF EXISTS crm_response_cache_admin_all ON public.crm_response_cache;
DROP POLICY IF EXISTS crm_response_cache_member_org ON public.crm_response_cache;

COMMIT;
