BEGIN;

-- ===========================================================================
-- Extensiones requeridas
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ===========================================================================
-- Función auxiliar para rangos de cita
-- ===========================================================================

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

COMMENT ON FUNCTION public.cita_slot_range(timestamptz, timestamptz) IS
    'Devuelve el rango de la cita asegurando duración mínima de 45 minutos cuando end_at es NULL.';

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'citas_calendario_id_fkey'
          AND conrelid = 'public.citas'::regclass
    ) THEN
        ALTER TABLE public.citas
            ADD CONSTRAINT citas_calendario_id_fkey
            FOREIGN KEY (calendario_id) REFERENCES public.agenda_calendarios(id) ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS citas_calendario_idx
    ON public.citas (calendario_id)
    WHERE calendario_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'citas_calendario_range_excl'
          AND conrelid = 'public.citas'::regclass
    ) THEN
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
    END IF;
END;
$$;

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

-- ===========================================================================
-- Función: fn_agenda_slots_disponibles
-- ===========================================================================

DROP FUNCTION IF EXISTS public.fn_agenda_slots_disponibles(uuid, date, date, integer, integer, text, integer, uuid);
DROP FUNCTION IF EXISTS public.fn_agenda_slots_disponibles(uuid, date, date, uuid, integer, integer, text, integer, uuid);

