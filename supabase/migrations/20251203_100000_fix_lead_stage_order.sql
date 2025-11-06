BEGIN;

-- ============================================================================
-- Ajusta el orden del embudo principal para que Demo Agendada vaya después de
-- Precalificado.
-- ============================================================================

WITH tablero AS (
    SELECT id
    FROM public.lead_tableros
    WHERE slug = 'general'
    LIMIT 1
)
UPDATE public.lead_etapas AS le
SET
    orden = CASE le.codigo
        WHEN 'captado' THEN 1
        WHEN 'precalificado' THEN 2
        WHEN 'demo' THEN 3
        WHEN 'negociacion' THEN 4
        WHEN 'cerrado_ganado' THEN 5
        WHEN 'cerrado_perdido' THEN 6
        ELSE le.orden
    END,
    actualizado_en = now()
FROM tablero
WHERE le.tablero_id = tablero.id
  AND le.codigo IN (
        'captado',
        'precalificado',
        'demo',
        'negociacion',
        'cerrado_ganado',
        'cerrado_perdido'
    );

COMMIT;
