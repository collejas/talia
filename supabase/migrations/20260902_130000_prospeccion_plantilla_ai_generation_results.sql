-- Resultado persistido para consultar generaciones IA sin mantener abierta la petición HTTP.
ALTER TABLE public.prospeccion_plantilla_ai_generaciones
    ADD COLUMN IF NOT EXISTS resultado_nombre_sugerido text,
    ADD COLUMN IF NOT EXISTS resultado_descripcion text,
    ADD COLUMN IF NOT EXISTS resultado_cuerpo_texto text,
    ADD COLUMN IF NOT EXISTS resultado_asunto text,
    ADD COLUMN IF NOT EXISTS resultado_cuerpo_html text,
    ADD COLUMN IF NOT EXISTS resultado_variables_usadas text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS resultado_advertencias text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS resultado_meta_category_sugerida text,
    ADD COLUMN IF NOT EXISTS resultado_language_code_sugerido text;

COMMENT ON COLUMN public.prospeccion_plantilla_ai_generaciones.resultado_cuerpo_html IS
    'HTML generado por la IA, antes de sustituir variables e imagenes en el panel.';
