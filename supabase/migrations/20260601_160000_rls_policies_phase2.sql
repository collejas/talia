BEGIN;

-- Adjuntos
DROP POLICY IF EXISTS adjuntos_admin_all ON public.adjuntos;
DROP POLICY IF EXISTS adjuntos_admin_todo ON public.adjuntos;
DROP POLICY IF EXISTS adjuntos_insert_visible ON public.adjuntos;
DROP POLICY IF EXISTS adjuntos_select_visible ON public.adjuntos;
DROP POLICY IF EXISTS adjuntos_update_admin ON public.adjuntos;
DROP POLICY IF EXISTS adjuntos_delete_admin ON public.adjuntos;

CREATE POLICY adjuntos_select_authenticated
    ON public.adjuntos
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(mensaje_id)
    );

CREATE POLICY adjuntos_insert_authenticated
    ON public.adjuntos
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(mensaje_id)
    );

CREATE POLICY adjuntos_update_admin
    ON public.adjuntos
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY adjuntos_delete_admin
    ON public.adjuntos
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Cliente documentos
DROP POLICY IF EXISTS cliente_documentos_admin_all ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_documentos_member_all ON public.cliente_documentos;

CREATE POLICY cliente_documentos_access
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_documentos.cliente_id
              AND c.lead_tarjeta_id IS NOT NULL
              AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_documentos.cliente_id
              AND c.lead_tarjeta_id IS NOT NULL
              AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    );

-- Cliente responsables
DROP POLICY IF EXISTS cliente_responsables_admin_all ON public.cliente_responsables;
DROP POLICY IF EXISTS cliente_responsables_member_all ON public.cliente_responsables;

CREATE POLICY cliente_responsables_access
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_responsables.cliente_id
              AND c.lead_tarjeta_id IS NOT NULL
              AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_responsables.cliente_id
              AND c.lead_tarjeta_id IS NOT NULL
              AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    );

-- Cliente portal tokens
DROP POLICY IF EXISTS cliente_portal_tokens_admin_all ON public.cliente_portal_tokens;

CREATE POLICY cliente_portal_tokens_access
    ON public.cliente_portal_tokens
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_portal_tokens.cliente_id
              AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_portal_tokens.cliente_id
              AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    );

-- Clientes
DROP POLICY IF EXISTS clientes_admin_all ON public.clientes;
DROP POLICY IF EXISTS clientes_member_all ON public.clientes;

CREATE POLICY clientes_access
    ON public.clientes
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR (
            lead_tarjeta_id IS NOT NULL
            AND public.puede_ver_lead(lead_tarjeta_id)
        )
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR (
            lead_tarjeta_id IS NOT NULL
            AND public.puede_ver_lead(lead_tarjeta_id)
        )
    );

-- Empleados
DROP POLICY IF EXISTS empleados_admin_todo ON public.empleados;
DROP POLICY IF EXISTS empleados_self_read ON public.empleados;

CREATE POLICY empleados_select_authenticated
    ON public.empleados
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR usuario_id = (SELECT auth.uid())
    );

CREATE POLICY empleados_insert_admin
    ON public.empleados
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY empleados_update_admin
    ON public.empleados
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY empleados_delete_admin
    ON public.empleados
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Eventos auditoria
DROP POLICY IF EXISTS eventos_auditoria_actor_delete ON public.eventos_auditoria;
DROP POLICY IF EXISTS eventos_auditoria_actor_modify ON public.eventos_auditoria;
DROP POLICY IF EXISTS eventos_auditoria_actor_select ON public.eventos_auditoria;
DROP POLICY IF EXISTS eventos_auditoria_actor_update ON public.eventos_auditoria;
DROP POLICY IF EXISTS eventos_auditoria_admin_todo ON public.eventos_auditoria;

CREATE POLICY eventos_auditoria_select
    ON public.eventos_auditoria
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR actor_usuario_id = (SELECT auth.uid())
    );

CREATE POLICY eventos_auditoria_insert
    ON public.eventos_auditoria
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR actor_usuario_id = (SELECT auth.uid())
    );

CREATE POLICY eventos_auditoria_update
    ON public.eventos_auditoria
    FOR UPDATE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR actor_usuario_id = (SELECT auth.uid())
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR actor_usuario_id = (SELECT auth.uid())
    );

CREATE POLICY eventos_auditoria_delete
    ON public.eventos_auditoria
    FOR DELETE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR actor_usuario_id = (SELECT auth.uid())
    );

-- Eventos entrega
DROP POLICY IF EXISTS eventos_entrega_admin_todo ON public.eventos_entrega;
DROP POLICY IF EXISTS eventos_entrega_mensaje_visible_delete ON public.eventos_entrega;
DROP POLICY IF EXISTS eventos_entrega_mensaje_visible_modify ON public.eventos_entrega;
DROP POLICY IF EXISTS eventos_entrega_mensaje_visible_select ON public.eventos_entrega;
DROP POLICY IF EXISTS eventos_entrega_mensaje_visible_update ON public.eventos_entrega;

CREATE POLICY eventos_entrega_select
    ON public.eventos_entrega
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(mensaje_id)
    );

CREATE POLICY eventos_entrega_insert
    ON public.eventos_entrega
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(mensaje_id)
    );

CREATE POLICY eventos_entrega_update
    ON public.eventos_entrega
    FOR UPDATE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(mensaje_id)
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(mensaje_id)
    );

CREATE POLICY eventos_entrega_delete
    ON public.eventos_entrega
    FOR DELETE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(mensaje_id)
    );

