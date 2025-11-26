-- Tablas para lotes y envíos de contacto multicanal
CREATE TABLE IF NOT EXISTS public.prospeccion_contacto_batch (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    iniciado_por uuid DEFAULT auth.uid(),
    filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
    canales jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_prospectos integer NOT NULL DEFAULT 0,
    estado text NOT NULL DEFAULT 'pendiente',
    programado_en timestamptz NOT NULL DEFAULT now(),
    finalizado_en timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prospeccion_contacto_envio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES public.prospeccion_contacto_batch(id) ON DELETE CASCADE,
    prospecto_id uuid NOT NULL REFERENCES public.prospeccion_prospectos(id) ON DELETE CASCADE,
    canal text NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente',
    intento_actual integer NOT NULL DEFAULT 0,
    max_reintentos integer NOT NULL DEFAULT 3,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
    mensaje_id text,
    programado_en timestamptz NOT NULL DEFAULT now(),
    procesado_en timestamptz,
    error text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_contacto_envio_unique UNIQUE (batch_id, prospecto_id, canal)
);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_batch_idx
    ON public.prospeccion_contacto_envio (batch_id, canal, estado);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_prospecto_idx
    ON public.prospeccion_contacto_envio (prospecto_id, canal);

-- Enlazar el log con los lotes/envíos
ALTER TABLE public.prospeccion_contactos_log
    ADD COLUMN IF NOT EXISTS envio_id uuid,
    ADD COLUMN IF NOT EXISTS batch_id uuid;

ALTER TABLE public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_envio_id_fkey
        FOREIGN KEY (envio_id) REFERENCES public.prospeccion_contacto_envio(id) ON DELETE SET NULL;

ALTER TABLE public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES public.prospeccion_contacto_batch(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_envio_idx
    ON public.prospeccion_contactos_log (envio_id);

CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_batch_idx
    ON public.prospeccion_contactos_log (batch_id);

-- RLS y políticas
ALTER TABLE public.prospeccion_contacto_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_contacto_envio ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_batch' AND policyname = 'p_select_prospeccion_contacto_batch'
    ) THEN
        CREATE POLICY p_select_prospeccion_contacto_batch
            ON public.prospeccion_contacto_batch
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_batch' AND policyname = 'p_insert_prospeccion_contacto_batch'
    ) THEN
        CREATE POLICY p_insert_prospeccion_contacto_batch
            ON public.prospeccion_contacto_batch
            FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_batch' AND policyname = 'p_update_prospeccion_contacto_batch'
    ) THEN
        CREATE POLICY p_update_prospeccion_contacto_batch
            ON public.prospeccion_contacto_batch
            FOR UPDATE
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_envio' AND policyname = 'p_select_prospeccion_contacto_envio'
    ) THEN
        CREATE POLICY p_select_prospeccion_contacto_envio
            ON public.prospeccion_contacto_envio
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_envio' AND policyname = 'p_insert_prospeccion_contacto_envio'
    ) THEN
        CREATE POLICY p_insert_prospeccion_contacto_envio
            ON public.prospeccion_contacto_envio
            FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_envio' AND policyname = 'p_update_prospeccion_contacto_envio'
    ) THEN
        CREATE POLICY p_update_prospeccion_contacto_envio
            ON public.prospeccion_contacto_envio
            FOR UPDATE
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;
