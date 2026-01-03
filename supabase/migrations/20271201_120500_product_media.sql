CREATE TABLE IF NOT EXISTS public.recursos_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id),
    objeto_type text NOT NULL CHECK (objeto_type IN ('producto', 'familia', 'modelo', 'cotizacion')),
    objeto_id uuid NOT NULL,
    url text NOT NULL,
    descripcion text,
    tipo text NOT NULL CHECK (tipo IN ('portada', 'galeria', 'especifico', 'manual')),
    orden integer NOT NULL DEFAULT 100,
    activo boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamp with time zone NOT NULL DEFAULT now(),
    actualizado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recursos_media_objeto_idx
    ON public.recursos_media (organizacion_id, objeto_type, objeto_id);

CREATE UNIQUE INDEX IF NOT EXISTS recursos_media_portada_unq
    ON public.recursos_media (organizacion_id, objeto_type, objeto_id)
    WHERE tipo = 'portada' AND activo;
