BEGIN;

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_row jsonb := to_jsonb(NEW);
BEGIN
    IF v_row ? 'actualizado_en' THEN
        NEW.actualizado_en := now();
    ELSIF v_row ? 'updated_at' THEN
        NEW.updated_at := now();
    ELSE
        RAISE EXCEPTION
            'tg_touch_updated_at: la tabla %.% no tiene columnas actualizado_en ni updated_at',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_touch_updated_at()
    IS 'Actualiza la columna actualizado_en o updated_at al momento actual, según exista.';

COMMIT;
