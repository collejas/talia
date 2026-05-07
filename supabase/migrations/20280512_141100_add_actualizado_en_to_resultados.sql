BEGIN;

ALTER TABLE public.resultados
    ADD COLUMN IF NOT EXISTS actualizado_en timestamptz;

ALTER TABLE public.resultados
    ALTER COLUMN actualizado_en SET DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'resultados_touch_updated_at'
          AND tgrelid = 'public.resultados'::regclass
    ) THEN
        CREATE TRIGGER resultados_touch_updated_at
            BEFORE UPDATE ON public.resultados
            FOR EACH ROW
            EXECUTE FUNCTION public.tg_touch_updated_at();
    END IF;
END
$$;

COMMIT;
