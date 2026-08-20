BEGIN;

-- En FKs tenant-scoped compuestas, al eliminar la entidad relacionada
-- solo debe quedar NULL la columna de relación; organizacion_id es NOT NULL
-- y debe conservarse para mantener el aislamiento por tenant.
ALTER TABLE public.campana_conversion
    DROP CONSTRAINT IF EXISTS campana_conversion_mensaje_org_fkey,
    DROP CONSTRAINT IF EXISTS campana_conversion_oportunidad_org_fkey;

ALTER TABLE public.campana_conversion
    ADD CONSTRAINT campana_conversion_mensaje_org_fkey
    FOREIGN KEY (organizacion_id, mensaje_respuesta_id)
    REFERENCES public.mensajes (organizacion_id, id)
    ON DELETE SET NULL (mensaje_respuesta_id),
    ADD CONSTRAINT campana_conversion_oportunidad_org_fkey
    FOREIGN KEY (organizacion_id, oportunidad_id)
    REFERENCES public.oportunidades (organizacion_id, id)
    ON DELETE SET NULL (oportunidad_id);

COMMIT;
