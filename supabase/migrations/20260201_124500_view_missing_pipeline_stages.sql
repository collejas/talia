-- Vista de verificación: organizaciones sin etapas canónicas requeridas.

CREATE OR REPLACE VIEW public.organizaciones_missing_etapas_pipeline AS
WITH stage_defs AS (
    SELECT *
    FROM (
        VALUES
            ('captado'),
            ('precalificado'),
            ('demo'),
            ('propuesta'),
            ('negociacion'),
            ('cerrado_ganado'),
            ('cerrado_perdido')
    ) AS t(codigo)
)
SELECT
    o.id AS organizacion_id,
    sd.codigo
FROM public.organizaciones o
CROSS JOIN stage_defs sd
WHERE NOT EXISTS (
    SELECT 1
    FROM public.etapas_pipeline ep
    WHERE ep.organizacion_id = o.id
      AND lower(ep.codigo) = sd.codigo
);

COMMENT ON VIEW public.organizaciones_missing_etapas_pipeline IS
    'Lista cada organización/código de etapa faltante para monitorear seeds y alertar si aparece un tenant sin captado/precalificado/etc.';
