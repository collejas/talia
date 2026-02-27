CREATE OR REPLACE FUNCTION public.prospeccion_brevo_eventos_resumen()
RETURNS TABLE (
    evento text,
    total bigint,
    ultimo_evento_en timestamp with time zone
)
LANGUAGE sql
STABLE
AS $$
SELECT
    eventos.evento,
    COUNT(*)::bigint AS total,
    MAX(l.creado_en) AS ultimo_evento_en
FROM public.prospeccion_contactos_log l
CROSS JOIN LATERAL (
    SELECT COALESCE(
        NULLIF(btrim(l.detalle->>'event'), ''),
        NULLIF(btrim(l.detalle->'brevo'->>'event'), '')
    ) AS evento
) eventos
WHERE l.organizacion_id = public.usuario_organizacion_id(auth.uid())
  AND l.canal = 'correo'
  AND eventos.evento IS NOT NULL
GROUP BY eventos.evento
ORDER BY total DESC, eventos.evento ASC;
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_brevo_eventos_resumen() TO authenticated;
