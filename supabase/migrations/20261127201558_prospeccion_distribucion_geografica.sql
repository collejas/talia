-- Un corte diario evita trabajo por escritura y consultas al padrón desde el panel.
CREATE MATERIALIZED VIEW public.prospeccion_distribucion_geografica AS
WITH ubicaciones AS MATERIALIZED (
    SELECT organizacion_id, estado_cve, municipio_cve,
           lower(btrim(estado_nombre)) AS estado, lower(btrim(municipio_nombre)) AS municipio,
           count(*) AS cantidad
    FROM public.prospeccion_prospectos
    GROUP BY 1, 2, 3, 4, 5
)
SELECT u.organizacion_id, coalesce(e.clave_entidad, '') AS estado_cve,
       coalesce(m.clave_municipio, '') AS municipio_cve, sum(u.cantidad)::bigint AS cantidad
FROM ubicaciones u
LEFT JOIN LATERAL (
    SELECT clave_entidad FROM public.geo_estados_mexico
    WHERE clave_entidad = u.estado_cve OR u.estado LIKE '%' || lower(nombre) || '%'
    ORDER BY (clave_entidad = u.estado_cve) DESC NULLS LAST, length(nombre) DESC, clave_entidad LIMIT 1
) e ON true
LEFT JOIN LATERAL (
    SELECT clave_municipio FROM public.geo_municipios_mexico
    WHERE clave_entidad = e.clave_entidad
      AND (clave_municipio = u.municipio_cve OR u.municipio LIKE '%' || lower(nombre) || '%')
    ORDER BY (clave_municipio = u.municipio_cve) DESC NULLS LAST, length(nombre) DESC, clave_municipio LIMIT 1
) m ON true
GROUP BY 1, 2, 3;
CREATE UNIQUE INDEX prospeccion_distribucion_geografica_pk
ON public.prospeccion_distribucion_geografica (organizacion_id, estado_cve, municipio_cve);
REVOKE ALL ON public.prospeccion_distribucion_geografica FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.prospeccion_distribucion_por_org(p_organizacion_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(estados) ORDER BY total DESC, label), '[]'::jsonb)
    FROM (
        SELECT d.estado_cve AS value, coalesce(e.nombre,'Sin estado identificado') AS label,
               sum(d.cantidad)::bigint AS total,
               jsonb_agg(jsonb_build_object('value',d.municipio_cve,
                   'label',coalesce(m.nombre,'Sin municipio registrado'),'total',d.cantidad)
                   ORDER BY d.cantidad DESC, m.nombre) AS municipios
        FROM public.prospeccion_distribucion_geografica d
        LEFT JOIN public.geo_estados_mexico e ON e.clave_entidad = d.estado_cve
        LEFT JOIN public.geo_municipios_mexico m ON m.clave_entidad = d.estado_cve AND m.clave_municipio = d.municipio_cve
        WHERE d.organizacion_id = p_organizacion_id AND p_organizacion_id = public.usuario_organizacion_id(auth.uid())
        GROUP BY d.estado_cve,e.nombre
    ) estados;
$$;
REVOKE ALL ON FUNCTION public.prospeccion_distribucion_por_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccion_distribucion_por_org(uuid) TO authenticated;
SELECT cron.schedule('prospeccion-distribucion-diaria','23 8 * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY public.prospeccion_distribucion_geografica');
