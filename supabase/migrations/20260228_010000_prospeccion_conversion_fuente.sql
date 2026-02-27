CREATE OR REPLACE FUNCTION public.prospeccion_conversion_fuente()
RETURNS TABLE (
    fuente text,
    total_prospectos bigint,
    prospectos_contactados bigint,
    envios_totales bigint,
    envios_enviados bigint,
    prospectos_convertidos bigint,
    conversion_contacto_pct numeric(5,2),
    conversion_convertido_pct numeric(5,2)
)
LANGUAGE sql
STABLE
AS $$
WITH fuentes AS (
    SELECT unnest(ARRAY['google_places'::text, 'denue'::text, 'usuario'::text]) AS fuente
),
prospectos AS (
    SELECT
        p.id,
        p.fuente::text AS fuente,
        p.metadata
    FROM public.prospeccion_prospectos p
    WHERE p.organizacion_id = public.usuario_organizacion_id(auth.uid())
),
envios AS (
    SELECT
        e.prospecto_id,
        COUNT(*)::bigint AS envios_totales,
        COUNT(*) FILTER (
            WHERE e.estado = ANY (ARRAY['enviado'::text, 'entregado'::text])
        )::bigint AS envios_enviados
    FROM public.prospeccion_contacto_envio e
    WHERE e.organizacion_id = public.usuario_organizacion_id(auth.uid())
    GROUP BY e.prospecto_id
)
SELECT
    f.fuente,
    COUNT(p.id)::bigint AS total_prospectos,
    COUNT(*) FILTER (WHERE COALESCE(ev.envios_totales, 0) > 0)::bigint AS prospectos_contactados,
    COALESCE(SUM(ev.envios_totales), 0)::bigint AS envios_totales,
    COALESCE(SUM(ev.envios_enviados), 0)::bigint AS envios_enviados,
    COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(p.metadata->>'convertido_contacto_id', ''), '') <> ''
    )::bigint AS prospectos_convertidos,
    CASE
        WHEN COUNT(p.id) = 0 THEN 0
        ELSE ROUND(
            (COUNT(*) FILTER (WHERE COALESCE(ev.envios_totales, 0) > 0)::numeric * 100.0)
            / COUNT(p.id)::numeric,
            2
        )
    END AS conversion_contacto_pct,
    CASE
        WHEN COUNT(p.id) = 0 THEN 0
        ELSE ROUND(
            (COUNT(*) FILTER (
                WHERE COALESCE(NULLIF(p.metadata->>'convertido_contacto_id', ''), '') <> ''
            )::numeric * 100.0) / COUNT(p.id)::numeric,
            2
        )
    END AS conversion_convertido_pct
FROM fuentes f
LEFT JOIN prospectos p ON p.fuente = f.fuente
LEFT JOIN envios ev ON ev.prospecto_id = p.id
GROUP BY f.fuente
ORDER BY f.fuente;
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_conversion_fuente() TO authenticated;
