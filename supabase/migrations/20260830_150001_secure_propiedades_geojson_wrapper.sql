ALTER FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid)
    SECURITY DEFINER
    SET search_path = public, pg_temp;
