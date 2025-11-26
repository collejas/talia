-- Extend fuente_resultado enum with manual source
ALTER TYPE public.fuente_resultado
    ADD VALUE IF NOT EXISTS 'usuario';

-- Add auditing columns for authorship
ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS creado_por uuid,
    ADD COLUMN IF NOT EXISTS actualizado_por uuid;

ALTER TABLE public.prospeccion_prospectos
    ALTER COLUMN creado_por SET DEFAULT auth.uid();

ALTER TABLE public.prospeccion_prospectos
    ALTER COLUMN actualizado_por SET DEFAULT auth.uid();

-- Ensure existing rows have some actualizado_por reference
UPDATE public.prospeccion_prospectos
SET actualizado_por = COALESCE(actualizado_por, creado_por)
WHERE actualizado_por IS NULL;

-- Function to stamp actor info on insert/update
CREATE OR REPLACE FUNCTION public.tg_prospecto_set_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_actor uuid;
BEGIN
    v_actor := auth.uid();

    IF TG_OP = 'INSERT' THEN
        IF v_actor IS NOT NULL THEN
            NEW.creado_por := COALESCE(NEW.creado_por, v_actor);
            NEW.actualizado_por := COALESCE(NEW.actualizado_por, v_actor);
        ELSE
            NEW.actualizado_por := COALESCE(NEW.actualizado_por, NEW.creado_por);
        END IF;
        RETURN NEW;
    END IF;

    IF v_actor IS NOT NULL THEN
        NEW.actualizado_por := v_actor;
    ELSE
        NEW.actualizado_por := COALESCE(NEW.actualizado_por, OLD.actualizado_por, OLD.creado_por);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_prospeccion_prospectos_actor ON public.prospeccion_prospectos;
CREATE TRIGGER t_prospeccion_prospectos_actor
    BEFORE INSERT OR UPDATE ON public.prospeccion_prospectos
    FOR EACH ROW EXECUTE FUNCTION public.tg_prospecto_set_actor();

-- Audit table to capture history of changes
CREATE TABLE IF NOT EXISTS public.prospeccion_prospectos_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prospecto_id uuid NOT NULL REFERENCES public.prospeccion_prospectos(id) ON DELETE CASCADE,
    accion text NOT NULL,
    cambios jsonb NOT NULL,
    realizado_por uuid,
    realizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_audit_prospecto_idx
    ON public.prospeccion_prospectos_audit (prospecto_id, realizado_en DESC);

ALTER TABLE public.prospeccion_prospectos_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_prospectos_audit'
          AND policyname = 'p_select_prospeccion_prospectos_audit'
    ) THEN
        CREATE POLICY p_select_prospeccion_prospectos_audit
            ON public.prospeccion_prospectos_audit
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_prospectos_audit'
          AND policyname = 'p_insert_prospeccion_prospectos_audit'
    ) THEN
        CREATE POLICY p_insert_prospeccion_prospectos_audit
            ON public.prospeccion_prospectos_audit
            FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
END;
$$;

-- Trigger that writes to audit log
CREATE OR REPLACE FUNCTION public.tg_prospeccion_prospectos_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor uuid;
    v_payload jsonb;
    v_prospecto_id uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_payload := to_jsonb(NEW);
        v_prospecto_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_payload := jsonb_build_object(
            'before', to_jsonb(OLD),
            'after', to_jsonb(NEW)
        );
        v_prospecto_id := NEW.id;
    ELSE
        v_payload := to_jsonb(OLD);
        v_prospecto_id := OLD.id;
    END IF;

    v_actor := auth.uid();
    IF v_actor IS NULL THEN
        IF TG_OP = 'INSERT' THEN
            v_actor := NEW.creado_por;
        ELSIF TG_OP = 'UPDATE' THEN
            v_actor := COALESCE(NEW.actualizado_por, OLD.actualizado_por, OLD.creado_por);
        ELSE
            v_actor := COALESCE(OLD.actualizado_por, OLD.creado_por);
        END IF;
    END IF;

    INSERT INTO public.prospeccion_prospectos_audit (prospecto_id, accion, cambios, realizado_por)
    VALUES (v_prospecto_id, lower(TG_OP), v_payload, v_actor);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_prospeccion_prospectos_audit ON public.prospeccion_prospectos;
CREATE TRIGGER t_prospeccion_prospectos_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.prospeccion_prospectos
    FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccion_prospectos_audit();
