BEGIN;

-- Mantener organizacion_id al desvincular entidades opcionales de la
-- atribución de mensajes de campaña.
ALTER TABLE public.campana_mensaje_atribucion
    DROP CONSTRAINT IF EXISTS campana_mensaje_atribucion_envio_org_fkey,
    DROP CONSTRAINT IF EXISTS campana_mensaje_atribucion_lote_org_fkey,
    DROP CONSTRAINT IF EXISTS campana_mensaje_atribucion_persona_org_fkey;

ALTER TABLE public.campana_mensaje_atribucion
    ADD CONSTRAINT campana_mensaje_atribucion_envio_org_fkey
    FOREIGN KEY (organizacion_id, envio_id)
    REFERENCES public.prospeccion_contacto_envio (organizacion_id, id)
    ON DELETE SET NULL (envio_id),
    ADD CONSTRAINT campana_mensaje_atribucion_lote_org_fkey
    FOREIGN KEY (organizacion_id, lote_id)
    REFERENCES public.prospeccion_contacto_batch (organizacion_id, id)
    ON DELETE SET NULL (lote_id),
    ADD CONSTRAINT campana_mensaje_atribucion_persona_org_fkey
    FOREIGN KEY (organizacion_id, persona_id)
    REFERENCES public.personas (organizacion_id, id)
    ON DELETE SET NULL (persona_id);

COMMIT;
