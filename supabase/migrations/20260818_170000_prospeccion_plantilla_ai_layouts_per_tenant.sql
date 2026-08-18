-- Corrige la biblioteca de layouts: los estilos base se clonan por tenant y
-- cada tenant puede administrarlos de forma independiente.

DROP TABLE IF EXISTS public.prospeccion_plantilla_ai_organizacion_layouts;

ALTER TABLE public.prospeccion_plantilla_ai_layouts
    DROP CONSTRAINT IF EXISTS prospeccion_plantilla_ai_layouts_codigo_key,
    ADD COLUMN IF NOT EXISTS organizacion_id uuid,
    ADD COLUMN IF NOT EXISTS habilitado boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS predeterminado boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS actualizado_por uuid;

ALTER TABLE public.prospeccion_plantilla_ai_layouts
    ADD CONSTRAINT prospeccion_plantilla_ai_layouts_organizacion_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    ADD CONSTRAINT prospeccion_plantilla_ai_layouts_actualizado_por_fkey
        FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

INSERT INTO public.prospeccion_plantilla_ai_layouts
    (organizacion_id, codigo, nombre, descripcion, instrucciones_composicion, canal, activo, orden, habilitado, predeterminado)
SELECT
    organizacion.id,
    layout.codigo,
    layout.nombre,
    layout.descripcion,
    layout.instrucciones_composicion,
    layout.canal,
    layout.activo,
    layout.orden,
    true,
    false
FROM public.organizaciones AS organizacion
CROSS JOIN public.prospeccion_plantilla_ai_layouts AS layout
WHERE layout.organizacion_id IS NULL;

DELETE FROM public.prospeccion_plantilla_ai_layouts
WHERE organizacion_id IS NULL;

ALTER TABLE public.prospeccion_plantilla_ai_layouts
    ALTER COLUMN organizacion_id SET NOT NULL;

ALTER TABLE public.prospeccion_plantilla_ai_layouts
    ADD CONSTRAINT prospeccion_plantilla_ai_layouts_org_codigo_key
        UNIQUE (organizacion_id, codigo);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_layouts_org_channel_idx
    ON public.prospeccion_plantilla_ai_layouts (organizacion_id, canal, activo, orden);

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_plantilla_ai_layouts_org_default_idx
    ON public.prospeccion_plantilla_ai_layouts (organizacion_id)
    WHERE predeterminado AND habilitado AND canal = 'correo';

DROP POLICY IF EXISTS prospeccion_plantilla_ai_layouts_authenticated_select
    ON public.prospeccion_plantilla_ai_layouts;

ALTER TABLE public.prospeccion_plantilla_ai_layouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.prospeccion_plantilla_ai_layouts TO authenticated;

CREATE POLICY prospeccion_plantilla_ai_layouts_tenant_select
    ON public.prospeccion_plantilla_ai_layouts
    FOR SELECT TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY prospeccion_plantilla_ai_layouts_tenant_admin_write
    ON public.prospeccion_plantilla_ai_layouts
    FOR ALL TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.es_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        AND public.es_admin((SELECT auth.uid()))
    );

CREATE OR REPLACE FUNCTION public.seed_prospeccion_template_ai_layouts_for_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.prospeccion_plantilla_ai_layouts
        (organizacion_id, codigo, nombre, descripcion, instrucciones_composicion, canal, activo, orden, habilitado, predeterminado)
    VALUES
        (NEW.id, 'editorial', 'Editorial', 'Narrativa ordenada y profesional.', 'Encabezado minimalista, título grande alineado a la izquierda, subtítulo, separador visual y dos o tres bloques narrativos antes del CTA final.', 'correo', true, 10, true, false),
        (NEW.id, 'hero_card', 'Hero card', 'Hero visual con beneficio principal destacado.', 'Encabezado de marca limpio, hero contrastante, titular de 28 a 36 px, introducción breve, tarjeta de beneficio y CTA inmediatamente después.', 'correo', true, 20, true, false),
        (NEW.id, 'minimal', 'Minimal', 'Composición limpia con mucho espacio en blanco.', 'Usa pocos elementos, tipografía grande, máximo dos bloques de contenido, un CTA prominente y evita tarjetas innecesarias.', 'correo', true, 30, true, false),
        (NEW.id, 'dark_header', 'Dark header', 'Encabezado oscuro con contenido claro.', 'Usa un encabezado o hero oscuro de alto contraste, contenido principal sobre fondo claro y una tarjeta central de beneficio con CTA.', 'correo', true, 40, true, false),
        (NEW.id, 'feature_cards', 'Feature cards', 'Beneficios organizados en tarjetas apiladas.', 'Incluye hero breve, introducción y dos o tres tarjetas visuales apiladas; cada tarjeta debe tener título corto y explicación, seguida de un CTA.', 'correo', true, 50, true, false),
        (NEW.id, 'problem_solution', 'Problem solution', 'Problema y solución en bloques diferenciados.', 'Presenta el problema principal, diferencia visualmente la solución, resume beneficios y termina con un CTA claro.', 'correo', true, 60, true, false),
        (NEW.id, 'product_showcase', 'Product showcase', 'Presentación visual de producto o servicio.', 'Prioriza la propuesta del producto o servicio, una imagen autorizada cuando exista, beneficios concretos y un CTA principal.', 'correo', true, 70, true, false),
        (NEW.id, 'case_study', 'Case study', 'Estructura de caso o historia de resultado.', 'Organiza el contenido en situación, intervención y resultado; solo utiliza evidencia autorizada y termina con un CTA.', 'correo', true, 80, true, false),
        (NEW.id, 'personal_letter', 'Personal letter', 'Correo personal premium y conversacional.', 'Sin hero gráfico, encabezado mínimo, texto conversacional, una sección destacada y CTA discreto.', 'correo', true, 90, true, false),
        (NEW.id, 'announcement', 'Announcement', 'Anuncio con mensaje principal destacado.', 'Presenta un anuncio claro, titular destacado, información complementaria breve y un CTA visible.', 'correo', true, 100, true, false)
    ON CONFLICT (organizacion_id, codigo) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_seed_prospeccion_template_ai_layouts
    ON public.organizaciones;

CREATE TRIGGER t_seed_prospeccion_template_ai_layouts
    AFTER INSERT ON public.organizaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.seed_prospeccion_template_ai_layouts_for_organization();

COMMENT ON TABLE public.prospeccion_plantilla_ai_layouts IS
    'Biblioteca inicial y personalizada de estilos de diseño de cada tenant para plantillas IA.';
COMMENT ON COLUMN public.prospeccion_plantilla_ai_layouts.instrucciones_composicion IS
    'Instrucciones editables por el tenant que se envían al prompt cuando el estilo está habilitado.';
