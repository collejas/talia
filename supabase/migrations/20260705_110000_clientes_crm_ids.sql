BEGIN;

--------------------------------------------------------------------------------
-- 1. Clientes → cuenta/oportunidad reales + legacy lead solo para auditoría
--------------------------------------------------------------------------------
ALTER TABLE public.clientes
    RENAME COLUMN lead_tarjeta_id TO legacy_lead_id;

COMMENT ON COLUMN public.clientes.legacy_lead_id
    IS 'ID legacy en lead_tarjetas (solo auditoría).';

ALTER INDEX IF EXISTS clientes_lead_idx RENAME TO clientes_legacy_lead_idx;

ALTER TABLE public.clientes
    DROP CONSTRAINT IF EXISTS clientes_lead_tarjeta_id_fkey;

ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_legacy_lead_id_fkey
        FOREIGN KEY (legacy_lead_id)
        REFERENCES public.lead_tarjetas(id)
        ON DELETE SET NULL;

DROP TRIGGER IF EXISTS clientes_sync_oportunidad ON public.clientes;
DROP FUNCTION IF EXISTS public.tg_clientes_sync_oportunidad();

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS cuenta_id uuid;

WITH datos AS (
    SELECT
        c.id AS cliente_id,
        COALESCE(o.cuenta_id, c.cuenta_id, c.id) AS cuenta_destino,
        COALESCE(o.id, c.oportunidad_id) AS oportunidad_destino
    FROM public.clientes c
    LEFT JOIN public.oportunidades o ON o.id = c.oportunidad_id
)
UPDATE public.clientes AS c
SET
    cuenta_id = d.cuenta_destino,
    oportunidad_id = COALESCE(c.oportunidad_id, d.oportunidad_destino)
FROM datos AS d
WHERE c.id = d.cliente_id
  AND (
        c.cuenta_id IS DISTINCT FROM d.cuenta_destino
        OR (c.oportunidad_id IS NULL AND d.oportunidad_destino IS NOT NULL)
  );

UPDATE public.clientes AS c
SET cuenta_id = c.id
WHERE cuenta_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.cuentas acc
      WHERE acc.id = c.id
  );

ALTER TABLE public.clientes
    ALTER COLUMN cuenta_id SET NOT NULL;

ALTER TABLE public.clientes
    DROP CONSTRAINT IF EXISTS clientes_cuenta_id_fkey;

ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_cuenta_id_fkey
        FOREIGN KEY (cuenta_id)
        REFERENCES public.cuentas(id)
        ON DELETE CASCADE;

COMMENT ON COLUMN public.clientes.cuenta_id
    IS 'Cuenta CRM asociada al cliente.';

COMMENT ON COLUMN public.clientes.oportunidad_id
    IS 'Oportunidad CRM que originó el cliente.';

CREATE INDEX IF NOT EXISTS clientes_cuenta_idx
    ON public.clientes (cuenta_id);

--------------------------------------------------------------------------------
-- 2. Tablas dependientes: documentos, responsables, portal tokens
--------------------------------------------------------------------------------
ALTER TABLE public.cliente_documentos
    ADD COLUMN IF NOT EXISTS cuenta_id uuid,
    ADD COLUMN IF NOT EXISTS oportunidad_id uuid;

WITH datos AS (
    SELECT id, cuenta_id, oportunidad_id, organizacion_id
    FROM public.clientes
)
UPDATE public.cliente_documentos AS d
SET
    cuenta_id = COALESCE(d.cuenta_id, c.cuenta_id),
    oportunidad_id = COALESCE(d.oportunidad_id, c.oportunidad_id),
    organizacion_id = COALESCE(d.organizacion_id, c.organizacion_id)
FROM datos AS c
WHERE c.id = d.cliente_id;

ALTER TABLE public.cliente_documentos
    DROP CONSTRAINT IF EXISTS cliente_documentos_cuenta_id_fkey;

ALTER TABLE public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_cuenta_id_fkey
        FOREIGN KEY (cuenta_id)
        REFERENCES public.cuentas(id)
        ON DELETE SET NULL;

ALTER TABLE public.cliente_documentos
    DROP CONSTRAINT IF EXISTS cliente_documentos_oportunidad_id_fkey;

