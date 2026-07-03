-- Agrega un eslogan comercial corto para reutilizarlo en otras vistas y flujos.

ALTER TABLE public.organizaciones
    ADD COLUMN IF NOT EXISTS eslogan_empresa text;

COMMENT ON COLUMN public.organizaciones.eslogan_empresa IS 'Eslogan o frase comercial corta del tenant.';
