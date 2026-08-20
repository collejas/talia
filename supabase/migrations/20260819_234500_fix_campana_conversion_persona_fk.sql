BEGIN;

-- Al eliminar una persona, solo se debe desvincular persona_id.
-- organizacion_id es parte de la identidad tenant-scoped y es NOT NULL;
-- el SET NULL implícito sobre toda la FK compuesta provocaba 23502.
ALTER TABLE public.campana_conversion
    DROP CONSTRAINT IF EXISTS campana_conversion_persona_org_fkey;

ALTER TABLE public.campana_conversion
    ADD CONSTRAINT campana_conversion_persona_org_fkey
    FOREIGN KEY (organizacion_id, persona_id)
    REFERENCES public.personas (organizacion_id, id)
    ON DELETE SET NULL (persona_id);

COMMIT;