CREATE OR REPLACE FUNCTION public.fn_agenda_slots_disponibles(
    p_conversacion_id uuid,
    p_fecha_inicio date,
    p_fecha_fin date,
    p_calendario_id uuid DEFAULT NULL,
    p_slot_minutes integer DEFAULT 45,
    p_buffer_minutes integer DEFAULT 15,
    p_timezone text DEFAULT NULL,
    p_max_slots integer DEFAULT 100,
    p_exclude_cita_id uuid DEFAULT NULL
) RETURNS TABLE (
    calendario_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    timezone text,
    capacidad integer,
    source text,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_calendario uuid;
    v_timezone text;
    v_slot_minutes integer := COALESCE(p_slot_minutes, 45);
    v_buffer_minutes integer := GREATEST(COALESCE(p_buffer_minutes, 15), 0);
    v_slot_interval interval := make_interval(mins => v_slot_minutes);
    v_buffer_interval interval := make_interval(mins => v_buffer_minutes);
    v_max integer := GREATEST(COALESCE(p_max_slots, 100), 1);
    v_fecha_inicio date := p_fecha_inicio;
    v_fecha_fin date := p_fecha_fin;
    v_window_start timestamptz;
    v_window_end timestamptz;
BEGIN
    IF v_fecha_inicio IS NULL OR v_fecha_fin IS NULL THEN
        RAISE EXCEPTION 'fecha_requerida' USING ERRCODE = '22004';
    END IF;
    IF v_fecha_fin < v_fecha_inicio THEN
        RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22007';
    END IF;

    IF p_calendario_id IS NOT NULL THEN
        SELECT id, timezone INTO v_calendario, v_timezone
        FROM public.agenda_calendarios
        WHERE id = p_calendario_id AND activo IS TRUE
        LIMIT 1;
    ELSE
        SELECT id, timezone INTO v_calendario, v_timezone
        FROM public.agenda_calendarios
        WHERE activo IS TRUE
        ORDER BY creado_en
        LIMIT 1;
    END IF;

    IF v_calendario IS NULL THEN
        RAISE EXCEPTION 'calendario_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF p_timezone IS NOT NULL AND btrim(p_timezone) <> '' THEN
        v_timezone := p_timezone;
    END IF;
    IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
        v_timezone := 'America/Mexico_City';
    END IF;

    v_window_start := (v_fecha_inicio::timestamp AT TIME ZONE v_timezone);
    v_window_end := ((v_fecha_fin + 1)::timestamp AT TIME ZONE v_timezone);

    RETURN QUERY
    WITH dias AS (
        SELECT generate_series(v_fecha_inicio, v_fecha_fin, interval '1 day')::date AS day_date
    ),
    cerrados AS (
        SELECT fecha
        FROM public.agenda_excepciones
        WHERE calendario_id = v_calendario
          AND tipo = 'cerrado'
          AND fecha BETWEEN v_fecha_inicio AND v_fecha_fin
    ),
    especiales AS (
        SELECT
            fecha,
            tipo,
            start_time,
            end_time,
            COALESCE((metadata ->> 'capacidad')::int, 1) AS capacidad,
            metadata
        FROM public.agenda_excepciones
        WHERE calendario_id = v_calendario
          AND tipo IN ('especial','abierto_extra')
          AND fecha BETWEEN v_fecha_inicio AND v_fecha_fin
          AND start_time IS NOT NULL
          AND end_time IS NOT NULL
    ),
    base_blocks AS (
        SELECT
            d.day_date,
            ad.start_time,
            ad.end_time,
            ad.capacidad,
            'base'::text AS source,
            '{}'::jsonb AS metadata
        FROM dias d
        JOIN public.agenda_disponibilidad ad
          ON ad.calendario_id = v_calendario
         AND ad.activo IS TRUE
         AND ((extract(dow FROM d.day_date)::int + 6) % 7) = ad.weekday
        WHERE d.day_date NOT IN (SELECT fecha FROM cerrados)
          AND d.day_date NOT IN (SELECT fecha FROM especiales WHERE tipo = 'especial')
    ),
    especial_blocks AS (
        SELECT
            e.fecha AS day_date,
            e.start_time,
            e.end_time,
            e.capacidad,
            CASE WHEN e.tipo = 'especial' THEN 'especial' ELSE 'extra' END AS source,
            e.metadata
        FROM especiales e
    ),
    all_blocks AS (
        SELECT * FROM base_blocks
        UNION ALL
        SELECT * FROM especial_blocks
    ),
    blocks_local AS (
        SELECT
            day_date,
            (day_date + start_time)::timestamp AS local_start,
            (day_date + end_time)::timestamp AS local_end,
            capacidad,
            source,
            metadata
        FROM all_blocks
        WHERE end_time > start_time
    ),
    blocks_tz AS (
        SELECT
            day_date,
            (local_start AT TIME ZONE v_timezone) AS block_start,
            (local_end AT TIME ZONE v_timezone) AS block_end,
            capacidad,
            source,
            metadata
        FROM blocks_local
    ),
    busy_citas AS (
        SELECT public.cita_slot_range(start_at, end_at) AS slot_range
        FROM public.citas
        WHERE calendario_id = v_calendario
          AND estado IN ('pendiente','confirmada','reprogramada')
          AND (p_exclude_cita_id IS NULL OR id <> p_exclude_cita_id)
          AND public.cita_slot_range(start_at, end_at) && tstzrange(v_window_start, v_window_end, '[)')
    ),
    busy_bloqueos AS (
        SELECT range AS slot_range
        FROM public.agenda_bloqueos
        WHERE calendario_id = v_calendario
          AND range && tstzrange(v_window_start, v_window_end, '[)')
    ),
    busy_all AS (
        SELECT slot_range FROM busy_citas
        UNION ALL
        SELECT slot_range FROM busy_bloqueos
    ),
    busy_buffer AS (
        SELECT
            tstzrange(
                lower(slot_range) - v_buffer_interval,
                upper(slot_range) + v_buffer_interval,
                '[)'
            ) AS slot_range
        FROM busy_all
    ),
    candidate_slots AS (
        SELECT
            bt.block_start,
            bt.block_end,
            bt.capacidad,
            bt.source,
            bt.metadata,
            gs AS slot_start,
            gs + v_slot_interval AS slot_end
        FROM blocks_tz bt
        CROSS JOIN LATERAL generate_series(
            bt.block_start,
            bt.block_end - v_slot_interval,
            v_slot_interval
        ) AS gs
        WHERE bt.block_end > bt.block_start
    ),
    filtered_slots AS (
        SELECT cs.*
        FROM candidate_slots cs
        WHERE cs.slot_end <= cs.block_end
          AND NOT EXISTS (
              SELECT 1
              FROM busy_buffer bb
              WHERE bb.slot_range && tstzrange(cs.slot_start, cs.slot_end, '[)')
          )
          AND (
              SELECT COUNT(*)
              FROM public.citas c
              WHERE c.calendario_id = v_calendario
                AND c.estado IN ('pendiente','confirmada','reprogramada')
                AND (p_exclude_cita_id IS NULL OR c.id <> p_exclude_cita_id)
                AND public.cita_slot_range(c.start_at, c.end_at) && tstzrange(cs.slot_start, cs.slot_end, '[)')
          ) < cs.capacidad
    )
    SELECT
        v_calendario AS calendario_id,
        fs.slot_start AS start_at,
        fs.slot_end AS end_at,
        v_timezone AS timezone,
        fs.capacidad,
        fs.source,
        fs.metadata || jsonb_build_object(
            'local_date', to_char(fs.slot_start AT TIME ZONE v_timezone, 'YYYY-MM-DD'),
            'local_time', to_char(fs.slot_start AT TIME ZONE v_timezone, 'HH24:MI'),
            'weekday', ((extract(dow FROM (fs.slot_start AT TIME ZONE v_timezone))::int + 6) % 7)
        )
    FROM filtered_slots fs
    ORDER BY fs.slot_start
    LIMIT v_max;

END;
$$;

COMMENT ON FUNCTION public.fn_agenda_slots_disponibles(
    uuid, date, date, uuid, integer, integer, text, integer, uuid
) IS 'Calcula slots disponibles considerando disponibilidad recurrente, excepciones, citas activas y bloqueos.';

-- Wrapper para compatibilidad con firmas anteriores (sin calendario explícito)
CREATE OR REPLACE FUNCTION public.fn_agenda_slots_disponibles(
    p_conversacion_id uuid,
    p_fecha_inicio date,
    p_fecha_fin date,
    p_slot_minutes integer,
    p_buffer_minutes integer,
    p_timezone text,
    p_max_slots integer,
    p_exclude_cita_id uuid
) RETURNS TABLE (
    calendario_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    timezone text,
    capacidad integer,
    source text,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.fn_agenda_slots_disponibles(
        p_conversacion_id,
        p_fecha_inicio,
        p_fecha_fin,
        NULL,
        p_slot_minutes,
        p_buffer_minutes,
        p_timezone,
        p_max_slots,
        p_exclude_cita_id
    );
END;
$$;

-- ===========================================================================
-- Función: fn_cita_schedule
-- ===========================================================================

DROP FUNCTION IF EXISTS public.fn_cita_schedule(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, uuid, uuid, text, text, boolean
);
DROP FUNCTION IF EXISTS public.fn_cita_schedule(
    uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, jsonb, text, text, uuid, uuid, text, text, boolean
);

CREATE OR REPLACE FUNCTION public.fn_cita_schedule(
    p_tarjeta_id uuid,
    p_contacto_id uuid,
    p_conversacion_id uuid,
    p_start_at timestamptz,
    p_calendario_id uuid DEFAULT NULL,
    p_end_at timestamptz DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_provider text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_updated_by uuid DEFAULT NULL,
    p_scheduled_via text DEFAULT 'ia',
    p_reminder_status text DEFAULT NULL,
    p_merge_metadata boolean DEFAULT TRUE
) RETURNS public.citas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_calendario uuid;
    v_timezone text;
    v_provider text;
    v_row public.citas;
    v_end_at timestamptz;
    v_slot_minutes integer;
    v_slot record;
    v_start_day date;
BEGIN
    IF p_tarjeta_id IS NULL OR p_contacto_id IS NULL THEN
        RAISE EXCEPTION 'tarjeta_y_contacto_requeridos' USING ERRCODE = '23514';
    END IF;
    IF p_start_at IS NULL THEN
        RAISE EXCEPTION 'start_at_requerido' USING ERRCODE = '23514';
    END IF;

    v_end_at := COALESCE(p_end_at, p_start_at + INTERVAL '45 minutes');
    v_slot_minutes := GREATEST(CEIL(EXTRACT(EPOCH FROM (v_end_at - p_start_at)) / 60)::int, 1);

    IF p_calendario_id IS NOT NULL THEN
        SELECT id, timezone, provider INTO v_calendario, v_timezone, v_provider
        FROM public.agenda_calendarios
        WHERE id = p_calendario_id AND activo IS TRUE
        LIMIT 1;
    ELSE
        SELECT id, timezone, provider INTO v_calendario, v_timezone, v_provider
        FROM public.agenda_calendarios
        WHERE activo IS TRUE
        ORDER BY creado_en
        LIMIT 1;
    END IF;

    IF v_calendario IS NULL THEN
        RAISE EXCEPTION 'calendario_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF p_timezone IS NOT NULL AND btrim(p_timezone) <> '' THEN
        v_timezone := p_timezone;
    END IF;
    IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
        v_timezone := 'America/Mexico_City';
    END IF;

    v_provider := lower(COALESCE(p_provider, v_provider, 'hosting'));
    IF v_provider NOT IN ('hosting','google','caldav') THEN
        RAISE EXCEPTION 'provider_invalid' USING ERRCODE = '23514';
    END IF;

    v_start_day := (p_start_at AT TIME ZONE v_timezone)::date;
    SELECT *
    INTO v_slot
    FROM public.fn_agenda_slots_disponibles(
        NULL::uuid,
        v_start_day,
        v_start_day,
        v_calendario,
        v_slot_minutes,
        15,
        v_timezone,
        24,
        NULL
    )
    WHERE start_at = p_start_at;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'slot_not_available' USING ERRCODE = 'P0001';
    END IF;

    SELECT public.fn_cita_upsert(
        p_tarjeta_id => p_tarjeta_id,
        p_contacto_id => p_contacto_id,
        p_conversacion_id => p_conversacion_id,
        p_start_at => p_start_at,
        p_end_at => v_end_at,
        p_timezone => v_timezone,
        p_provider => v_provider,
        p_notes => p_notes,
        p_metadata => p_metadata,
        p_created_by => p_created_by,
        p_updated_by => p_updated_by,
        p_merge_metadata => p_merge_metadata,
        p_reminder_status => p_reminder_status,
        p_scheduled_via => COALESCE(lower(p_scheduled_via), 'ia')
    )
    INTO v_row;

    UPDATE public.citas
    SET calendario_id = v_calendario
    WHERE id = v_row.id
      AND (calendario_id IS DISTINCT FROM v_calendario);

    SELECT * INTO v_row FROM public.citas WHERE id = v_row.id;

    RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.fn_cita_schedule(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, uuid, uuid, text, text, boolean
) IS 'Agenda una cita validando disponibilidad real y asignando calendario.';

CREATE OR REPLACE FUNCTION public.fn_cita_schedule(
    p_calendario_id uuid,
    p_tarjeta_id uuid,
    p_contacto_id uuid,
    p_conversacion_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_provider text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_updated_by uuid DEFAULT NULL,
    p_scheduled_via text DEFAULT 'ia',
    p_reminder_status text DEFAULT NULL,
    p_merge_metadata boolean DEFAULT TRUE
) RETURNS public.citas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN public.fn_cita_schedule(
        p_tarjeta_id => p_tarjeta_id,
        p_contacto_id => p_contacto_id,
        p_conversacion_id => p_conversacion_id,
        p_start_at => p_start_at,
        p_calendario_id => p_calendario_id,
        p_end_at => p_end_at,
        p_timezone => p_timezone,
        p_metadata => p_metadata,
        p_notes => p_notes,
        p_provider => p_provider,
        p_created_by => p_created_by,
        p_updated_by => p_updated_by,
        p_scheduled_via => p_scheduled_via,
        p_reminder_status => p_reminder_status,
        p_merge_metadata => p_merge_metadata
    );
END;
$$;

COMMENT ON FUNCTION public.fn_cita_schedule(
    uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, jsonb, text, text, uuid, uuid, text, text, boolean
) IS 'Agenda una cita validando disponibilidad real y asignando calendario (wrapper compatibilidad).';

-- ===========================================================================
-- Función: fn_cita_reschedule
-- ===========================================================================

DROP FUNCTION IF EXISTS public.fn_cita_reschedule(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid, boolean, text, text
);

CREATE OR REPLACE FUNCTION public.fn_cita_reschedule(
    p_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_expected_updated_at timestamptz DEFAULT NULL,
    p_updated_by uuid DEFAULT NULL,
    p_merge_metadata boolean DEFAULT TRUE,
    p_scheduled_via text DEFAULT NULL,
    p_reminder_status text DEFAULT NULL
) RETURNS public.citas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_existing public.citas;
    v_end_at timestamptz;
    v_slot_minutes integer;
    v_timezone text;
    v_start_day date;
    v_row public.citas;
BEGIN
    IF p_id IS NULL THEN
        RAISE EXCEPTION 'cita_id_requerido' USING ERRCODE = '23514';
    END IF;

    SELECT *
    INTO v_existing
    FROM public.citas
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'cita_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_existing.calendario_id IS NULL THEN
        RAISE EXCEPTION 'calendario_not_assigned' USING ERRCODE = '23502';
    END IF;

    v_end_at := COALESCE(p_end_at, p_start_at, v_existing.end_at, v_existing.start_at + INTERVAL '45 minutes');
    IF p_start_at IS NULL THEN
        p_start_at := v_existing.start_at;
    END IF;

    v_slot_minutes := GREATEST(CEIL(EXTRACT(EPOCH FROM (v_end_at - p_start_at)) / 60)::int, 1);

    v_timezone := COALESCE(p_timezone, v_existing.timezone, 'America/Mexico_City');
    IF btrim(v_timezone) = '' THEN
        v_timezone := 'America/Mexico_City';
    END IF;

    v_start_day := (p_start_at AT TIME ZONE v_timezone)::date;

    PERFORM 1
    FROM public.fn_agenda_slots_disponibles(
        NULL::uuid,
        v_start_day,
        v_start_day,
        v_existing.calendario_id,
        v_slot_minutes,
        15,
        v_timezone,
        24,
        p_id
    )
    WHERE start_at = p_start_at;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'slot_not_available' USING ERRCODE = 'P0001';
    END IF;

    SELECT public.fn_cita_upsert(
        p_id => p_id,
        p_start_at => p_start_at,
        p_end_at => v_end_at,
        p_timezone => v_timezone,
        p_metadata => p_metadata,
        p_notes => p_notes,
        p_updated_by => p_updated_by,
        p_merge_metadata => p_merge_metadata,
        p_expected_updated_at => p_expected_updated_at,
        p_reminder_status => p_reminder_status,
        p_scheduled_via => COALESCE(lower(p_scheduled_via), v_existing.scheduled_via)
    )
    INTO v_row;

    RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.fn_cita_reschedule(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid, boolean, text, text
) IS 'Reprograma una cita validando que el nuevo horario siga disponible.';

COMMIT;
