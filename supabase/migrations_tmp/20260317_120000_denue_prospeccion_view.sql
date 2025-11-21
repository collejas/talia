CREATE OR REPLACE VIEW public.v_denue_contactables AS
 SELECT r.id AS resultado_id,
    r.busqueda_id,
    r.fuente AS fuente_resultado,
    b.fuente AS fuente_busqueda,
    r.external_id,
    COALESCE(NULLIF(r.name, ''), NULLIF(r.razon_social, '')) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    COALESCE(NULLIF(r.phone, ''), NULLIF(r.raw #>> '{Telefono}', '')) AS phone,
    COALESCE(NULLIF(r.email, ''), NULLIF(r.raw #>> '{Correo_e}', '')) AS email,
    COALESCE(NULLIF(r.website, ''), NULLIF(r.raw #>> '{Sitio_internet}', '')) AS website,
    NULLIF(r.address, '') AS address,
    r.lat,
    r.lng,
    r.geom,
    r.maps_url,
    r.creado_en AS resultado_creado_en,
    b.query AS busqueda_query,
    b.radio_m AS busqueda_radio_m,
    b.lat AS busqueda_lat,
    b.lng AS busqueda_lng,
    b.centro AS busqueda_centro,
    b.total_encontrados AS busqueda_total_encontrados,
    b.meta AS busqueda_meta,
    b.creado_en AS busqueda_creado_en,
    b.creado_por AS busqueda_creado_por,
        CASE
            WHEN ((b.centro IS NOT NULL) AND (r.geom IS NOT NULL)) THEN public.st_distance(b.centro, r.geom)
            ELSE NULL::double precision
        END AS distancia_m
   FROM (public.resultados r
     JOIN public.busquedas b ON ((b.id = r.busqueda_id)))
  WHERE (r.fuente = 'denue'::public.fuente_resultado);

COMMENT ON VIEW public.v_denue_contactables IS 'Resultados de búsquedas DENUE listos para contactabilidad y mapa.';

GRANT SELECT ON public.v_denue_contactables TO postgres;
GRANT SELECT ON public.v_denue_contactables TO service_role;
GRANT SELECT ON public.v_denue_contactables TO authenticated;
