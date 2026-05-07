BEGIN;

ALTER TABLE public.resultados
    ADD COLUMN IF NOT EXISTS columnarized_at timestamptz;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS columnarized_at timestamptz;

CREATE OR REPLACE FUNCTION public.tg_touch_columnarized_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
BEGIN
    NEW.columnarized_at := COALESCE(NEW.columnarized_at, OLD.columnarized_at, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resultados_touch_columnarized_at ON public.resultados;
CREATE TRIGGER resultados_touch_columnarized_at
BEFORE INSERT OR UPDATE ON public.resultados
FOR EACH ROW
EXECUTE FUNCTION public.tg_touch_columnarized_at();

DROP TRIGGER IF EXISTS prospeccion_prospectos_touch_columnarized_at ON public.prospeccion_prospectos;
CREATE TRIGGER prospeccion_prospectos_touch_columnarized_at
BEFORE INSERT OR UPDATE ON public.prospeccion_prospectos
FOR EACH ROW
EXECUTE FUNCTION public.tg_touch_columnarized_at();

COMMENT ON COLUMN public.resultados.columnarized_at IS 'Marca el primer momento en que la fila fue procesada en columnas hot.';
COMMENT ON COLUMN public.prospeccion_prospectos.columnarized_at IS 'Marca el primer momento en que el prospecto quedó materializado en columnas hot.';

COMMIT;
