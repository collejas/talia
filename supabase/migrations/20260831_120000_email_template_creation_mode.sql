-- Modo de creación usado para abrir y editar plantillas de correo.
ALTER TABLE public.prospeccion_contacto_templates
    ADD COLUMN IF NOT EXISTS email_creation_mode text;

UPDATE public.prospeccion_contacto_templates
SET email_creation_mode = CASE
    WHEN canal = 'correo' AND NULLIF(BTRIM(cuerpo_html), '') IS NOT NULL THEN 'html'
    ELSE 'visual'
END
WHERE email_creation_mode IS NULL;

ALTER TABLE public.prospeccion_contacto_templates
    ALTER COLUMN email_creation_mode SET DEFAULT 'visual';

ALTER TABLE public.prospeccion_contacto_templates
    ALTER COLUMN email_creation_mode SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_templates_creation_mode_check'
          AND conrelid = 'public.prospeccion_contacto_templates'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_templates
            ADD CONSTRAINT prospeccion_contacto_templates_creation_mode_check
            CHECK (
                (canal = 'correo' AND email_creation_mode IN ('visual', 'html', 'ai'))
                OR (canal <> 'correo' AND email_creation_mode = 'visual')
            );
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_creation_mode_idx
    ON public.prospeccion_contacto_templates (organizacion_id, canal, email_creation_mode);

COMMENT ON COLUMN public.prospeccion_contacto_templates.email_creation_mode IS
    'Experiencia de creación/edición de plantillas de correo: visual, html o ai.';
