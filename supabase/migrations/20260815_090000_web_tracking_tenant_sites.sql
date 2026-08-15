BEGIN;

-- ============================================================================
-- Tracking web multi-tenant: instalación pública y dominios autorizados
-- Fecha: 2026-08-15
--
-- Esta migración no crea eventos ni modifica web_sessions.
-- No contiene metadata, json, jsonb, payload, config ni campos equivalentes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_web_tracking_sites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    public_site_id text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    consent_required boolean NOT NULL DEFAULT true,
    last_event_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tenant_web_tracking_sites_organizacion_id_fkey
        FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones(id)
        ON DELETE CASCADE,

    CONSTRAINT tenant_web_tracking_sites_public_site_id_check
        CHECK (
            public_site_id = btrim(public_site_id)
            AND public_site_id ~ '^talia_site_[a-z0-9][a-z0-9_-]{5,127}$'
        ),

    CONSTRAINT tenant_web_tracking_sites_id_organizacion_unique
        UNIQUE (id, organizacion_id)
);

COMMENT ON TABLE public.tenant_web_tracking_sites IS
'Instalaciones públicas de tracking web por tenant. public_site_id no es un secreto.';

COMMENT ON COLUMN public.tenant_web_tracking_sites.public_site_id IS
'Identificador público de instalación; nunca contiene organizacion_id ni credenciales.';

COMMENT ON COLUMN public.tenant_web_tracking_sites.consent_required IS
'Indica si el collector debe esperar consentimiento antes de enviar eventos.';

CREATE INDEX IF NOT EXISTS tenant_web_tracking_sites_organizacion_idx
    ON public.tenant_web_tracking_sites (organizacion_id);

CREATE INDEX IF NOT EXISTS tenant_web_tracking_sites_active_idx
    ON public.tenant_web_tracking_sites (organizacion_id, updated_at DESC)
    WHERE active = true;

CREATE TABLE IF NOT EXISTS public.tenant_web_tracking_domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_site_id uuid NOT NULL,
    organizacion_id uuid NOT NULL,
    domain text NOT NULL,
    domain_normalized text NOT NULL,
    verification_method text NOT NULL,
    verification_status text NOT NULL DEFAULT 'pending',
    verified_at timestamptz,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tenant_web_tracking_domains_site_org_fkey
        FOREIGN KEY (tracking_site_id, organizacion_id)
        REFERENCES public.tenant_web_tracking_sites(id, organizacion_id)
        ON DELETE CASCADE,

    CONSTRAINT tenant_web_tracking_domains_domain_check
        CHECK (domain = btrim(domain) AND length(domain) BETWEEN 1 AND 253),

    CONSTRAINT tenant_web_tracking_domains_domain_normalized_check
        CHECK (
            domain_normalized = lower(btrim(domain_normalized))
            AND length(domain_normalized) BETWEEN 1 AND 253
            AND domain_normalized LIKE '%.%'
            AND domain_normalized !~ '[^a-z0-9.-]'
            AND domain_normalized !~ '(^[.-]|[.-]$|\.\.|\.-|-\.)'
        ),

    CONSTRAINT tenant_web_tracking_domains_verification_method_check
        CHECK (verification_method IN ('dns', 'html_file', 'manual')),

    CONSTRAINT tenant_web_tracking_domains_verification_status_check
        CHECK (verification_status IN ('pending', 'verified', 'rejected', 'inactive')),

    CONSTRAINT tenant_web_tracking_domains_verified_at_check
        CHECK (
            verification_status <> 'verified'
            OR verified_at IS NOT NULL
        ),

    CONSTRAINT tenant_web_tracking_domains_site_domain_unique
        UNIQUE (tracking_site_id, domain_normalized)
);

COMMENT ON TABLE public.tenant_web_tracking_domains IS
'Dominios autorizados para recibir tracking de una instalación pública del tenant.';

COMMENT ON COLUMN public.tenant_web_tracking_domains.domain_normalized IS
'Host normalizado sin protocolo, ruta, query ni fragmento; se usa para validación e índices.';

CREATE INDEX IF NOT EXISTS tenant_web_tracking_domains_site_idx
    ON public.tenant_web_tracking_domains (tracking_site_id);

CREATE INDEX IF NOT EXISTS tenant_web_tracking_domains_organizacion_idx
    ON public.tenant_web_tracking_domains (organizacion_id);

CREATE INDEX IF NOT EXISTS tenant_web_tracking_domains_lookup_idx
    ON public.tenant_web_tracking_domains (domain_normalized, active, verification_status);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_web_tracking_domains_active_domain_unique
    ON public.tenant_web_tracking_domains (domain_normalized)
    WHERE active = true;

DROP TRIGGER IF EXISTS tenant_web_tracking_sites_touch_updated_at
    ON public.tenant_web_tracking_sites;
CREATE TRIGGER tenant_web_tracking_sites_touch_updated_at
    BEFORE UPDATE ON public.tenant_web_tracking_sites
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS tenant_web_tracking_domains_touch_updated_at
    ON public.tenant_web_tracking_domains;
CREATE TRIGGER tenant_web_tracking_domains_touch_updated_at
    BEFORE UPDATE ON public.tenant_web_tracking_domains
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.tenant_web_tracking_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_web_tracking_sites FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_web_tracking_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_web_tracking_domains FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_web_tracking_sites_member_read
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_member_read
    ON public.tenant_web_tracking_sites
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = (
            SELECT public.usuario_organizacion_id((SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS tenant_web_tracking_sites_admin_write
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_admin_write
    ON public.tenant_web_tracking_sites
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = (
            SELECT public.usuario_organizacion_id((SELECT auth.uid()))
        )
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = (
            SELECT public.usuario_organizacion_id((SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS tenant_web_tracking_sites_service_all
    ON public.tenant_web_tracking_sites;
CREATE POLICY tenant_web_tracking_sites_service_all
    ON public.tenant_web_tracking_sites
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS tenant_web_tracking_domains_member_read
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_member_read
    ON public.tenant_web_tracking_domains
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = (
            SELECT public.usuario_organizacion_id((SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS tenant_web_tracking_domains_admin_write
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_admin_write
    ON public.tenant_web_tracking_domains
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = (
            SELECT public.usuario_organizacion_id((SELECT auth.uid()))
        )
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = (
            SELECT public.usuario_organizacion_id((SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS tenant_web_tracking_domains_service_all
    ON public.tenant_web_tracking_domains;
CREATE POLICY tenant_web_tracking_domains_service_all
    ON public.tenant_web_tracking_domains
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT ON TABLE public.tenant_web_tracking_sites
    TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_web_tracking_sites
    TO authenticated;
GRANT ALL ON TABLE public.tenant_web_tracking_sites
    TO service_role;

GRANT SELECT ON TABLE public.tenant_web_tracking_domains
    TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_web_tracking_domains
    TO authenticated;
GRANT ALL ON TABLE public.tenant_web_tracking_domains
    TO service_role;

COMMIT;

