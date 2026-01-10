BEGIN;

CREATE OR REPLACE FUNCTION public.tg_set_organizacion_id() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
    v_org uuid;
    v_row jsonb;
    v_metadata jsonb;
    v_metadata_org text;
BEGIN
    IF NEW.organizacion_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_row := row_to_json(NEW)::jsonb;
    v_metadata := COALESCE(
        v_row -> 'metadata',
        v_row -> 'metadatos',
        v_row -> 'meta',
        '{}'::jsonb
    );

    v_metadata_org := (v_metadata ->> 'organizacion_id')::text;
    IF v_metadata_org IS NOT NULL AND v_metadata_org <> '' THEN
        BEGIN
            v_org := v_metadata_org::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                v_org := NULL;
        END;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;

    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
            USING ERRCODE = '23514';
    END IF;

    NEW.organizacion_id := v_org;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_set_organizacion_id() IS 'Asigna organizacion_id primero desde metadata cuando existe, luego desde auth.uid().';

COMMIT;
