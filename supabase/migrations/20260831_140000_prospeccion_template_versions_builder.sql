-- Base normalizada para la reconstrucción del creador de plantillas.
-- La plantilla conserva su identidad y la versión contiene el contenido
-- editable/publicable. La estructura visual no se guarda en metadata/jsonb.

BEGIN;

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_versiones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    template_id uuid NOT NULL,
    numero integer NOT NULL,
    estado text NOT NULL DEFAULT 'borrador',
    metodo_creacion text NOT NULL,
    asunto text,
    cuerpo_texto text,
    cuerpo_html text,
    estilo_diseno text,
    creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    publicado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    publicado_en timestamptz,
    CONSTRAINT prospeccion_plantilla_versiones_template_org_fkey
        FOREIGN KEY (organizacion_id, template_id)
        REFERENCES public.prospeccion_contacto_templates(organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT prospeccion_plantilla_versiones_numero_chk CHECK (numero > 0),
    CONSTRAINT prospeccion_plantilla_versiones_estado_chk
        CHECK (estado IN ('borrador', 'probada', 'publicada', 'archivada')),
    CONSTRAINT prospeccion_plantilla_versiones_metodo_chk
        CHECK (metodo_creacion IN ('visual', 'html', 'ai')),
    CONSTRAINT prospeccion_plantilla_versiones_org_id_key
        UNIQUE (organizacion_id, id),
    CONSTRAINT prospeccion_plantilla_versiones_org_template_numero_key
        UNIQUE (organizacion_id, template_id, numero)
);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_versiones_org_template_idx
    ON public.prospeccion_plantilla_versiones (organizacion_id, template_id, numero DESC);

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_plantilla_versiones_one_published_idx
    ON public.prospeccion_plantilla_versiones (organizacion_id, template_id)
    WHERE estado = 'publicada';

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_version_bloques (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    version_id uuid NOT NULL,
    orden integer NOT NULL,
    tipo_bloque text NOT NULL,
    titulo text,
    contenido text,
    destino_url text,
    logo_id uuid REFERENCES public.logos(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_version_bloques_version_org_fkey
        FOREIGN KEY (organizacion_id, version_id)
        REFERENCES public.prospeccion_plantilla_versiones(organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT prospeccion_plantilla_version_bloques_orden_chk CHECK (orden >= 0),
    CONSTRAINT prospeccion_plantilla_version_bloques_tipo_chk
        CHECK (tipo_bloque IN ('texto', 'imagen', 'boton', 'separador', 'espacio', 'columnas', 'firma')),
    CONSTRAINT prospeccion_plantilla_version_bloques_org_id_key
        UNIQUE (organizacion_id, id),
    CONSTRAINT prospeccion_plantilla_version_bloques_org_version_orden_key
        UNIQUE (organizacion_id, version_id, orden)
);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_version_bloques_version_idx
    ON public.prospeccion_plantilla_version_bloques (organizacion_id, version_id, orden);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_bloque_columnas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    bloque_id uuid NOT NULL,
    orden integer NOT NULL,
    ancho_porcentaje numeric(5,2) NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_bloque_columnas_bloque_org_fkey
        FOREIGN KEY (organizacion_id, bloque_id)
        REFERENCES public.prospeccion_plantilla_version_bloques(organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT prospeccion_plantilla_bloque_columnas_orden_chk CHECK (orden IN (0, 1)),
    CONSTRAINT prospeccion_plantilla_bloque_columnas_ancho_chk
        CHECK (ancho_porcentaje >= 10 AND ancho_porcentaje <= 90),
    CONSTRAINT prospeccion_plantilla_bloque_columnas_org_id_key
        UNIQUE (organizacion_id, id),
    CONSTRAINT prospeccion_plantilla_bloque_columnas_org_bloque_orden_key
        UNIQUE (organizacion_id, bloque_id, orden)
);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_bloque_columnas_bloque_idx
    ON public.prospeccion_plantilla_bloque_columnas (organizacion_id, bloque_id, orden);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_columna_elementos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    columna_id uuid NOT NULL,
    orden integer NOT NULL,
    tipo_elemento text NOT NULL,
    contenido text,
    destino_url text,
    logo_id uuid REFERENCES public.logos(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_columna_elementos_columna_org_fkey
        FOREIGN KEY (organizacion_id, columna_id)
        REFERENCES public.prospeccion_plantilla_bloque_columnas(organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT prospeccion_plantilla_columna_elementos_orden_chk CHECK (orden >= 0),
    CONSTRAINT prospeccion_plantilla_columna_elementos_tipo_chk
        CHECK (tipo_elemento IN ('texto', 'imagen', 'boton', 'separador', 'espacio')),
    CONSTRAINT prospeccion_plantilla_columna_elementos_org_columna_orden_key
        UNIQUE (organizacion_id, columna_id, orden)
);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_columna_elementos_columna_idx
    ON public.prospeccion_plantilla_columna_elementos (organizacion_id, columna_id, orden);

ALTER TABLE public.prospeccion_contacto_templates
    ADD COLUMN IF NOT EXISTS version_activa_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_id_key
    ON public.prospeccion_contacto_templates (organizacion_id, id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_templates_version_activa_org_fkey'
          AND conrelid = 'public.prospeccion_contacto_templates'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_templates
            ADD CONSTRAINT prospeccion_contacto_templates_version_activa_org_fkey
            FOREIGN KEY (organizacion_id, version_activa_id)
            REFERENCES public.prospeccion_plantilla_versiones(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END;
$$;

INSERT INTO public.prospeccion_plantilla_versiones (
    organizacion_id, template_id, numero, estado, metodo_creacion,
    asunto, cuerpo_texto, cuerpo_html, creado_por, publicado_en
)
SELECT
    t.organizacion_id,
    t.id,
    1,
    CASE WHEN t.activo THEN 'publicada' ELSE 'archivada' END,
    CASE
        WHEN t.canal = 'correo' AND t.email_creation_mode IN ('visual', 'html', 'ai')
            THEN t.email_creation_mode
        ELSE 'html'
    END,
    t.asunto,
    t.cuerpo_texto,
    t.cuerpo_html,
    t.creado_por,
    CASE WHEN t.activo THEN t.actualizado_en ELSE NULL END
FROM public.prospeccion_contacto_templates t
WHERE NOT EXISTS (
    SELECT 1
    FROM public.prospeccion_plantilla_versiones v
    WHERE v.organizacion_id = t.organizacion_id
      AND v.template_id = t.id
      AND v.numero = 1
);

UPDATE public.prospeccion_contacto_templates t
SET version_activa_id = v.id
FROM public.prospeccion_plantilla_versiones v
WHERE v.organizacion_id = t.organizacion_id
  AND v.template_id = t.id
  AND v.numero = 1
  AND t.version_activa_id IS NULL;

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'prospeccion_plantilla_versiones',
        'prospeccion_plantilla_version_bloques',
        'prospeccion_plantilla_bloque_columnas',
        'prospeccion_plantilla_columna_elementos'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (organizacion_id = public.usuario_organizacion_id(auth.uid())) WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()))',
            table_name || '_tenant_policy', table_name
        );
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
    END LOOP;
END;
$$;

COMMENT ON TABLE public.prospeccion_plantilla_versiones IS
    'Versiones editables y publicables de plantillas de prospección.';
COMMENT ON TABLE public.prospeccion_plantilla_version_bloques IS
    'Bloques de composición del editor visual de correo.';
COMMENT ON TABLE public.prospeccion_plantilla_bloque_columnas IS
    'Dos columnas configurables de un bloque de composición.';
COMMENT ON TABLE public.prospeccion_plantilla_columna_elementos IS
    'Elementos internos ordenables dentro de una columna.';

COMMIT;
