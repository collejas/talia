-- El ancho del logo es una regla visual explícita del estilo de diseño.
-- Se mantiene acotado para evitar logos desproporcionados en correos.

ALTER TABLE public.prospeccion_plantilla_ai_layouts
    ADD COLUMN IF NOT EXISTS logo_ancho_px integer NOT NULL DEFAULT 140;

UPDATE public.prospeccion_plantilla_ai_layouts
SET logo_ancho_px = CASE codigo
    WHEN 'minimal' THEN 110
    WHEN 'personal_letter' THEN 120
    WHEN 'editorial' THEN 140
    WHEN 'feature_cards' THEN 140
    WHEN 'problem_solution' THEN 140
    WHEN 'case_study' THEN 140
    WHEN 'dark_header' THEN 150
    WHEN 'announcement' THEN 150
    WHEN 'product_showcase' THEN 150
    WHEN 'hero_card' THEN 160
    ELSE 140
END
WHERE logo_ancho_px = 140;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_plantilla_ai_layouts_logo_ancho_chk'
          AND conrelid = 'public.prospeccion_plantilla_ai_layouts'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_plantilla_ai_layouts
            ADD CONSTRAINT prospeccion_plantilla_ai_layouts_logo_ancho_chk
            CHECK (logo_ancho_px BETWEEN 80 AND 240);
    END IF;
END $$;

COMMENT ON COLUMN public.prospeccion_plantilla_ai_layouts.logo_ancho_px IS
    'Ancho recomendado del logo en pixeles para correos generados con este estilo.';
