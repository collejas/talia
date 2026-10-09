BEGIN;

-- La API de Talia reenvía el JWT del usuario para las lecturas. Las mutaciones
-- permanecen detrás de RPC SECURITY DEFINER usando service_role desde backend.

GRANT SELECT ON public.transformaciones,
    public.transformacion_componentes,
    public.transformacion_salidas,
    public.ordenes_transformacion,
    public.ordenes_transformacion_componentes,
    public.ordenes_transformacion_salidas
    TO authenticated;

DROP POLICY IF EXISTS transformaciones_select_org ON public.transformaciones;
CREATE POLICY transformaciones_select_org
    ON public.transformaciones
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS transformacion_componentes_select_org ON public.transformacion_componentes;
CREATE POLICY transformacion_componentes_select_org
    ON public.transformacion_componentes
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS transformacion_salidas_select_org ON public.transformacion_salidas;
CREATE POLICY transformacion_salidas_select_org
    ON public.transformacion_salidas
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS ordenes_transformacion_select_org ON public.ordenes_transformacion;
CREATE POLICY ordenes_transformacion_select_org
    ON public.ordenes_transformacion
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS ordenes_transformacion_componentes_select_org ON public.ordenes_transformacion_componentes;
CREATE POLICY ordenes_transformacion_componentes_select_org
    ON public.ordenes_transformacion_componentes
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS ordenes_transformacion_salidas_select_org ON public.ordenes_transformacion_salidas;
CREATE POLICY ordenes_transformacion_salidas_select_org
    ON public.ordenes_transformacion_salidas
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
