BEGIN;

-- ============================================================================
-- Tipo para estados de citas demo
-- ============================================================================

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'cita_demo_estado'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.cita_demo_estado AS ENUM (
            'pendiente',
            'confirmada',
            'reprogramada',
            'cancelada',
            'realizada'
        );
    END IF;
END;
$$;

GRANT USAGE ON TYPE public.cita_demo_estado TO postgres, service_role, authenticated;

-- ============================================================================
-- Tabla principal de citas de demostración
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_citas_demo (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tarjeta_id uuid NOT NULL,
    contacto_id uuid NOT NULL,
    conversacion_id uuid,
    start_at timestamptz NOT NULL,
    end_at timestamptz,
    timezone text,
    estado public.cita_demo_estado NOT NULL DEFAULT 'pendiente',
    provider text NOT NULL DEFAULT 'hosting',
    provider_calendar_id text,
    provider_event_id text,
    meeting_url text,
    location text,
    notes text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    cancel_reason text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_citas_demo_provider_check CHECK (
        provider = ANY (ARRAY['hosting','google'])
    ),
    CONSTRAINT lead_citas_demo_time_check CHECK (
        end_at IS NULL OR end_at >= start_at
    )
);

COMMENT ON TABLE public.lead_citas_demo IS
    'Citas de demostración asociadas a leads; sincroniza con calendario externo.';

COMMENT ON COLUMN public.lead_citas_demo.provider IS
    'Origen de la cita (hosting propio vs Google Calendar).';

ALTER TABLE public.lead_citas_demo
    ADD CONSTRAINT lead_citas_demo_tarjeta_id_fkey
        FOREIGN KEY (tarjeta_id) REFERENCES public.lead_tarjetas(id) ON DELETE CASCADE;

ALTER TABLE public.lead_citas_demo
    ADD CONSTRAINT lead_citas_demo_contacto_id_fkey
        FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE CASCADE;

ALTER TABLE public.lead_citas_demo
    ADD CONSTRAINT lead_citas_demo_conversacion_id_fkey
        FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE SET NULL;

ALTER TABLE public.lead_citas_demo
    ADD CONSTRAINT lead_citas_demo_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.lead_citas_demo
    ADD CONSTRAINT lead_citas_demo_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lead_citas_demo_start_idx
    ON public.lead_citas_demo USING btree (start_at);

CREATE INDEX IF NOT EXISTS lead_citas_demo_estado_idx
    ON public.lead_citas_demo USING btree (estado, start_at);

CREATE INDEX IF NOT EXISTS lead_citas_demo_tarjeta_idx
    ON public.lead_citas_demo USING btree (tarjeta_id);

CREATE UNIQUE INDEX IF NOT EXISTS lead_citas_demo_active_unique
    ON public.lead_citas_demo (tarjeta_id)
    WHERE estado IN ('pendiente','confirmada','reprogramada');

-- ============================================================================
-- Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS lead_citas_demo_touch_updated_at ON public.lead_citas_demo;
CREATE TRIGGER lead_citas_demo_touch_updated_at
    BEFORE UPDATE ON public.lead_citas_demo
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP FUNCTION IF EXISTS public.tg_lead_citas_demo_sync_stage();
CREATE FUNCTION public.tg_lead_citas_demo_sync_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tablero_id uuid;
    v_demo_stage uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
        RETURN NEW;
    END IF;

    IF NEW.estado IN ('pendiente','confirmada','reprogramada') THEN
        SELECT lt.tablero_id
          INTO v_tablero_id
          FROM public.lead_tarjetas lt
         WHERE lt.id = NEW.tarjeta_id;

        IF v_tablero_id IS NOT NULL THEN
            SELECT le.id
              INTO v_demo_stage
              FROM public.lead_etapas le
             WHERE le.tablero_id = v_tablero_id
               AND le.codigo = 'demo'
             LIMIT 1;

            IF v_demo_stage IS NOT NULL THEN
                UPDATE public.lead_tarjetas lt
                   SET etapa_id = v_demo_stage
                 WHERE lt.id = NEW.tarjeta_id
                   AND lt.etapa_id <> v_demo_stage;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_lead_citas_demo_sync_stage()
    IS 'Asegura que la tarjeta se mueva a la etapa Demo cuando hay una cita activa.';

DROP TRIGGER IF EXISTS lead_citas_demo_sync_stage ON public.lead_citas_demo;
CREATE TRIGGER lead_citas_demo_sync_stage
    AFTER INSERT OR UPDATE ON public.lead_citas_demo
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_lead_citas_demo_sync_stage();

-- ============================================================================
-- Seguridad (RLS)
-- ============================================================================

ALTER TABLE public.lead_citas_demo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_citas_demo_admin_all ON public.lead_citas_demo;
CREATE POLICY lead_citas_demo_admin_all
    ON public.lead_citas_demo
    FOR ALL
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

DROP POLICY IF EXISTS lead_citas_demo_select ON public.lead_citas_demo;
CREATE POLICY lead_citas_demo_select
    ON public.lead_citas_demo
    FOR SELECT
    USING (public.puede_ver_lead(tarjeta_id));

DROP POLICY IF EXISTS lead_citas_demo_modify ON public.lead_citas_demo;
CREATE POLICY lead_citas_demo_modify
    ON public.lead_citas_demo
    FOR UPDATE
    USING (public.puede_ver_lead(tarjeta_id))
    WITH CHECK (public.puede_ver_lead(tarjeta_id));

DROP POLICY IF EXISTS lead_citas_demo_insert ON public.lead_citas_demo;
CREATE POLICY lead_citas_demo_insert
    ON public.lead_citas_demo
    FOR INSERT
    WITH CHECK (public.puede_ver_lead(tarjeta_id));

DROP POLICY IF EXISTS lead_citas_demo_delete ON public.lead_citas_demo;
CREATE POLICY lead_citas_demo_delete
    ON public.lead_citas_demo
    FOR DELETE
    USING (public.puede_ver_lead(tarjeta_id));

COMMIT;
