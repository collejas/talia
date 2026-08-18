-- Auditoría explícita del estilo solicitado y aplicado en cada generación IA.

ALTER TABLE public.prospeccion_plantilla_ai_generaciones
    ADD COLUMN IF NOT EXISTS estilo_diseno_solicitado text,
    ADD COLUMN IF NOT EXISTS estilo_diseno_aplicado text;

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_org_layout_idx
    ON public.prospeccion_plantilla_ai_generaciones (organizacion_id, estilo_diseno_aplicado, creado_en DESC);

COMMENT ON COLUMN public.prospeccion_plantilla_ai_generaciones.estilo_diseno_solicitado IS
    'Estilo solicitado por el usuario o resuelto por el backend antes de llamar al proveedor.';
COMMENT ON COLUMN public.prospeccion_plantilla_ai_generaciones.estilo_diseno_aplicado IS
    'Estilo devuelto por el modelo y validado por el backend.';
