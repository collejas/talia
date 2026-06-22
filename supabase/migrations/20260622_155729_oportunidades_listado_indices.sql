BEGIN;

-- Indices para el listado maestro de oportunidades.
-- El objetivo es cubrir filtros frecuentes sin mezclar logica de negocio.

CREATE INDEX IF NOT EXISTS oportunidades_org_etapa_creado_en_idx
    ON public.oportunidades (organizacion_id, etapa_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS oportunidades_org_asignado_creado_en_idx
    ON public.oportunidades (organizacion_id, asignado_a_usuario_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS oportunidades_org_cuenta_creado_en_idx
    ON public.oportunidades (organizacion_id, cuenta_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS oportunidades_org_estado_creado_en_idx
    ON public.oportunidades (organizacion_id, estado, creado_en DESC);

CREATE INDEX IF NOT EXISTS oportunidades_org_fecha_cierre_probable_idx
    ON public.oportunidades (organizacion_id, fecha_cierre_probable DESC);

COMMIT;

