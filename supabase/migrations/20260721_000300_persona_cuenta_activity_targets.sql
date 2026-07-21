BEGIN;

-- Las actividades nuevas usan personas/cuentas como entidades canónicas.
-- contacto_id se conserva únicamente para compatibilidad histórica.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'actividades_persona_org_fkey'
    ) THEN
        ALTER TABLE public.actividades
            ADD CONSTRAINT actividades_persona_org_fkey
            FOREIGN KEY (organizacion_id, persona_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS actividades_org_persona_estado_idx
    ON public.actividades (organizacion_id, persona_id, estado)
    WHERE persona_id IS NOT NULL;

ALTER TABLE public.ui_notificaciones
    ADD COLUMN IF NOT EXISTS persona_id uuid,
    ADD COLUMN IF NOT EXISTS cuenta_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'ui_notificaciones_persona_org_fkey'
    ) THEN
        ALTER TABLE public.ui_notificaciones
            ADD CONSTRAINT ui_notificaciones_persona_org_fkey
            FOREIGN KEY (organizacion_id, persona_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'ui_notificaciones_cuenta_org_fkey'
    ) THEN
        ALTER TABLE public.ui_notificaciones
            ADD CONSTRAINT ui_notificaciones_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ui_notificaciones_persona_idx
    ON public.ui_notificaciones (organizacion_id, persona_id)
    WHERE persona_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ui_notificaciones_cuenta_idx
    ON public.ui_notificaciones (organizacion_id, cuenta_id)
    WHERE cuenta_id IS NOT NULL;

COMMIT;
