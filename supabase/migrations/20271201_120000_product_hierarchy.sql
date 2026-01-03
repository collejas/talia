CREATE TABLE IF NOT EXISTS public.lineas_de_negocio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id),
    nombre text NOT NULL,
    descripcion text,
    activo boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamp with time zone NOT NULL DEFAULT now(),
    actualizado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lineas_de_negocio_unq_org_nombre
    ON public.lineas_de_negocio (organizacion_id, lower(nombre));

CREATE TABLE IF NOT EXISTS public.familias_productos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id),
    linea_id uuid NOT NULL REFERENCES public.lineas_de_negocio(id),
    nombre text NOT NULL,
    descripcion text,
    activo boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamp with time zone NOT NULL DEFAULT now(),
    actualizado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS familias_productos_unq_org_linea_nombre
    ON public.familias_productos (organizacion_id, linea_id, lower(nombre));

CREATE TABLE IF NOT EXISTS public.modelos_productos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id),
    nombre text NOT NULL,
    descripcion text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamp with time zone NOT NULL DEFAULT now(),
    actualizado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS modelos_productos_unq_org_nombre
    ON public.modelos_productos (organizacion_id, lower(nombre));

ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS familia_id uuid REFERENCES public.familias_productos(id),
    ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES public.modelos_productos(id);
