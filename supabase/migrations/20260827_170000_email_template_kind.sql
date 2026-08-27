-- Clasificacion explicita del tipo de envio para plantillas de correo.
ALTER TABLE public.prospeccion_contacto_templates
    ADD COLUMN IF NOT EXISTS email_message_kind text;

-- Las plantillas de correo existentes pertenecen al flujo de prospeccion
-- comercial; se inicializan como Broadcasts antes de exigir la seleccion.
UPDATE public.prospeccion_contacto_templates
SET email_message_kind = 'broadcast'
WHERE canal = 'correo'
  AND email_message_kind IS NULL;

UPDATE public.prospeccion_contacto_templates
SET email_message_kind = NULL
WHERE canal <> 'correo';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_templates_email_kind_check'
          AND conrelid = 'public.prospeccion_contacto_templates'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_templates
            ADD CONSTRAINT prospeccion_contacto_templates_email_kind_check
            CHECK (
                (canal = 'correo' AND email_message_kind IN ('transactional', 'broadcast'))
                OR (canal <> 'correo' AND email_message_kind IS NULL)
            );
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_email_kind_idx
    ON public.prospeccion_contacto_templates (canal, email_message_kind);

COMMENT ON COLUMN public.prospeccion_contacto_templates.email_message_kind IS
    'Tipo Postmark para plantillas de correo: transactional o broadcast.';
