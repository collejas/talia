BEGIN;

ALTER TABLE public.prospeccion_whatsapp_atribucion_eventos
    ADD COLUMN IF NOT EXISTS persona_id uuid;

ALTER TABLE public.prospeccion_whatsapp_atribucion_eventos
    ALTER COLUMN contacto_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_whatsapp_atribucion_eventos_persona_fkey'
          AND conrelid = 'public.prospeccion_whatsapp_atribucion_eventos'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_whatsapp_atribucion_eventos
            ADD CONSTRAINT prospeccion_whatsapp_atribucion_eventos_persona_fkey
            FOREIGN KEY (persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;
    END IF;
END
$$;

UPDATE public.prospeccion_whatsapp_atribucion_eventos e
SET persona_id = p.id
FROM public.personas p
WHERE e.persona_id IS NULL
  AND e.contacto_id IS NOT NULL
  AND p.organizacion_id = e.organizacion_id
  AND p.metadata->>'legacy_contacto_id' = e.contacto_id::text;

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_eventos_org_persona_idx
    ON public.prospeccion_whatsapp_atribucion_eventos USING btree (organizacion_id, persona_id, creado_en DESC);

COMMENT ON COLUMN public.prospeccion_whatsapp_atribucion_eventos.persona_id IS
'Referencia canónica a personas para la atribución WhatsApp; contacto_id queda solo por compatibilidad temporal.';

COMMIT;