ALTER TABLE public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_oportunidad_id_fkey
        FOREIGN KEY (oportunidad_id)
        REFERENCES public.oportunidades(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cliente_documentos_cuenta_idx
    ON public.cliente_documentos (cuenta_id);

CREATE INDEX IF NOT EXISTS cliente_documentos_oportunidad_idx
    ON public.cliente_documentos (oportunidad_id);

ALTER TABLE public.cliente_responsables
    ADD COLUMN IF NOT EXISTS cuenta_id uuid,
    ADD COLUMN IF NOT EXISTS oportunidad_id uuid;

WITH datos AS (
    SELECT id, cuenta_id, oportunidad_id, organizacion_id
    FROM public.clientes
)
UPDATE public.cliente_responsables AS r
SET
    cuenta_id = COALESCE(r.cuenta_id, c.cuenta_id),
    oportunidad_id = COALESCE(r.oportunidad_id, c.oportunidad_id),
    organizacion_id = COALESCE(r.organizacion_id, c.organizacion_id)
FROM datos AS c
WHERE c.id = r.cliente_id;

ALTER TABLE public.cliente_responsables
    DROP CONSTRAINT IF EXISTS cliente_responsables_cuenta_id_fkey;

ALTER TABLE public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_cuenta_id_fkey
        FOREIGN KEY (cuenta_id)
        REFERENCES public.cuentas(id)
        ON DELETE SET NULL;

ALTER TABLE public.cliente_responsables
    DROP CONSTRAINT IF EXISTS cliente_responsables_oportunidad_id_fkey;

ALTER TABLE public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_oportunidad_id_fkey
        FOREIGN KEY (oportunidad_id)
        REFERENCES public.oportunidades(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cliente_responsables_cuenta_idx
    ON public.cliente_responsables (cuenta_id);

CREATE INDEX IF NOT EXISTS cliente_responsables_oportunidad_idx
    ON public.cliente_responsables (oportunidad_id);

ALTER TABLE public.cliente_portal_tokens
    ADD COLUMN IF NOT EXISTS organizacion_id uuid
        DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
        NOT NULL,
    ADD COLUMN IF NOT EXISTS cuenta_id uuid,
    ADD COLUMN IF NOT EXISTS oportunidad_id uuid;

WITH datos AS (
    SELECT id, cuenta_id, oportunidad_id, organizacion_id
    FROM public.clientes
)
UPDATE public.cliente_portal_tokens AS t
SET
    organizacion_id = COALESCE(t.organizacion_id, c.organizacion_id),
    cuenta_id = COALESCE(t.cuenta_id, c.cuenta_id),
    oportunidad_id = COALESCE(t.oportunidad_id, c.oportunidad_id)
FROM datos AS c
WHERE c.id = t.cliente_id;

ALTER TABLE public.cliente_portal_tokens
    DROP CONSTRAINT IF EXISTS cliente_portal_tokens_organizacion_id_fkey;

ALTER TABLE public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_organizacion_id_fkey
        FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones(id)
        ON DELETE CASCADE;

ALTER TABLE public.cliente_portal_tokens
    DROP CONSTRAINT IF EXISTS cliente_portal_tokens_cuenta_id_fkey;

ALTER TABLE public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_cuenta_id_fkey
        FOREIGN KEY (cuenta_id)
        REFERENCES public.cuentas(id)
        ON DELETE SET NULL;

ALTER TABLE public.cliente_portal_tokens
    DROP CONSTRAINT IF EXISTS cliente_portal_tokens_oportunidad_id_fkey;

ALTER TABLE public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_oportunidad_id_fkey
        FOREIGN KEY (oportunidad_id)
        REFERENCES public.oportunidades(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cliente_portal_tokens_organizacion_idx
    ON public.cliente_portal_tokens (organizacion_id, cliente_id);

CREATE INDEX IF NOT EXISTS cliente_portal_tokens_cuenta_idx
    ON public.cliente_portal_tokens (cuenta_id);

CREATE INDEX IF NOT EXISTS cliente_portal_tokens_oportunidad_idx
    ON public.cliente_portal_tokens (oportunidad_id);

--------------------------------------------------------------------------------
-- 3. RLS alineado a organizacion_id/cuanta/oportunidad
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS cliente_documentos_access ON public.cliente_documentos;
DROP POLICY IF EXISTS cliente_responsables_access ON public.cliente_responsables;
DROP POLICY IF EXISTS cliente_portal_tokens_access ON public.cliente_portal_tokens;
DROP POLICY IF EXISTS cliente_portal_tokens_member_all ON public.cliente_portal_tokens;
DROP POLICY IF EXISTS clientes_access ON public.clientes;

CREATE POLICY cliente_documentos_access
    ON public.cliente_documentos
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY cliente_responsables_access
    ON public.cliente_responsables
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY cliente_portal_tokens_member_org
    ON public.cliente_portal_tokens
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY clientes_access
    ON public.clientes
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

COMMIT;
