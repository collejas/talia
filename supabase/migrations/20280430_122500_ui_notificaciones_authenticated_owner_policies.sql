BEGIN;

DROP POLICY IF EXISTS ui_notificaciones_member_own_insert ON public.ui_notificaciones;
CREATE POLICY ui_notificaciones_member_own_insert
    ON public.ui_notificaciones
    FOR INSERT
    TO authenticated
    WITH CHECK (
        usuario_id = auth.uid()
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

DROP POLICY IF EXISTS ui_notificaciones_member_own_update ON public.ui_notificaciones;
CREATE POLICY ui_notificaciones_member_own_update
    ON public.ui_notificaciones
    FOR UPDATE
    TO authenticated
    USING (
        usuario_id = auth.uid()
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        usuario_id = auth.uid()
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

DROP POLICY IF EXISTS ui_notificaciones_member_own_delete ON public.ui_notificaciones;
CREATE POLICY ui_notificaciones_member_own_delete
    ON public.ui_notificaciones
    FOR DELETE
    TO authenticated
    USING (
        usuario_id = auth.uid()
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ui_notificaciones TO authenticated;

COMMIT;
