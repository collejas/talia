BEGIN;

CREATE TABLE IF NOT EXISTS public.conversaciones_controles (
    conversacion_id uuid PRIMARY KEY REFERENCES public.conversaciones(id) ON DELETE CASCADE,
    manual_override boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_conversaciones_controles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversaciones_controles_touch ON public.conversaciones_controles;
CREATE TRIGGER trg_conversaciones_controles_touch
BEFORE UPDATE ON public.conversaciones_controles
FOR EACH ROW
EXECUTE FUNCTION public.touch_conversaciones_controles_updated_at();

ALTER TABLE public.conversaciones_controles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversaciones_controles_service_role ON public.conversaciones_controles;
CREATE POLICY conversaciones_controles_service_role
ON public.conversaciones_controles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT ALL ON TABLE public.conversaciones_controles TO service_role;

COMMIT;
