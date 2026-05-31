BEGIN;

ALTER TABLE public.direcciones
    ADD COLUMN IF NOT EXISTS colonia text;

UPDATE public.direcciones
SET colonia = COALESCE(NULLIF(btrim(colonia), ''), NULLIF(btrim(nombre_asentamiento), ''))
WHERE colonia IS NULL OR btrim(colonia) = '';

UPDATE public.direcciones
SET nombre_asentamiento = COALESCE(NULLIF(btrim(nombre_asentamiento), ''), NULLIF(btrim(colonia), ''))
WHERE nombre_asentamiento IS NULL OR btrim(nombre_asentamiento) = '';

COMMENT ON COLUMN public.direcciones.colonia IS 'Colonia canónica del domicilio. Compatibilidad con nombre_asentamiento.';

COMMIT;
