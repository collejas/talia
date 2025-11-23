-- Función auxiliar para cron jobs: alerta cuando falten etapas canónicas.

CREATE OR REPLACE FUNCTION public.check_missing_pipeline_stages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    missing jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO missing
    FROM public.organizaciones_missing_etapas_pipeline t;

    IF jsonb_array_length(missing) = 0 THEN
        RETURN;
    END IF;

    RAISE EXCEPTION USING
        MESSAGE = 'missing_pipeline_stages',
        DETAIL = missing::text;
END;
$$;

COMMENT ON FUNCTION public.check_missing_pipeline_stages() IS
    'Lanza una excepción si algún tenant no tiene las etapas canónicas; úsala en jobs/cron (SELECT check_missing_pipeline_stages()).';

GRANT EXECUTE ON FUNCTION public.check_missing_pipeline_stages() TO authenticated, service_role;
