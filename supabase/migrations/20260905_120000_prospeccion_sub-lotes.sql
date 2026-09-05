-- Programación jerárquica de prospección: un lote principal con sublotes.
-- Las reglas de negocio se almacenan en columnas explícitas para que puedan
-- consultarse, auditarse y mostrarse en el monitor.

ALTER TABLE public.prospeccion_contacto_batch
    ADD COLUMN IF NOT EXISTS envios_por_lote integer,
    ADD COLUMN IF NOT EXISTS intervalo_entre_lotes_segundos integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_lotes integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS estrategia_plantillas text NOT NULL DEFAULT 'round_robin';

ALTER TABLE public.prospeccion_contacto_batch
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_envios_por_lote_ck,
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_intervalo_lotes_ck,
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_total_lotes_ck,
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_estrategia_plantillas_ck;

ALTER TABLE public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_envios_por_lote_ck
        CHECK (envios_por_lote IS NULL OR envios_por_lote > 0),
    ADD CONSTRAINT prospeccion_contacto_batch_intervalo_lotes_ck
        CHECK (intervalo_entre_lotes_segundos >= 0),
    ADD CONSTRAINT prospeccion_contacto_batch_total_lotes_ck
        CHECK (total_lotes >= 1),
    ADD CONSTRAINT prospeccion_contacto_batch_estrategia_plantillas_ck
        CHECK (estrategia_plantillas IN ('round_robin'));

ALTER TABLE public.prospeccion_contacto_envio
    ADD COLUMN IF NOT EXISTS numero_lote integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS lote_programado_en timestamptz,
    ADD COLUMN IF NOT EXISTS plantilla_id uuid;

ALTER TABLE public.prospeccion_contacto_envio
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_envio_numero_lote_ck;
ALTER TABLE public.prospeccion_contacto_envio
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_envio_plantilla_id_fkey;

ALTER TABLE public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_numero_lote_ck
        CHECK (numero_lote >= 1),
    ADD CONSTRAINT prospeccion_contacto_envio_plantilla_id_fkey
        FOREIGN KEY (plantilla_id)
        REFERENCES public.prospeccion_contacto_templates(id)
        ON DELETE SET NULL;

UPDATE public.prospeccion_contacto_envio
SET lote_programado_en = programado_en
WHERE lote_programado_en IS NULL;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_batch_sub_lotes_idx
    ON public.prospeccion_contacto_batch (organizacion_id, creado_en DESC, estado);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_lote_idx
    ON public.prospeccion_contacto_envio (batch_id, numero_lote, programado_en);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_plantilla_idx
    ON public.prospeccion_contacto_envio (organizacion_id, plantilla_id)
    WHERE plantilla_id IS NOT NULL;

COMMENT ON COLUMN public.prospeccion_contacto_batch.envios_por_lote IS
    'Cantidad máxima de envíos por ventana. NULL conserva una sola ventana.';
COMMENT ON COLUMN public.prospeccion_contacto_batch.intervalo_entre_lotes_segundos IS
    'Separación entre el inicio planificado de una ventana y la siguiente.';
COMMENT ON COLUMN public.prospeccion_contacto_envio.numero_lote IS
    'Número de ventana dentro del lote principal, empezando en 1.';
COMMENT ON COLUMN public.prospeccion_contacto_envio.plantilla_id IS
    'Plantilla exacta utilizada por este envío.';
