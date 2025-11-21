BEGIN;

-- Conversaciones insights
DROP POLICY IF EXISTS conversaciones_insights_admin_todo ON public.conversaciones_insights;
CREATE POLICY conversaciones_insights_admin
    ON public.conversaciones_insights
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Departamentos
DROP POLICY IF EXISTS departamentos_admin_todo ON public.departamentos;
CREATE POLICY departamentos_admin
    ON public.departamentos
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Ejecuciones asistente
DROP POLICY IF EXISTS ejecuciones_asistente_admin_todo ON public.ejecuciones_asistente;
CREATE POLICY ejecuciones_asistente_admin
    ON public.ejecuciones_asistente
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Identidades canal
DROP POLICY IF EXISTS identidades_canal_admin_todo ON public.identidades_canal;
CREATE POLICY identidades_canal_admin
    ON public.identidades_canal
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Llamadas
DROP POLICY IF EXISTS llamadas_admin_todo ON public.llamadas;
CREATE POLICY llamadas_admin
    ON public.llamadas
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Permisos
DROP POLICY IF EXISTS permisos_admin_todo ON public.permisos;
CREATE POLICY permisos_admin
    ON public.permisos
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Puestos
DROP POLICY IF EXISTS puestos_admin_todo ON public.puestos;
CREATE POLICY puestos_admin
    ON public.puestos
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Quote templates admin policies
DROP POLICY IF EXISTS quote_templates_insert_admin ON public.quote_templates;
DROP POLICY IF EXISTS quote_templates_update_admin ON public.quote_templates;

CREATE POLICY quote_templates_insert_admin
    ON public.quote_templates
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY quote_templates_update_admin
    ON public.quote_templates
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Roles
DROP POLICY IF EXISTS roles_admin_todo ON public.roles;
CREATE POLICY roles_admin
    ON public.roles
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Roles permisos
DROP POLICY IF EXISTS roles_permisos_admin_todo ON public.roles_permisos;
CREATE POLICY roles_permisos_admin
    ON public.roles_permisos
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Secretos
DROP POLICY IF EXISTS secretos_admin_todo ON public.secretos;
CREATE POLICY secretos_admin
    ON public.secretos
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Webhooks entrantes
DROP POLICY IF EXISTS webhooks_entrantes_admin_todo ON public.webhooks_entrantes;
CREATE POLICY webhooks_entrantes_admin
    ON public.webhooks_entrantes
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

COMMIT;
