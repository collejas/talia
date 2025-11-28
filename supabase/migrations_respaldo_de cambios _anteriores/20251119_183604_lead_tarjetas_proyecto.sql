-- Agrega columnas para nombre y necesidades del proyecto en lead_tarjetas

BEGIN;

ALTER TABLE public.lead_tarjetas
  ADD COLUMN proyecto_nombre text,
  ADD COLUMN proyecto_necesidades text;

COMMENT ON COLUMN public.lead_tarjetas.proyecto_nombre IS 'Nombre o título del proyecto asociado al lead.';
COMMENT ON COLUMN public.lead_tarjetas.proyecto_necesidades IS 'Resumen de necesidades o requisitos del proyecto.';

COMMIT;
