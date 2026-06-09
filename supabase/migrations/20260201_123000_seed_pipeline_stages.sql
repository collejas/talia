-- Garantiza que todas las organizaciones tengan las etapas canónicas del CRM.
WITH stage_defs AS (
    SELECT *
    FROM (
        VALUES
            ('captado', 'Captado', 10::smallint, 'abierta', 10.0, 'slate'),
            ('precalificado', 'Precalificado', 20::smallint, 'abierta', 25.0, 'sky'),
            ('demo', 'Cita agendada', 30::smallint, 'abierta', 45.0, 'violet'),
            ('propuesta', 'Propuesta', 40::smallint, 'abierta', 65.0, 'amber'),
            ('negociacion', 'Negociación', 50::smallint, 'abierta', 80.0, 'orange'),
            ('cerrado_ganado', 'Cerrado · Ganado', 60::smallint, 'ganada', 100.0, 'emerald'),
            ('cerrado_perdido', 'Cerrado · Perdido', 70::smallint, 'perdida', 0.0, 'rose')
    ) AS t(codigo, nombre, orden, categoria, probabilidad, color)
),
orgs AS (
    SELECT id
    FROM public.organizaciones
),
missing AS (
    SELECT
        gen_random_uuid() AS id,
        o.id AS organizacion_id,
        d.codigo,
        d.nombre,
        d.orden,
        d.probabilidad,
        d.categoria,
        jsonb_build_object(
            'seed', 'default_stage',
            'color', d.color,
            'legacy_codigo', d.codigo
        ) AS metadata
    FROM orgs o
    CROSS JOIN stage_defs d
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.etapas_pipeline ep
        WHERE ep.organizacion_id = o.id
          AND lower(ep.codigo) = d.codigo
    )
)
INSERT INTO public.etapas_pipeline (
    id,
    organizacion_id,
    codigo,
    nombre,
    orden,
    probabilidad,
    categoria,
    metadata
)
SELECT
    m.id,
    m.organizacion_id,
    m.codigo,
    m.nombre,
    m.orden,
    m.probabilidad,
    m.categoria,
    m.metadata
FROM missing m;

COMMENT ON TABLE public.etapas_pipeline IS 'Incluye seeds automáticos (metadata.seed = default_stage) cuando falta el catálogo básico.';
