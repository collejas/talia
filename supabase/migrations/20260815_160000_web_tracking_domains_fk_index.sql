BEGIN;

-- La FK compuesta debe tener cobertura desde sus dos columnas.
CREATE INDEX IF NOT EXISTS tenant_web_tracking_domains_site_org_idx
    ON public.tenant_web_tracking_domains (tracking_site_id, organizacion_id);

-- El índice anterior queda cubierto por el primer campo del índice compuesto.
DROP INDEX IF EXISTS public.tenant_web_tracking_domains_site_idx;

COMMIT;
