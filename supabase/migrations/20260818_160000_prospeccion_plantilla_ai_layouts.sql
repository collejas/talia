-- Biblioteca controlada de estilos de diseño para el asistente IA de plantillas.
-- La composición se modela fuera del sistema visual de marca y sin JSON estructural.

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_ai_layouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text NOT NULL,
    instrucciones_composicion text NOT NULL,
    canal text NOT NULL DEFAULT 'correo',
    activo boolean NOT NULL DEFAULT true,
    orden integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_ai_layouts_codigo_key UNIQUE (codigo),
    CONSTRAINT prospeccion_plantilla_ai_layouts_codigo_chk
        CHECK (codigo ~ '^[a-z][a-z0-9_]{1,79}$'),
    CONSTRAINT prospeccion_plantilla_ai_layouts_nombre_chk
        CHECK (btrim(nombre) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_layouts_descripcion_chk
        CHECK (btrim(descripcion) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_layouts_instrucciones_chk
        CHECK (btrim(instrucciones_composicion) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_layouts_canal_chk
        CHECK (canal IN ('correo', 'whatsapp')),
    CONSTRAINT prospeccion_plantilla_ai_layouts_orden_chk
        CHECK (orden >= 0)
);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_ai_organizacion_layouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    layout_id uuid NOT NULL,
    habilitado boolean NOT NULL DEFAULT true,
    predeterminado boolean NOT NULL DEFAULT false,
    actualizado_por uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_ai_org_layouts_org_layout_key
        UNIQUE (organizacion_id, layout_id),
    CONSTRAINT prospeccion_plantilla_ai_org_layouts_org_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT prospeccion_plantilla_ai_org_layouts_layout_fkey
        FOREIGN KEY (layout_id) REFERENCES public.prospeccion_plantilla_ai_layouts(id) ON DELETE CASCADE,
    CONSTRAINT prospeccion_plantilla_ai_org_layouts_user_fkey
        FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_plantilla_ai_org_layouts_default_idx
    ON public.prospeccion_plantilla_ai_organizacion_layouts (organizacion_id)
    WHERE predeterminado AND habilitado;

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_layouts_channel_active_idx
    ON public.prospeccion_plantilla_ai_layouts (canal, activo, orden);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_org_layouts_org_enabled_idx
    ON public.prospeccion_plantilla_ai_organizacion_layouts (organizacion_id, habilitado, predeterminado);


INSERT INTO public.prospeccion_plantilla_ai_layouts
    (codigo, nombre, descripcion, instrucciones_composicion, canal, orden)
VALUES
    ('editorial', 'Editorial', 'Narrativa ordenada y profesional.', 'Encabezado minimalista, título grande alineado a la izquierda, subtítulo, separador visual y dos o tres bloques narrativos antes del CTA final.', 'correo', 10),
    ('hero_card', 'Hero card', 'Hero visual con beneficio principal destacado.', 'Encabezado de marca limpio, hero contrastante, titular de 28 a 36 px, introducción breve, tarjeta de beneficio y CTA inmediatamente después.', 'correo', 20),
    ('minimal', 'Minimal', 'Composición limpia con mucho espacio en blanco.', 'Usa pocos elementos, tipografía grande, máximo dos bloques de contenido, un CTA prominente y evita tarjetas innecesarias.', 'correo', 30),
    ('dark_header', 'Dark header', 'Encabezado oscuro con contenido claro.', 'Usa un encabezado o hero oscuro de alto contraste, contenido principal sobre fondo claro y una tarjeta central de beneficio con CTA.', 'correo', 40),
    ('feature_cards', 'Feature cards', 'Beneficios organizados en tarjetas apiladas.', 'Incluye hero breve, introducción y dos o tres tarjetas visuales apiladas; cada tarjeta debe tener título corto y explicación, seguida de un CTA.', 'correo', 50),
    ('problem_solution', 'Problem solution', 'Problema y solución en bloques diferenciados.', 'Presenta el problema principal, diferencia visualmente la solución, resume beneficios y termina con un CTA claro.', 'correo', 60),
    ('product_showcase', 'Product showcase', 'Presentación visual de producto o servicio.', 'Prioriza la propuesta del producto o servicio, una imagen autorizada cuando exista, beneficios concretos y un CTA principal.', 'correo', 70),
    ('case_study', 'Case study', 'Estructura de caso o historia de resultado.', 'Organiza el contenido en situación, intervención y resultado; solo utiliza evidencia autorizada y termina con un CTA.', 'correo', 80),
    ('personal_letter', 'Personal letter', 'Correo personal premium y conversacional.', 'Sin hero gráfico, encabezado mínimo, texto conversacional, una sección destacada y CTA discreto.', 'correo', 90),
    ('announcement', 'Announcement', 'Anuncio con mensaje principal destacado.', 'Presenta un anuncio claro, titular destacado, información complementaria breve y un CTA visible.', 'correo', 100)
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    instrucciones_composicion = EXCLUDED.instrucciones_composicion,
    canal = EXCLUDED.canal,
    orden = EXCLUDED.orden,
    actualizado_en = now();

ALTER TABLE public.prospeccion_plantilla_ai_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_plantilla_ai_organizacion_layouts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.prospeccion_plantilla_ai_layouts TO authenticated;
GRANT SELECT ON public.prospeccion_plantilla_ai_organizacion_layouts TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_layouts'
          AND policyname = 'prospeccion_plantilla_ai_layouts_authenticated_select'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_layouts_authenticated_select
            ON public.prospeccion_plantilla_ai_layouts
            FOR SELECT TO authenticated
            USING (activo);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_organizacion_layouts'
          AND policyname = 'prospeccion_plantilla_ai_org_layouts_tenant_select'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_org_layouts_tenant_select
            ON public.prospeccion_plantilla_ai_organizacion_layouts
            FOR SELECT TO authenticated
            USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_organizacion_layouts'
          AND policyname = 'prospeccion_plantilla_ai_org_layouts_admin_write'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_org_layouts_admin_write
            ON public.prospeccion_plantilla_ai_organizacion_layouts
            FOR ALL TO authenticated
            USING (
                organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
                AND public.es_admin((SELECT auth.uid()))
            )
            WITH CHECK (
                organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
                AND public.es_admin((SELECT auth.uid()))
            );
    END IF;
END;
$$;

COMMENT ON TABLE public.prospeccion_plantilla_ai_layouts IS
    'Catalogo global y explicito de composiciones permitidas para plantillas IA.';
COMMENT ON TABLE public.prospeccion_plantilla_ai_organizacion_layouts IS
    'Layouts habilitados y predeterminados por tenant; no contiene configuracion JSON.';
