BEGIN;

DROP POLICY IF EXISTS conversaciones_controles_assigned_select ON public.conversaciones_controles;
DROP POLICY IF EXISTS conversaciones_controles_assigned_insert ON public.conversaciones_controles;
DROP POLICY IF EXISTS conversaciones_controles_assigned_update ON public.conversaciones_controles;

CREATE POLICY conversaciones_controles_assigned_select
    ON public.conversaciones_controles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversaciones c
            WHERE c.id = conversaciones_controles.conversacion_id
              AND c.organizacion_id = conversaciones_controles.organizacion_id
              AND c.organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
              AND c.asignado_a_usuario_id = (SELECT auth.uid())
              AND lower(c.canal) IN ('whatsapp', 'webchat', 'correo')
        )
    );

CREATE POLICY conversaciones_controles_assigned_insert
    ON public.conversaciones_controles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.conversaciones c
            WHERE c.id = conversaciones_controles.conversacion_id
              AND c.organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
              AND c.asignado_a_usuario_id = (SELECT auth.uid())
              AND lower(c.canal) IN ('whatsapp', 'webchat', 'correo')
        )
    );

CREATE POLICY conversaciones_controles_assigned_update
    ON public.conversaciones_controles
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversaciones c
            WHERE c.id = conversaciones_controles.conversacion_id
              AND c.organizacion_id = conversaciones_controles.organizacion_id
              AND c.organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
              AND c.asignado_a_usuario_id = (SELECT auth.uid())
              AND lower(c.canal) IN ('whatsapp', 'webchat', 'correo')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.conversaciones c
            WHERE c.id = conversaciones_controles.conversacion_id
              AND c.organizacion_id = conversaciones_controles.organizacion_id
              AND c.organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
              AND c.asignado_a_usuario_id = (SELECT auth.uid())
              AND lower(c.canal) IN ('whatsapp', 'webchat', 'correo')
        )
    );

COMMIT;
