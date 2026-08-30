BEGIN;

-- Keep the existing, tested query as a private implementation. The public
-- entry point performs the organization check once, avoiding repeated RLS
-- policy evaluation for every feature in the GeoJSON result.
ALTER FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid)
    RENAME TO crm_propiedades_geojson_impl;

ALTER FUNCTION public.crm_propiedades_geojson_impl(uuid, integer, uuid)
    SECURITY DEFINER
    SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.crm_propiedades_geojson_impl(uuid, integer, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_propiedades_geojson(
    p_organizacion uuid,
    p_nivel integer DEFAULT NULL,
    p_tipo uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY INVOKER
    SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.role() <> 'service_role'
       AND NOT (
           p_organizacion = public.usuario_organizacion_id(auth.uid())
           OR public.es_admin(auth.uid())
       ) THEN
        RAISE EXCEPTION 'organizacion_no_autorizada'
            USING ERRCODE = '42501';
    END IF;

    RETURN public.crm_propiedades_geojson_impl(p_organizacion, p_nivel, p_tipo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid)
    TO authenticated, service_role;

COMMIT;
