BEGIN;

-- Maestro de unidades de medida para el modulo de productos e inventario.
-- Permite que el operador use un select en lugar de escribir texto libre.

CREATE TABLE IF NOT EXISTS public.unidades_medida (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    simbolo text,
    activo boolean NOT NULL DEFAULT true,
    es_base boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unidades_medida_codigo_check CHECK (char_length(trim(codigo)) > 0),
    CONSTRAINT unidades_medida_nombre_check CHECK (char_length(trim(nombre)) > 0)
);

COMMENT ON TABLE public.unidades_medida IS 'Catalogo de unidades de medida utilizadas por inventario y productos.';

CREATE UNIQUE INDEX IF NOT EXISTS unidades_medida_org_codigo_unq
    ON public.unidades_medida (organizacion_id, codigo);

CREATE INDEX IF NOT EXISTS unidades_medida_org_activo_idx
    ON public.unidades_medida (organizacion_id, activo, es_base, nombre);

ALTER TABLE public.unidades_medida
    ADD CONSTRAINT unidades_medida_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.unidades_medida ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_unidades_medida_set_org ON public.unidades_medida;
CREATE TRIGGER t_unidades_medida_set_org
    BEFORE INSERT ON public.unidades_medida
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_unidades_medida_touch_updated_at ON public.unidades_medida;
CREATE TRIGGER t_unidades_medida_touch_updated_at
    BEFORE UPDATE ON public.unidades_medida
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY unidades_medida_select_org
    ON public.unidades_medida
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY unidades_medida_write_org
    ON public.unidades_medida
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

INSERT INTO public.unidades_medida (organizacion_id, codigo, nombre, simbolo, activo, es_base)
SELECT o.id, v.codigo, v.nombre, v.simbolo, true, true
FROM public.organizaciones o
CROSS JOIN (
    VALUES
        ('pieza', 'Pieza', 'pz'),
        ('caja', 'Caja', 'cj'),
        ('litro', 'Litro', 'L'),
        ('metro', 'Metro', 'm'),
        ('kilogramo', 'Kilogramo', 'kg'),
        ('gramo', 'Gramo', 'g'),
        ('cubeta', 'Cubeta', 'cub'),
        ('servicio', 'Servicio', 'srv')
) AS v(codigo, nombre, simbolo)
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

COMMIT;
