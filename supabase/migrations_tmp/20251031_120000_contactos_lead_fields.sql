-- Agrega columnas explícitas para los datos captados de leads en la tabla contactos.

ALTER TABLE public.contactos
    ADD COLUMN IF NOT EXISTS company_name text;

ALTER TABLE public.contactos
    ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.contactos
    ADD COLUMN IF NOT EXISTS necesidad_proposito text;

-- Rellena las nuevas columnas con la información existente en contacto_datos.
UPDATE public.contactos
SET company_name = contacto_datos ->> 'company_name'
WHERE (contacto_datos ? 'company_name')
  AND company_name IS NULL;

UPDATE public.contactos
SET notes = COALESCE(contacto_datos ->> 'notes', contacto_datos ->> 'lead_capture_notes')
WHERE (contacto_datos ? 'notes' OR contacto_datos ? 'lead_capture_notes')
  AND notes IS NULL;

UPDATE public.contactos
SET necesidad_proposito = contacto_datos ->> 'necesidad_proposito'
WHERE (contacto_datos ? 'necesidad_proposito')
  AND necesidad_proposito IS NULL;
