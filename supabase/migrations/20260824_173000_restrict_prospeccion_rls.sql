BEGIN;

-- Las políticas antiguas con USING (true) permitían que usuarios autenticados
-- leyeran registros de otras organizaciones aunque las políticas multitenant
-- de UPDATE ya restringieran la escritura.
DROP POLICY IF EXISTS p_select_prospeccion_prospectos
    ON public.prospeccion_prospectos;

DROP POLICY IF EXISTS p_select_prospeccion_contactos_log
    ON public.prospeccion_contactos_log;

-- La política de lectura debe coincidir con la organización del usuario.
CREATE POLICY p_select_prospeccion_prospectos_org
    ON public.prospeccion_prospectos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY p_select_prospeccion_contactos_log_org
    ON public.prospeccion_contactos_log
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
