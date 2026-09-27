BEGIN;

-- Cada tenant puede tener una sola instalación activa. Las instalaciones
-- históricas inactivas se conservan para no romper referencias o auditoría.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_web_tracking_sites_one_active_per_org
    ON public.tenant_web_tracking_sites (organizacion_id)
    WHERE active = true;

COMMENT ON INDEX public.tenant_web_tracking_sites_one_active_per_org IS
'Impide más de una instalación activa de tracking web por tenant.';

COMMIT;
