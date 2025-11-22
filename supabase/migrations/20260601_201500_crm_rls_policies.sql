BEGIN;

-- Helper para filtrar por organizacion
CREATE OR REPLACE FUNCTION public.usuario_organizacion_id(p_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organizacion_id
    FROM public.usuarios
    WHERE id = p_uid
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.usuario_organizacion_id IS 'Obtiene la organización del usuario autenticado para políticas RLS.';

-- Macro auxiliar
DO $$
DECLARE
    tables text[] := ARRAY[
        'cuentas',
        'etapas_pipeline',
        'oportunidades',
        'oportunidad_etapas_historial',
        'actividades',
        'tickets',
        'ticket_comentarios',
        'productos',
        'cotizaciones',
        'cotizacion_items',
        'campanas',
        'leads',
        'lead_eventos',
        'tags',
        'taggings',
        'archivos',
        'notas',
        'audit_logs'
    ];
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
    END LOOP;
END;
$$;

-- Cuentas
DROP POLICY IF EXISTS cuentas_admin_all ON public.cuentas;
DROP POLICY IF EXISTS cuentas_member_org ON public.cuentas;

CREATE POLICY cuentas_admin_all
    ON public.cuentas
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY cuentas_member_org
    ON public.cuentas
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Etapas pipeline
DROP POLICY IF EXISTS etapas_pipeline_admin_all ON public.etapas_pipeline;
DROP POLICY IF EXISTS etapas_pipeline_member_org ON public.etapas_pipeline;

CREATE POLICY etapas_pipeline_admin_all
    ON public.etapas_pipeline
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY etapas_pipeline_member_org
    ON public.etapas_pipeline
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Oportunidades
DROP POLICY IF EXISTS oportunidades_admin_all ON public.oportunidades;
DROP POLICY IF EXISTS oportunidades_member_org ON public.oportunidades;

CREATE POLICY oportunidades_admin_all
    ON public.oportunidades
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY oportunidades_member_org
    ON public.oportunidades
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Historial
DROP POLICY IF EXISTS oportunidad_historial_admin_all ON public.oportunidad_etapas_historial;
DROP POLICY IF EXISTS oportunidad_historial_member_org ON public.oportunidad_etapas_historial;

CREATE POLICY oportunidad_historial_admin_all
    ON public.oportunidad_etapas_historial
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY oportunidad_historial_member_org
    ON public.oportunidad_etapas_historial
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Actividades
DROP POLICY IF EXISTS actividades_admin_all ON public.actividades;
DROP POLICY IF EXISTS actividades_member_org ON public.actividades;

CREATE POLICY actividades_admin_all
    ON public.actividades
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY actividades_member_org
    ON public.actividades
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Tickets
DROP POLICY IF EXISTS tickets_admin_all ON public.tickets;
DROP POLICY IF EXISTS tickets_member_org ON public.tickets;

CREATE POLICY tickets_admin_all
    ON public.tickets
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY tickets_member_org
    ON public.tickets
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Ticket comentarios
DROP POLICY IF EXISTS ticket_comentarios_admin_all ON public.ticket_comentarios;
DROP POLICY IF EXISTS ticket_comentarios_member_ticket ON public.ticket_comentarios;

CREATE POLICY ticket_comentarios_admin_all
    ON public.ticket_comentarios
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY ticket_comentarios_member_ticket
    ON public.ticket_comentarios
    FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_comentarios.ticket_id
          AND t.organizacion_id = public.usuario_organizacion_id(auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_comentarios.ticket_id
          AND t.organizacion_id = public.usuario_organizacion_id(auth.uid())
    ));

-- Productos
DROP POLICY IF EXISTS productos_admin_all ON public.productos;
DROP POLICY IF EXISTS productos_member_org ON public.productos;

CREATE POLICY productos_admin_all
    ON public.productos
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY productos_member_org
    ON public.productos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Cotizaciones
DROP POLICY IF EXISTS cotizaciones_admin_all ON public.cotizaciones;
DROP POLICY IF EXISTS cotizaciones_member_org ON public.cotizaciones;

CREATE POLICY cotizaciones_admin_all
    ON public.cotizaciones
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY cotizaciones_member_org
    ON public.cotizaciones
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Cotizacion items
DROP POLICY IF EXISTS cotizacion_items_admin_all ON public.cotizacion_items;
DROP POLICY IF EXISTS cotizacion_items_member_quote ON public.cotizacion_items;

CREATE POLICY cotizacion_items_admin_all
    ON public.cotizacion_items
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY cotizacion_items_member_quote
    ON public.cotizacion_items
    FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cotizaciones c
        WHERE c.id = cotizacion_items.cotizacion_id
          AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cotizaciones c
        WHERE c.id = cotizacion_items.cotizacion_id
          AND c.organizacion_id = public.usuario_organizacion_id(auth.uid())
    ));

-- Campanas
DROP POLICY IF EXISTS campanas_admin_all ON public.campanas;
DROP POLICY IF EXISTS campanas_member_org ON public.campanas;

CREATE POLICY campanas_admin_all
    ON public.campanas
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY campanas_member_org
    ON public.campanas
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Leads
DROP POLICY IF EXISTS leads_admin_all ON public.leads;
DROP POLICY IF EXISTS leads_member_org ON public.leads;

CREATE POLICY leads_admin_all
    ON public.leads
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY leads_member_org
    ON public.leads
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Lead eventos
DROP POLICY IF EXISTS lead_eventos_admin_all ON public.lead_eventos;
DROP POLICY IF EXISTS lead_eventos_member_lead ON public.lead_eventos;

CREATE POLICY lead_eventos_admin_all
    ON public.lead_eventos
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_eventos_member_lead
    ON public.lead_eventos
    FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_eventos.lead_id
          AND l.organizacion_id = public.usuario_organizacion_id(auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_eventos.lead_id
          AND l.organizacion_id = public.usuario_organizacion_id(auth.uid())
    ));

-- Tags
DROP POLICY IF EXISTS tags_admin_all ON public.tags;
DROP POLICY IF EXISTS tags_member_org ON public.tags;

CREATE POLICY tags_admin_all
    ON public.tags
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY tags_member_org
    ON public.tags
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Taggings
DROP POLICY IF EXISTS taggings_admin_all ON public.taggings;
DROP POLICY IF EXISTS taggings_member_org ON public.taggings;

CREATE POLICY taggings_admin_all
    ON public.taggings
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY taggings_member_org
    ON public.taggings
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Archivos
DROP POLICY IF EXISTS archivos_admin_all ON public.archivos;
DROP POLICY IF EXISTS archivos_member_org ON public.archivos;

CREATE POLICY archivos_admin_all
    ON public.archivos
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY archivos_member_org
    ON public.archivos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Notas
DROP POLICY IF EXISTS notas_admin_all ON public.notas;
DROP POLICY IF EXISTS notas_member_org ON public.notas;

CREATE POLICY notas_admin_all
    ON public.notas
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY notas_member_org
    ON public.notas
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Audit logs
DROP POLICY IF EXISTS audit_logs_admin_all ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_member_org ON public.audit_logs;

CREATE POLICY audit_logs_admin_all
    ON public.audit_logs
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY audit_logs_member_org
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

COMMIT;
