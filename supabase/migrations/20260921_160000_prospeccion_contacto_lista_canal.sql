BEGIN;

-- El canal es una propiedad de negocio de la lista, no un cambio de nombre.
-- Las listas históricas permanecen con NULL y se pueden tratar como genéricas
-- durante la transición.
ALTER TABLE public.prospeccion_contacto_listas
    ADD COLUMN IF NOT EXISTS canal text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_listas_canal_check'
          AND conrelid = 'public.prospeccion_contacto_listas'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_listas
            ADD CONSTRAINT prospeccion_contacto_listas_canal_check
            CHECK (canal IS NULL OR canal IN ('correo', 'whatsapp', 'llamada'));
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_listas_org_canal_idx
    ON public.prospeccion_contacto_listas (organizacion_id, canal, creado_en DESC);

COMMENT ON COLUMN public.prospeccion_contacto_listas.canal IS
    'Canal principal para el que se construyen las reglas de la lista; NULL conserva listas históricas genéricas.';

COMMIT;