-- Lead cotizaciones
DROP POLICY IF EXISTS lead_cotizaciones_admin_all ON public.lead_cotizaciones;
DROP POLICY IF EXISTS lead_cotizaciones_select ON public.lead_cotizaciones;

CREATE POLICY lead_cotizaciones_select
    ON public.lead_cotizaciones
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(tarjeta_id)
    );

CREATE POLICY lead_cotizaciones_insert_admin
    ON public.lead_cotizaciones
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY lead_cotizaciones_update_admin
    ON public.lead_cotizaciones
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY lead_cotizaciones_delete_admin
    ON public.lead_cotizaciones
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Lead etapas
DROP POLICY IF EXISTS lead_etapas_admin_all ON public.lead_etapas;
DROP POLICY IF EXISTS lead_etapas_select ON public.lead_etapas;

CREATE POLICY lead_etapas_access
    ON public.lead_etapas
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_tablero(tablero_id)
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_tablero(tablero_id)
    );

-- Lead movimientos
DROP POLICY IF EXISTS lead_movimientos_admin_all ON public.lead_movimientos;
DROP POLICY IF EXISTS lead_movimientos_select ON public.lead_movimientos;

CREATE POLICY lead_movimientos_select
    ON public.lead_movimientos
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(tarjeta_id)
    );

CREATE POLICY lead_movimientos_insert_admin
    ON public.lead_movimientos
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY lead_movimientos_update_admin
    ON public.lead_movimientos
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY lead_movimientos_delete_admin
    ON public.lead_movimientos
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Lead recordatorios
DROP POLICY IF EXISTS lead_recordatorios_admin_all ON public.lead_recordatorios;
DROP POLICY IF EXISTS lead_recordatorios_crud ON public.lead_recordatorios;

CREATE POLICY lead_recordatorios_access
    ON public.lead_recordatorios
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(tarjeta_id)
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(tarjeta_id)
    );

-- Lead tableros
DROP POLICY IF EXISTS lead_tableros_admin_all ON public.lead_tableros;
DROP POLICY IF EXISTS lead_tableros_select_default ON public.lead_tableros;

CREATE POLICY lead_tableros_access
    ON public.lead_tableros
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_tablero(id)
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_tablero(id)
    );

-- Lead tarjetas
DROP POLICY IF EXISTS lead_tarjetas_admin_all ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_delete ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_insert ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_select ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_update ON public.lead_tarjetas;

CREATE POLICY lead_tarjetas_select
    ON public.lead_tarjetas
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(id)
    );

CREATE POLICY lead_tarjetas_update
    ON public.lead_tarjetas
    FOR UPDATE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(id)
    )
    WITH CHECK (
        public.puede_ver_lead(id)
        OR public.es_admin((SELECT auth.uid()))
    );

CREATE POLICY lead_tarjetas_delete
    ON public.lead_tarjetas
    FOR DELETE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(id)
    );

CREATE POLICY lead_tarjetas_insert
    ON public.lead_tarjetas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR ( (SELECT auth.uid()) = propietario_usuario_id )
        OR ( (SELECT auth.uid()) = asignado_a_usuario_id )
        OR EXISTS (
            SELECT 1
            FROM public.contactos ct
            WHERE ct.id = lead_tarjetas.contacto_id
              AND ct.propietario_usuario_id = (SELECT auth.uid())
        )
    );

-- Logos
DROP POLICY IF EXISTS logos_select ON public.logos;
DROP POLICY IF EXISTS logos_write_admin ON public.logos;

CREATE POLICY logos_select
    ON public.logos
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY logos_insert_admin
    ON public.logos
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY logos_update_admin
    ON public.logos
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY logos_delete_admin
    ON public.logos
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Mensajes
DROP POLICY IF EXISTS mensajes_admin_todo ON public.mensajes;
DROP POLICY IF EXISTS mensajes_conversacion_visible_delete ON public.mensajes;
DROP POLICY IF EXISTS mensajes_conversacion_visible_modify ON public.mensajes;
DROP POLICY IF EXISTS mensajes_conversacion_visible_select ON public.mensajes;
DROP POLICY IF EXISTS mensajes_conversacion_visible_update ON public.mensajes;

CREATE POLICY mensajes_select
    ON public.mensajes
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(id)
    );

CREATE POLICY mensajes_insert
    ON public.mensajes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_conversacion(conversacion_id)
    );

CREATE POLICY mensajes_update
    ON public.mensajes
    FOR UPDATE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(id)
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_conversacion(conversacion_id)
    );

CREATE POLICY mensajes_delete
    ON public.mensajes
    FOR DELETE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_mensaje(id)
    );

-- Usuarios
DROP POLICY IF EXISTS usuarios_admin_todo ON public.usuarios;
DROP POLICY IF EXISTS usuarios_self_read ON public.usuarios;
DROP POLICY IF EXISTS usuarios_self_update ON public.usuarios;

CREATE POLICY usuarios_select
    ON public.usuarios
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR id = (SELECT auth.uid())
    );

CREATE POLICY usuarios_update
    ON public.usuarios
    FOR UPDATE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR id = (SELECT auth.uid())
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR id = (SELECT auth.uid())
    );

CREATE POLICY usuarios_insert_admin
    ON public.usuarios
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY usuarios_delete_admin
    ON public.usuarios
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Usuarios roles
DROP POLICY IF EXISTS usuarios_roles_admin_todo ON public.usuarios_roles;

CREATE POLICY usuarios_roles_admin
    ON public.usuarios_roles
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Usuarios_roles member access (optional) could be added later if needed.

COMMIT;
