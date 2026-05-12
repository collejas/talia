BEGIN;

ALTER TABLE public.notas
    ADD COLUMN IF NOT EXISTS actividad_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'notas_actividad_org_fkey'
    ) THEN
        ALTER TABLE public.notas
            ADD CONSTRAINT notas_actividad_org_fkey
            FOREIGN KEY (organizacion_id, actividad_id)
            REFERENCES public.actividades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS notas_actividad_idx
    ON public.notas (organizacion_id, actividad_id)
    WHERE actividad_id IS NOT NULL;

ALTER TABLE public.actividades
    ADD COLUMN IF NOT EXISTS completado_en timestamptz,
    ADD COLUMN IF NOT EXISTS cancelado_en timestamptz,
    ADD COLUMN IF NOT EXISTS cerrado_por_usuario_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS actividades_org_id_id_key
    ON public.actividades (organizacion_id, id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'actividades_cerrado_por_usuario_org_fkey'
    ) THEN
        ALTER TABLE public.actividades
            ADD CONSTRAINT actividades_cerrado_por_usuario_org_fkey
            FOREIGN KEY (organizacion_id, cerrado_por_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS actividades_org_estado_recordatorio_idx
    ON public.actividades (organizacion_id, estado, recordatorio_en)
    WHERE recordatorio_en IS NOT NULL;

CREATE INDEX IF NOT EXISTS actividades_org_asignado_estado_idx
    ON public.actividades (organizacion_id, asignado_a_usuario_id, estado);

CREATE INDEX IF NOT EXISTS actividades_org_oportunidad_estado_idx
    ON public.actividades (organizacion_id, oportunidad_id, estado);

ALTER TABLE public.ui_notificaciones
    ADD COLUMN IF NOT EXISTS actividad_id uuid,
    ADD COLUMN IF NOT EXISTS oportunidad_id uuid,
    ADD COLUMN IF NOT EXISTS contacto_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'ui_notificaciones_actividad_org_fkey'
    ) THEN
        ALTER TABLE public.ui_notificaciones
            ADD CONSTRAINT ui_notificaciones_actividad_org_fkey
            FOREIGN KEY (organizacion_id, actividad_id)
            REFERENCES public.actividades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'ui_notificaciones_oportunidad_org_fkey'
    ) THEN
        ALTER TABLE public.ui_notificaciones
            ADD CONSTRAINT ui_notificaciones_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'ui_notificaciones_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.ui_notificaciones
            ADD CONSTRAINT ui_notificaciones_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ui_notificaciones_actividad_idx
    ON public.ui_notificaciones (organizacion_id, actividad_id)
    WHERE actividad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ui_notificaciones_oportunidad_idx
    ON public.ui_notificaciones (organizacion_id, oportunidad_id)
    WHERE oportunidad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ui_notificaciones_contacto_idx
    ON public.ui_notificaciones (organizacion_id, contacto_id)
    WHERE contacto_id IS NOT NULL;

COMMIT;
