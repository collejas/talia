-- En producción, precrear este índice con CREATE INDEX CONCURRENTLY fuera de
-- una transacción para mantener disponibles las escrituras durante su construcción.
CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_estado_nombre_idx
    ON public.prospeccion_prospectos (organizacion_id, estado_nombre)
    WHERE estado_nombre IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prospeccion_estados_disponibles(p_organizacion_id uuid)
RETURNS TABLE (value text, label text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
    -- Saltar al siguiente nombre por índice, incluso cuando se repite en miles de filas.
    WITH RECURSIVE nombres(nombre) AS (
        (SELECT p.estado_nombre FROM public.prospeccion_prospectos p
         WHERE p.organizacion_id = p_organizacion_id AND p.estado_nombre IS NOT NULL
         ORDER BY p.estado_nombre LIMIT 1)
        UNION ALL
        SELECT siguiente.estado_nombre FROM nombres n
        CROSS JOIN LATERAL (
            SELECT p.estado_nombre FROM public.prospeccion_prospectos p
            WHERE p.organizacion_id = p_organizacion_id AND p.estado_nombre > n.nombre
            ORDER BY p.estado_nombre LIMIT 1
        ) siguiente
    )
    SELECT e.clave_entidad, e.nombre FROM public.geo_estados_mexico e
    WHERE EXISTS (
        SELECT FROM public.prospeccion_prospectos p
        WHERE p.organizacion_id = p_organizacion_id AND p.estado_cve = e.clave_entidad
    ) OR EXISTS (
        SELECT FROM nombres n WHERE n.nombre ILIKE '%' || e.nombre || '%'
    );
$$;

REVOKE ALL ON FUNCTION public.prospeccion_estados_disponibles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccion_estados_disponibles(uuid) TO authenticated, service_role;
