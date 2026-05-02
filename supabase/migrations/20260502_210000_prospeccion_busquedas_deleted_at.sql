BEGIN;

ALTER TABLE public.busquedas
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.busquedas.deleted_at IS
    'Marca de eliminación lógica para búsquedas que se purgan en segundo plano.';

CREATE INDEX IF NOT EXISTS busquedas_denue_active_org_idx
    ON public.busquedas (organizacion_id, creado_en DESC)
    WHERE fuente = 'denue' AND deleted_at IS NULL;

COMMIT;
