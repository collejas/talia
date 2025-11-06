BEGIN;

-- ============================================================================
-- Índices adicionales para agilizar consultas y conciliaciones de citas
-- ============================================================================

-- Búsqueda rápida por identificador de evento externo (integraciones calendario)
CREATE INDEX IF NOT EXISTS citas_provider_event_id_idx
    ON public.citas USING btree (provider_event_id)
    WHERE provider_event_id IS NOT NULL;

-- Filtros y métricas por creador de la cita (panel, reportes, automatizaciones)
CREATE INDEX IF NOT EXISTS citas_created_by_idx
    ON public.citas USING btree (created_by)
    WHERE created_by IS NOT NULL;

-- Seguimiento de responsables de actualización (auditoría, reconciliaciones)
CREATE INDEX IF NOT EXISTS citas_updated_by_idx
    ON public.citas USING btree (updated_by)
    WHERE updated_by IS NOT NULL;

COMMIT;
