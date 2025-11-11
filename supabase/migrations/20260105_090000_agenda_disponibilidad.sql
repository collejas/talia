BEGIN;

-- ===========================================================================
-- Extensiones requeridas
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ===========================================================================
-- Tabla: agenda_calendarios
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agenda_calendarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    descripcion text,
    owner_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    provider text NOT NULL DEFAULT 'caldav',
    provider_calendar_id text,
    timezone text NOT NULL DEFAULT 'America/Mexico_City',
    capacidad smallint NOT NULL DEFAULT 1 CHECK (capacidad >= 1),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agenda_calendarios_provider_key
    ON public.agenda_calendarios (provider, provider_calendar_id)
    WHERE provider_calendar_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agenda_calendarios_owner_idx
    ON public.agenda_calendarios (owner_usuario_id);

COMMENT ON TABLE public.agenda_calendarios IS
    'Catálogo de calendarios/recurso para disponibilidad de demos.';

-- ===========================================================================
-- Tabla: agenda_disponibilidad
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agenda_disponibilidad (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    calendario_id uuid NOT NULL REFERENCES public.agenda_calendarios(id) ON DELETE CASCADE,
    weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time time NOT NULL,
    end_time time NOT NULL,
    capacidad smallint NOT NULL DEFAULT 1 CHECK (capacidad >= 1),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agenda_disponibilidad_time_check CHECK (end_time > start_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS agenda_disponibilidad_unique
    ON public.agenda_disponibilidad (calendario_id, weekday, start_time, end_time);

CREATE INDEX IF NOT EXISTS agenda_disponibilidad_weekday_idx
    ON public.agenda_disponibilidad (calendario_id, weekday);

COMMENT ON TABLE public.agenda_disponibilidad IS
    'Bloques recurrentes de disponibilidad laboral por calendario.';

-- ===========================================================================
-- Tabla: agenda_excepciones
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agenda_excepciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    calendario_id uuid NOT NULL REFERENCES public.agenda_calendarios(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    tipo text NOT NULL CHECK (tipo = ANY (ARRAY['cerrado','especial','bloqueo','abierto_extra'])),
    start_time time,
    end_time time,
    descripcion text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agenda_excepciones_time_check CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS agenda_excepciones_unique
    ON public.agenda_excepciones (calendario_id, fecha, tipo, COALESCE(start_time, time '00:00'), COALESCE(end_time, time '00:00'));

CREATE INDEX IF NOT EXISTS agenda_excepciones_fecha_idx
    ON public.agenda_excepciones (calendario_id, fecha);

COMMENT ON TABLE public.agenda_excepciones IS
    'Fechas especiales, cierres o ampliaciones de horario para un calendario.';

-- ===========================================================================
-- Tabla: agenda_bloqueos
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agenda_bloqueos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    calendario_id uuid NOT NULL REFERENCES public.agenda_calendarios(id) ON DELETE CASCADE,
    range tstzrange NOT NULL,
    origen text NOT NULL DEFAULT 'manual' CHECK (origen = ANY (ARRAY['manual','caldav','google','api'])),
    descripcion text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agenda_bloqueos_range_check CHECK (lower(range) < upper(range))
);

CREATE INDEX IF NOT EXISTS agenda_bloqueos_calendario_idx
    ON public.agenda_bloqueos (calendario_id);

CREATE INDEX IF NOT EXISTS agenda_bloqueos_range_idx
    ON public.agenda_bloqueos USING gist (range);

COMMENT ON TABLE public.agenda_bloqueos IS
    'Bloqueos ad-hoc o reservas externas que ocupan la agenda.';

-- ===========================================================================
-- Ajustes a public.citas
-- ===========================================================================

ALTER TABLE public.citas
    ADD COLUMN IF NOT EXISTS calendario_id uuid;

ALTER TABLE public.citas
    ADD CONSTRAINT citas_calendario_id_fkey
        FOREIGN KEY (calendario_id) REFERENCES public.agenda_calendarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS citas_calendario_idx
    ON public.citas (calendario_id)
    WHERE calendario_id IS NOT NULL;

-- Función auxiliar para calcular rango de cita (IMMUTABLE)
CREATE OR REPLACE FUNCTION public.cita_slot_range(
    p_start_at timestamptz,
    p_end_at timestamptz
) RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT tstzrange(
        p_start_at,
        COALESCE(p_end_at, p_start_at + INTERVAL '45 minutes')
    )
$$;

-- Constraint para evitar traslapes (capacidad = 1)
ALTER TABLE public.citas
    ADD CONSTRAINT citas_calendario_range_excl
    EXCLUDE USING gist (
        calendario_id WITH =,
        public.cita_slot_range(start_at, end_at) WITH &&
    )
    WHERE (
        calendario_id IS NOT NULL
        AND estado IN ('pendiente','confirmada','reprogramada')
    );

COMMENT ON CONSTRAINT citas_calendario_range_excl ON public.citas IS
    'Evita empalmes de citas activas para el mismo calendario (capacidad 1).';

-- ===========================================================================
-- Triggers de auditoría
-- ===========================================================================

DROP TRIGGER IF EXISTS agenda_calendarios_touch_updated_at ON public.agenda_calendarios;
CREATE TRIGGER agenda_calendarios_touch_updated_at
    BEFORE UPDATE ON public.agenda_calendarios
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS agenda_disponibilidad_touch_updated_at ON public.agenda_disponibilidad;
CREATE TRIGGER agenda_disponibilidad_touch_updated_at
    BEFORE UPDATE ON public.agenda_disponibilidad
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS agenda_excepciones_touch_updated_at ON public.agenda_excepciones;
CREATE TRIGGER agenda_excepciones_touch_updated_at
    BEFORE UPDATE ON public.agenda_excepciones
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS agenda_bloqueos_touch_updated_at ON public.agenda_bloqueos;
CREATE TRIGGER agenda_bloqueos_touch_updated_at
    BEFORE UPDATE ON public.agenda_bloqueos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

COMMIT;
