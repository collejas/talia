BEGIN;

-- Helper function to evaluate conversation visibility for the current user.
CREATE OR REPLACE FUNCTION public.puede_ver_conversacion(p_conversacion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversaciones c
        LEFT JOIN public.contactos ct ON ct.id = c.contacto_id
        WHERE c.id = p_conversacion_id
          AND (
            ct.propietario_usuario_id = auth.uid()
            OR c.asignado_a_usuario_id = auth.uid()
          )
    );
$$;

COMMENT ON FUNCTION public.puede_ver_conversacion(uuid)
    IS 'Retorna true cuando la conversación pertenece al usuario actual (propietario del contacto o asignado).';

-- Helper function to evaluate message visibility reusing conversation access.
CREATE OR REPLACE FUNCTION public.puede_ver_mensaje(p_mensaje_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.mensajes m
        WHERE m.id = p_mensaje_id
          AND public.puede_ver_conversacion(m.conversacion_id)
    );
$$;

COMMENT ON FUNCTION public.puede_ver_mensaje(uuid)
    IS 'Retorna true cuando el mensaje pertenece a una conversación visible para el usuario actual.';

-- Contacts: allow authenticated users to operar sobre sus propios contactos.
CREATE POLICY contactos_propietario_crud
    ON public.contactos
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (propietario_usuario_id = auth.uid())
    WITH CHECK (propietario_usuario_id = auth.uid());

-- Conversations: drop overly broad policy y agregar aislamiento por usuario.
DROP POLICY IF EXISTS "Allow authenticated read" ON public.conversaciones;

CREATE POLICY conversaciones_miembro_select
    ON public.conversaciones
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (public.puede_ver_conversacion(id));

CREATE POLICY conversaciones_miembro_insert
    ON public.conversaciones
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.contactos ct
            WHERE ct.id = contacto_id
              AND ct.propietario_usuario_id = auth.uid()
        )
        OR asignado_a_usuario_id = auth.uid()
    );

CREATE POLICY conversaciones_miembro_update
    ON public.conversaciones
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (public.puede_ver_conversacion(id))
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.contactos ct
            WHERE ct.id = contacto_id
              AND ct.propietario_usuario_id = auth.uid()
        )
        OR asignado_a_usuario_id = auth.uid()
    );

CREATE POLICY conversaciones_miembro_delete
    ON public.conversaciones
    AS PERMISSIVE
    FOR DELETE
    TO authenticated
    USING (public.puede_ver_conversacion(id));

-- Messages: visibility inherited from conversation.
CREATE POLICY mensajes_conversacion_visible_select
    ON public.mensajes
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (public.puede_ver_mensaje(id));

CREATE POLICY mensajes_conversacion_visible_modify
    ON public.mensajes
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (public.puede_ver_conversacion(conversacion_id));

CREATE POLICY mensajes_conversacion_visible_update
    ON public.mensajes
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (public.puede_ver_mensaje(id))
    WITH CHECK (public.puede_ver_conversacion(conversacion_id));

CREATE POLICY mensajes_conversacion_visible_delete
    ON public.mensajes
    AS PERMISSIVE
    FOR DELETE
    TO authenticated
    USING (public.puede_ver_mensaje(id));

-- Delivery events: follow the owning message visibility.
CREATE POLICY eventos_entrega_mensaje_visible_select
    ON public.eventos_entrega
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (public.puede_ver_mensaje(mensaje_id));

CREATE POLICY eventos_entrega_mensaje_visible_modify
    ON public.eventos_entrega
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (public.puede_ver_mensaje(mensaje_id));

CREATE POLICY eventos_entrega_mensaje_visible_update
    ON public.eventos_entrega
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (public.puede_ver_mensaje(mensaje_id))
    WITH CHECK (public.puede_ver_mensaje(mensaje_id));

CREATE POLICY eventos_entrega_mensaje_visible_delete
    ON public.eventos_entrega
    AS PERMISSIVE
    FOR DELETE
    TO authenticated
    USING (public.puede_ver_mensaje(mensaje_id));

-- Audit events: sólo se exponen al propio usuario (además de admins existentes).
CREATE POLICY eventos_auditoria_actor_select
    ON public.eventos_auditoria
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (actor_usuario_id = auth.uid());

CREATE POLICY eventos_auditoria_actor_modify
    ON public.eventos_auditoria
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (actor_usuario_id = auth.uid());

CREATE POLICY eventos_auditoria_actor_update
    ON public.eventos_auditoria
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (actor_usuario_id = auth.uid())
    WITH CHECK (actor_usuario_id = auth.uid());

CREATE POLICY eventos_auditoria_actor_delete
    ON public.eventos_auditoria
    AS PERMISSIVE
    FOR DELETE
    TO authenticated
    USING (actor_usuario_id = auth.uid());

COMMIT;
