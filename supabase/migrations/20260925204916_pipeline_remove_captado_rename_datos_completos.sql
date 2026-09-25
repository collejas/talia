BEGIN;

ALTER TABLE public.etapas_pipeline
    ADD COLUMN IF NOT EXISTS visible_en_embudo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS etapas_pipeline_visible_org_orden_idx
    ON public.etapas_pipeline (organizacion_id, orden)
    WHERE visible_en_embudo;

-- Give existing tenants the first-contact stage before retiring Captado.
INSERT INTO public.etapas_pipeline (
    organizacion_id,
    codigo,
    nombre,
    orden,
    probabilidad,
    categoria,
    metadata
)
SELECT
    o.id,
    'prospeccion_primer_contacto',
    'Prospección · Primer contacto',
    COALESCE(MIN(e.orden), 10) - 5,
    5,
    'abierta',
    jsonb_build_object(
        'seed', 'prospeccion_stage',
        'metadatos', jsonb_build_object(
            'color', 'indigo',
            'etiqueta', 'Prospección',
            'descripcion', 'Primer contacto originado desde búsquedas y campañas de prospección.',
            'is_counter_only', false
        )
    )
FROM public.organizaciones o
LEFT JOIN public.etapas_pipeline e
    ON e.organizacion_id = o.id
   AND e.visible_en_embudo
WHERE NOT EXISTS (
    SELECT 1
    FROM public.etapas_pipeline existing
    WHERE existing.organizacion_id = o.id
      AND existing.codigo = 'prospeccion_primer_contacto'
)
GROUP BY o.id;

-- Preserve stage history and let the existing opportunity triggers record the migration.
WITH stage_moves AS (
    SELECT
        opp.organizacion_id,
        opp.id AS oportunidad_id,
        opp.etapa_id AS etapa_origen_id,
        target.id AS etapa_destino_id
    FROM public.oportunidades opp
    JOIN public.etapas_pipeline source
      ON source.organizacion_id = opp.organizacion_id
     AND source.id = opp.etapa_id
     AND source.codigo IN ('captado', 'general_captado')
    JOIN public.etapas_pipeline target
      ON target.organizacion_id = opp.organizacion_id
     AND target.codigo = 'prospeccion_primer_contacto'
     AND target.visible_en_embudo
)
INSERT INTO public.oportunidad_etapas_historial (
    organizacion_id,
    oportunidad_id,
    etapa_origen_id,
    etapa_destino_id,
    cambiado_en,
    motivo,
    fuente,
    metadata
)
SELECT
    organizacion_id,
    oportunidad_id,
    etapa_origen_id,
    etapa_destino_id,
    now(),
    'Retiro global de la etapa Captado',
    'migracion_sistema',
    jsonb_build_object('migracion', '20260925040000_pipeline_remove_captado_rename_datos_completos')
FROM stage_moves;

UPDATE public.oportunidades opp
SET etapa_id = target.id,
    actualizado_en = now()
FROM public.etapas_pipeline source,
     public.etapas_pipeline target
WHERE source.organizacion_id = opp.organizacion_id
  AND source.id = opp.etapa_id
  AND source.codigo IN ('captado', 'general_captado')
  AND target.organizacion_id = opp.organizacion_id
  AND target.codigo = 'prospeccion_primer_contacto'
  AND target.visible_en_embudo;

UPDATE public.etapas_pipeline
SET visible_en_embudo = false
WHERE codigo IN ('captado', 'general_captado');

UPDATE public.etapas_pipeline
SET nombre = 'Datos completos'
WHERE codigo IN ('precalificado', 'general_precalificado');

-- Reuse the default Captado catalog row at the same position for new tenants.
UPDATE public.tenant_default_pipeline_stages
SET codigo = 'prospeccion_primer_contacto',
    nombre = 'Prospección · Primer contacto',
    probabilidad = 5,
    color = 'indigo',
    actualizado_en = now()
WHERE codigo = 'captado';

UPDATE public.tenant_default_pipeline_stages
SET nombre = 'Datos completos',
    actualizado_en = now()
WHERE codigo = 'precalificado';

COMMIT;
