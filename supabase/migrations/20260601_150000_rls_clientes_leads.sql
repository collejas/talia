BEGIN;

-- Clientes
DROP POLICY IF EXISTS clientes_admin_all ON public.clientes;
DROP POLICY IF EXISTS clientes_member_all ON public.clientes;

CREATE POLICY clientes_admin_all
    ON public.clientes
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY clientes_member_all
    ON public.clientes
    FOR ALL
    TO authenticated
    USING (((lead_tarjeta_id IS NOT NULL) AND public.puede_ver_lead(lead_tarjeta_id)))
    WITH CHECK (((lead_tarjeta_id IS NOT NULL) AND public.puede_ver_lead(lead_tarjeta_id)));

-- Cliente documentos
DROP POLICY IF EXISTS cliente_documentos_admin_all ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_documentos_member_all ON public.cliente_documentos;

CREATE POLICY cliente_documentos_admin_all
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY cliente_documentos_member_all
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING ((EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = cliente_documentos.cliente_id
          AND c.lead_tarjeta_id IS NOT NULL
          AND public.puede_ver_lead(c.lead_tarjeta_id)
    )))
    WITH CHECK ((EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = cliente_documentos.cliente_id
          AND c.lead_tarjeta_id IS NOT NULL
          AND public.puede_ver_lead(c.lead_tarjeta_id)
    )));

-- Cliente responsables
DROP POLICY IF EXISTS cliente_responsables_admin_all ON public.cliente_responsables;
DROP POLICY IF EXISTS cliente_responsables_member_all ON public.cliente_responsables;

CREATE POLICY cliente_responsables_admin_all
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY cliente_responsables_member_all
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING ((EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = cliente_responsables.cliente_id
          AND c.lead_tarjeta_id IS NOT NULL
          AND public.puede_ver_lead(c.lead_tarjeta_id)
    )))
    WITH CHECK ((EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = cliente_responsables.cliente_id
          AND c.lead_tarjeta_id IS NOT NULL
          AND public.puede_ver_lead(c.lead_tarjeta_id)
    )));

-- Cliente portal tokens
DROP POLICY IF EXISTS cliente_portal_tokens_admin_all ON public.cliente_portal_tokens;

CREATE POLICY cliente_portal_tokens_member_all
    ON public.cliente_portal_tokens
    FOR ALL
    TO authenticated
    USING ((EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = cliente_portal_tokens.cliente_id
          AND public.puede_ver_lead(c.lead_tarjeta_id)
    )))
    WITH CHECK ((EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = cliente_portal_tokens.cliente_id
          AND public.puede_ver_lead(c.lead_tarjeta_id)
    )));

-- Lead tableros
DROP POLICY IF EXISTS lead_tableros_admin_all ON public.lead_tableros;
DROP POLICY IF EXISTS lead_tableros_select_default ON public.lead_tableros;

CREATE POLICY lead_tableros_admin_all
    ON public.lead_tableros
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY lead_tableros_member_all
    ON public.lead_tableros
    FOR ALL
    TO authenticated
    USING (public.puede_ver_tablero(id))
    WITH CHECK (public.puede_ver_tablero(id));

-- Lead etapas
DROP POLICY IF EXISTS lead_etapas_admin_all ON public.lead_etapas;
DROP POLICY IF EXISTS lead_etapas_select ON public.lead_etapas;

CREATE POLICY lead_etapas_admin_all
    ON public.lead_etapas
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY lead_etapas_member_all
    ON public.lead_etapas
    FOR ALL
    TO authenticated
    USING (public.puede_ver_tablero(tablero_id))
    WITH CHECK (public.puede_ver_tablero(tablero_id));

-- Lead tarjetas
DROP POLICY IF EXISTS lead_tarjetas_admin_all ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_delete ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_insert ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_select ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_member_update ON public.lead_tarjetas;

CREATE POLICY lead_tarjetas_admin_all
    ON public.lead_tarjetas
    FOR ALL
    TO authenticated
    USING ((SELECT public.es_admin(auth.uid())))
    WITH CHECK ((SELECT public.es_admin(auth.uid())));

CREATE POLICY lead_tarjetas_member_all
    ON public.lead_tarjetas
    FOR ALL
    TO authenticated
    USING (public.puede_ver_lead(id))
    WITH CHECK (public.puede_ver_lead(id));

COMMIT;
