BEGIN;

-- Soporta el dashboard de leads/oportunidades, que pide filas ordenadas por fecha
-- y embebe la persona principal por FK.
CREATE INDEX IF NOT EXISTS oportunidades_org_creado_en_idx
    ON public.oportunidades (organizacion_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS oportunidades_org_contacto_principal_idx
    ON public.oportunidades (organizacion_id, contacto_principal_id);

COMMIT;
