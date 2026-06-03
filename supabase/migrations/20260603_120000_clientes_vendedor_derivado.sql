BEGIN;

-- Reglas canónicas de visibilidad para clientes.
-- El vendedor visible se deriva de la relación, no de metadata:
-- contacto -> cuenta -> oportunidad.
CREATE OR REPLACE FUNCTION public.puede_ver_cliente_relacionado(
    p_contacto_id uuid,
    p_cuenta_id uuid,
    p_oportunidad_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1
            FROM public.contactos ct
            WHERE ct.id = p_contacto_id
              AND public.is_in_current_user_scope(ct.propietario_usuario_id)
        )
        OR EXISTS (
            SELECT 1
            FROM public.cuentas cu
            WHERE cu.id = p_cuenta_id
              AND public.is_in_current_user_scope(cu.propietario_usuario_id)
        )
        OR EXISTS (
            SELECT 1
            FROM public.oportunidades o
            WHERE o.id = p_oportunidad_id
              AND (
                  public.is_in_current_user_scope(o.asignado_a_usuario_id)
                  OR public.is_in_current_user_scope(o.propietario_usuario_id)
              )
        );
$$;

COMMENT ON FUNCTION public.puede_ver_cliente_relacionado(uuid, uuid, uuid) IS
    'Devuelve true cuando el usuario autenticado está en el scope del contacto, cuenta u oportunidad asociados al cliente.';

DROP POLICY IF EXISTS clientes_admin_all ON public.clientes;
DROP POLICY IF EXISTS clientes_member_all ON public.clientes;
DROP POLICY IF EXISTS clientes_member_org ON public.clientes;
DROP POLICY IF EXISTS clientes_access ON public.clientes;
DROP POLICY IF EXISTS clientes_miembro_acceso ON public.clientes;

CREATE POLICY clientes_admin_all
    ON public.clientes
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid()) OR public.es_owner(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid()) OR public.es_owner(auth.uid())));

CREATE POLICY clientes_miembro_acceso
    ON public.clientes
    FOR ALL
    TO authenticated
    USING (
        public.puede_ver_cliente_relacionado(contacto_id, cuenta_id, oportunidad_id)
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.puede_ver_cliente_relacionado(contacto_id, cuenta_id, oportunidad_id)
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

DROP POLICY IF EXISTS cliente_documentos_admin_all ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_documentos_member_all ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_documentos_member_org ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_documentos_access ON public.cliente_documentos;

CREATE POLICY cliente_documentos_admin_all
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY cliente_documentos_access
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_documentos.cliente_id
              AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
              AND public.puede_ver_cliente_relacionado(c.contacto_id, c.cuenta_id, c.oportunidad_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_documentos.cliente_id
              AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
              AND public.puede_ver_cliente_relacionado(c.contacto_id, c.cuenta_id, c.oportunidad_id)
        )
    );

DROP POLICY IF EXISTS cliente_responsables_admin_all ON public.cliente_responsables;
DROP POLICY IF EXISTS cliente_responsables_member_all ON public.cliente_responsables;
DROP POLICY IF EXISTS cliente_responsables_member_org ON public.cliente_responsables;
DROP POLICY IF EXISTS cliente_responsables_access ON public.cliente_responsables;

CREATE POLICY cliente_responsables_admin_all
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY cliente_responsables_access
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_responsables.cliente_id
              AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
              AND public.puede_ver_cliente_relacionado(c.contacto_id, c.cuenta_id, c.oportunidad_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_responsables.cliente_id
              AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
              AND public.puede_ver_cliente_relacionado(c.contacto_id, c.cuenta_id, c.oportunidad_id)
        )
    );

DROP POLICY IF EXISTS cliente_portal_tokens_admin_all ON public.cliente_portal_tokens;
DROP POLICY IF EXISTS cliente_portal_tokens_member_all ON public.cliente_portal_tokens;
DROP POLICY IF EXISTS cliente_portal_tokens_member_org ON public.cliente_portal_tokens;
DROP POLICY IF EXISTS cliente_portal_tokens_access ON public.cliente_portal_tokens;

CREATE POLICY cliente_portal_tokens_admin_all
    ON public.cliente_portal_tokens
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY cliente_portal_tokens_access
    ON public.cliente_portal_tokens
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_portal_tokens.cliente_id
              AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
              AND public.puede_ver_cliente_relacionado(c.contacto_id, c.cuenta_id, c.oportunidad_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = cliente_portal_tokens.cliente_id
              AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
              AND public.puede_ver_cliente_relacionado(c.contacto_id, c.cuenta_id, c.oportunidad_id)
        )
    );

COMMIT;
