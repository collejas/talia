BEGIN;

-- Contactos: combina políticas y envuelve auth.uid() en subconsultas para InitPlan
DROP POLICY IF EXISTS contactos_admin_all ON public.contactos;
DROP POLICY IF EXISTS contactos_propietario_all ON public.contactos;
DROP POLICY IF EXISTS contactos_admin_todo ON public.contactos;
DROP POLICY IF EXISTS contactos_propietario_crud ON public.contactos;

CREATE POLICY contactos_admin_all
    ON public.contactos
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY contactos_propietario_all
    ON public.contactos
    FOR ALL
    TO authenticated
    USING ((propietario_usuario_id = (SELECT auth.uid())))
    WITH CHECK ((propietario_usuario_id = (SELECT auth.uid())));

-- Conversaciones: mismas coberturas con auth.uid() envuelto
DROP POLICY IF EXISTS conversaciones_admin_all ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_select ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_delete ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_insert ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_update ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_admin_todo ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_delete ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_insert ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_select ON public.conversaciones;
DROP POLICY IF EXISTS conversaciones_miembro_update ON public.conversaciones;

CREATE POLICY conversaciones_admin_all
    ON public.conversaciones
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY conversaciones_miembro_select
    ON public.conversaciones
    FOR SELECT
    TO authenticated
    USING (public.puede_ver_conversacion(id));

CREATE POLICY conversaciones_miembro_delete
    ON public.conversaciones
    FOR DELETE
    TO authenticated
    USING (public.puede_ver_conversacion(id));

CREATE POLICY conversaciones_miembro_insert
    ON public.conversaciones
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            EXISTS (
                SELECT 1
                FROM public.contactos ct
                WHERE ct.id = conversaciones.contacto_id
                  AND ct.propietario_usuario_id = (SELECT auth.uid())
            )
        )
        OR asignado_a_usuario_id = (SELECT auth.uid())
    );

CREATE POLICY conversaciones_miembro_update
    ON public.conversaciones
    FOR UPDATE
    TO authenticated
    USING (public.puede_ver_conversacion(id))
    WITH CHECK (
        (
            EXISTS (
                SELECT 1
                FROM public.contactos ct
                WHERE ct.id = conversaciones.contacto_id
                  AND ct.propietario_usuario_id = (SELECT auth.uid())
            )
        )
        OR asignado_a_usuario_id = (SELECT auth.uid())
    );

COMMIT;
