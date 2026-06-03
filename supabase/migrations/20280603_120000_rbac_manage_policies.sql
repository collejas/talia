BEGIN;

-- The settings/rh UI authorizes user-role and role-permission management through
-- permission checks (`user.manage` / `role.manage`), not only through the legacy
-- `admin` role code. Keep the tenant guard, but align RLS with the same contract.

DROP POLICY IF EXISTS usuarios_roles_admin ON public.usuarios_roles;
CREATE POLICY usuarios_roles_manage
    ON public.usuarios_roles
    FOR ALL
    TO authenticated
    USING (
        public.current_user_has_perm('user.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.current_user_has_perm('user.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

DROP POLICY IF EXISTS roles_admin ON public.roles;
CREATE POLICY roles_manage
    ON public.roles
    FOR ALL
    TO authenticated
    USING (
        public.current_user_has_perm('role.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.current_user_has_perm('role.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

DROP POLICY IF EXISTS roles_permisos_admin ON public.roles_permisos;
CREATE POLICY roles_permisos_manage
    ON public.roles_permisos
    FOR ALL
    TO authenticated
    USING (
        public.current_user_has_perm('role.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.current_user_has_perm('role.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

DROP POLICY IF EXISTS permisos_admin ON public.permisos;
CREATE POLICY permisos_manage
    ON public.permisos
    FOR ALL
    TO authenticated
    USING (
        public.current_user_has_perm('role.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.current_user_has_perm('role.manage')
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

COMMIT;
