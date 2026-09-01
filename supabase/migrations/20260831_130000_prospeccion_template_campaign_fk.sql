-- Asociación explícita entre la plantilla y la campaña que la utiliza.
ALTER TABLE public.prospeccion_contacto_templates
    ADD COLUMN IF NOT EXISTS campana_id uuid;

UPDATE public.prospeccion_contacto_templates AS template
SET campana_id = campaign.id
FROM public.campanas AS campaign
WHERE template.campana_id IS NULL
  AND template.metadata->>'campana_id' ~ '^[0-9a-fA-F-]{36}$'
  AND campaign.id = (template.metadata->>'campana_id')::uuid
  AND campaign.organizacion_id = template.organizacion_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_templates_campana_id_fkey'
          AND conrelid = 'public.prospeccion_contacto_templates'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_templates
            ADD CONSTRAINT prospeccion_contacto_templates_campana_id_fkey
            FOREIGN KEY (campana_id) REFERENCES public.campanas(id) ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_campana_idx
    ON public.prospeccion_contacto_templates (organizacion_id, campana_id, canal);

COMMENT ON COLUMN public.prospeccion_contacto_templates.campana_id IS
    'Campaña de distribución a la que pertenece la plantilla.';
