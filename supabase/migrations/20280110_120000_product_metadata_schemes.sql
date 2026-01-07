CREATE TABLE IF NOT EXISTS public.producto_metadata_schemes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id),
    name text NOT NULL,
    description text,
    fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS producto_metadata_schemes_org_name_unq
    ON public.producto_metadata_schemes (organizacion_id, lower(name));

CREATE OR REPLACE FUNCTION public.producto_metadata_schemes_updated_at_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS producto_metadata_schemes_updated_at ON public.producto_metadata_schemes;

CREATE TRIGGER producto_metadata_schemes_updated_at
BEFORE UPDATE ON public.producto_metadata_schemes
FOR EACH ROW
EXECUTE FUNCTION public.producto_metadata_schemes_updated_at_trg();
