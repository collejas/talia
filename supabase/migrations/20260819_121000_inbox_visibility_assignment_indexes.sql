BEGIN;

-- The visibility predicate resolves opportunities by contact/person and
-- account. The existing persona/account indexes cover two branches; this
-- index covers the legacy contact-principal branch without a tenant-wide
-- scan for every Inbox thread.
CREATE INDEX IF NOT EXISTS oportunidades_org_contacto_principal_idx
    ON public.oportunidades (organizacion_id, contacto_principal_id)
    WHERE contacto_principal_id IS NOT NULL;

COMMIT;
