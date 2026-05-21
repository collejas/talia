BEGIN;

ALTER TABLE public.ordenes_compra
    ADD COLUMN IF NOT EXISTS enviada_por_usuario_id uuid,
    ADD COLUMN IF NOT EXISTS enviada_en timestamptz,
    ADD COLUMN IF NOT EXISTS aprobada_en timestamptz;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_enviada_por_usuario_id_fkey
    FOREIGN KEY (enviada_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMIT;
