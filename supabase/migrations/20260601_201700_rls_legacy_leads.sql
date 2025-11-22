BEGIN;

-- ============================================================================
-- Completar columnas organizacion_id en tablas legacy
-- ============================================================================

ALTER TABLE public.lead_movimientos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.lead_movimientos lm
SET organizacion_id = lt.organizacion_id
FROM public.lead_tarjetas lt
WHERE lt.id = lm.tarjeta_id
  AND lm.organizacion_id IS NULL;

UPDATE public.lead_movimientos
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.lead_movimientos
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.lead_movimientos
    ADD CONSTRAINT lead_movimientos_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_movimientos_organizacion_idx
    ON public.lead_movimientos (organizacion_id, tarjeta_id, cambiado_en);

ALTER TABLE public.lead_recordatorios
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.lead_recordatorios lr
SET organizacion_id = lt.organizacion_id
FROM public.lead_tarjetas lt
WHERE lt.id = lr.tarjeta_id
  AND lr.organizacion_id IS NULL;

UPDATE public.lead_recordatorios
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.lead_recordatorios
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.lead_recordatorios
    ADD CONSTRAINT lead_recordatorios_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_recordatorios_organizacion_idx
    ON public.lead_recordatorios (organizacion_id, due_at);

ALTER TABLE public.lead_cotizaciones
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.lead_cotizaciones lc
SET organizacion_id = lt.organizacion_id
FROM public.lead_tarjetas lt
WHERE lt.id = lc.tarjeta_id
  AND lc.organizacion_id IS NULL;

UPDATE public.lead_cotizaciones
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.lead_cotizaciones
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.lead_cotizaciones
    ADD CONSTRAINT lead_cotizaciones_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_cotizaciones_organizacion_idx
    ON public.lead_cotizaciones (organizacion_id, tarjeta_id);

ALTER TABLE public.lead_cotizacion_items
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.lead_cotizacion_items lci
SET organizacion_id = lc.organizacion_id
FROM public.lead_cotizaciones lc
WHERE lc.id = lci.cotizacion_id
  AND lci.organizacion_id IS NULL;

UPDATE public.lead_cotizacion_items
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.lead_cotizacion_items
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.lead_cotizacion_items
    ADD CONSTRAINT lead_cotizacion_items_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_cotizacion_items_organizacion_idx
    ON public.lead_cotizacion_items (organizacion_id, cotizacion_id);

ALTER TABLE public.cliente_documentos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.cliente_documentos cd
SET organizacion_id = c.organizacion_id
FROM public.clientes c
WHERE c.id = cd.cliente_id
  AND cd.organizacion_id IS NULL;

UPDATE public.cliente_documentos
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.cliente_documentos
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS cliente_documentos_organizacion_idx
    ON public.cliente_documentos (organizacion_id, cliente_id);

ALTER TABLE public.cliente_responsables
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.cliente_responsables cr
SET organizacion_id = c.organizacion_id
FROM public.clientes c
WHERE c.id = cr.cliente_id
  AND cr.organizacion_id IS NULL;

UPDATE public.cliente_responsables
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.cliente_responsables
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS cliente_responsables_organizacion_idx
    ON public.cliente_responsables (organizacion_id, cliente_id);

-- ============================================================================
-- Políticas RLS unificadas por organizacion_id
-- ============================================================================

-- Helper macro to drop legacy policies referencing puede_ver_*
DROP POLICY IF EXISTS lead_tableros_access ON public.lead_tableros;
DROP POLICY IF EXISTS lead_etapas_access ON public.lead_etapas;
DROP POLICY IF EXISTS lead_tarjetas_select ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_update ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_delete ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_tarjetas_insert ON public.lead_tarjetas;
DROP POLICY IF EXISTS lead_movimientos_select ON public.lead_movimientos;
DROP POLICY IF EXISTS lead_movimientos_insert_admin ON public.lead_movimientos;
DROP POLICY IF EXISTS lead_movimientos_update_admin ON public.lead_movimientos;
DROP POLICY IF EXISTS lead_movimientos_delete_admin ON public.lead_movimientos;
DROP POLICY IF EXISTS lead_recordatorios_access ON public.lead_recordatorios;
DROP POLICY IF EXISTS lead_cotizaciones_select ON public.lead_cotizaciones;
DROP POLICY IF EXISTS lead_cotizaciones_insert_admin ON public.lead_cotizaciones;
DROP POLICY IF EXISTS lead_cotizaciones_update_admin ON public.lead_cotizaciones;
DROP POLICY IF EXISTS lead_cotizaciones_delete_admin ON public.lead_cotizaciones;
DROP POLICY IF EXISTS clientes_admin_all ON public.clientes;
DROP POLICY IF EXISTS clientes_member_all ON public.clientes;
DROP POLICY IF EXISTS cliente_documentos_admin_all ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_documentos_member_all ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_responsables_admin_all ON public.cliente_responsables;
DROP POLICY IF EXISTS cliente_responsables_member_all ON public.cliente_responsables;

ALTER TABLE public.lead_tableros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tarjetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_recordatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_responsables ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_tableros_admin_all
    ON public.lead_tableros
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_tableros_member_org
    ON public.lead_tableros
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY lead_etapas_admin_all
    ON public.lead_etapas
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_etapas_member_org
    ON public.lead_etapas
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY lead_tarjetas_admin_all
    ON public.lead_tarjetas
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_tarjetas_member_org
    ON public.lead_tarjetas
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY lead_movimientos_admin_all
    ON public.lead_movimientos
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_movimientos_member_org
    ON public.lead_movimientos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY lead_recordatorios_admin_all
    ON public.lead_recordatorios
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_recordatorios_member_org
    ON public.lead_recordatorios
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY lead_cotizaciones_admin_all
    ON public.lead_cotizaciones
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_cotizaciones_member_org
    ON public.lead_cotizaciones
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY lead_cotizacion_items_admin_all
    ON public.lead_cotizacion_items
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_cotizacion_items_member_org
    ON public.lead_cotizacion_items
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY clientes_admin_all
    ON public.clientes
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY clientes_member_org
    ON public.clientes
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cliente_documentos_admin_all
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY cliente_documentos_member_org
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cliente_responsables_admin_all
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY cliente_responsables_member_org
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
