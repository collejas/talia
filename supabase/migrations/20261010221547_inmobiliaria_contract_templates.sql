CREATE TABLE IF NOT EXISTS public.inmobiliaria_contrato_plantillas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    tipo_operacion text NOT NULL DEFAULT 'reserva',
    version integer NOT NULL DEFAULT 1,
    contenido_plantilla text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inmobiliaria_contrato_plantillas_nombre_chk CHECK (length(btrim(nombre)) > 0),
    CONSTRAINT inmobiliaria_contrato_plantillas_tipo_chk CHECK (tipo_operacion IN ('reserva', 'compraventa', 'otro')),
    CONSTRAINT inmobiliaria_contrato_plantillas_version_chk CHECK (version > 0),
    CONSTRAINT inmobiliaria_contrato_plantillas_contenido_chk CHECK (length(btrim(contenido_plantilla)) > 0),
    CONSTRAINT inmobiliaria_contrato_plantillas_unique_version UNIQUE (organizacion_id, nombre, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS inmobiliaria_contrato_plantillas_active_uidx
    ON public.inmobiliaria_contrato_plantillas (organizacion_id, nombre)
    WHERE activo;

CREATE INDEX IF NOT EXISTS inmobiliaria_contrato_plantillas_org_tipo_idx
    ON public.inmobiliaria_contrato_plantillas (organizacion_id, tipo_operacion, activo);

COMMENT ON TABLE public.inmobiliaria_contrato_plantillas IS
    'Plantillas de contratos configuradas por cada tenant inmobiliario.';
COMMENT ON COLUMN public.inmobiliaria_contrato_plantillas.contenido_plantilla IS
    'Texto editable con variables explícitas como {{comprador.nombre_completo}}.';

CREATE TABLE IF NOT EXISTS public.inmobiliaria_contratos_operacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    operacion_id uuid NOT NULL REFERENCES public.operaciones_inmobiliarias(id) ON DELETE RESTRICT,
    plantilla_id uuid REFERENCES public.inmobiliaria_contrato_plantillas(id) ON DELETE RESTRICT,
    plantilla_version integer NOT NULL,
    version_operacion integer NOT NULL DEFAULT 1,
    estado text NOT NULL DEFAULT 'borrador',
    contenido_generado text,
    archivo_generado_id uuid REFERENCES public.archivos(id) ON DELETE SET NULL,
    archivo_firmado_id uuid REFERENCES public.archivos(id) ON DELETE SET NULL,
    generado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    generado_en timestamptz,
    firmado_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inmobiliaria_contratos_operacion_version_chk CHECK (plantilla_version > 0 AND version_operacion > 0),
    CONSTRAINT inmobiliaria_contratos_operacion_estado_chk CHECK (estado IN ('borrador', 'generado', 'firmado', 'cancelado')),
    CONSTRAINT inmobiliaria_contratos_operacion_content_chk CHECK (
        estado IN ('borrador', 'cancelado') OR length(btrim(COALESCE(contenido_generado, ''))) > 0
    ),
    CONSTRAINT inmobiliaria_contratos_operacion_unique_version UNIQUE (operacion_id, version_operacion)
);

CREATE INDEX IF NOT EXISTS inmobiliaria_contratos_operacion_org_estado_idx
    ON public.inmobiliaria_contratos_operacion (organizacion_id, estado, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS inmobiliaria_contratos_operacion_org_operacion_idx
    ON public.inmobiliaria_contratos_operacion (organizacion_id, operacion_id, version_operacion DESC);

COMMENT ON TABLE public.inmobiliaria_contratos_operacion IS
    'Versiones generadas de contratos vinculadas a una operación inmobiliaria; conserva el texto usado para cada documento.';
COMMENT ON COLUMN public.inmobiliaria_contratos_operacion.contenido_generado IS
    'Snapshot inmutable del contrato después de sustituir las variables de la plantilla.';

CREATE TABLE IF NOT EXISTS public.inmobiliaria_contrato_firmantes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    contrato_id uuid NOT NULL REFERENCES public.inmobiliaria_contratos_operacion(id) ON DELETE CASCADE,
    persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
    rol_firmante text NOT NULL,
    orden_firma smallint NOT NULL DEFAULT 1,
    nombre_completo text NOT NULL,
    tipo_persona text,
    rfc text,
    curp text,
    domicilio text,
    correo text,
    estado_firma text NOT NULL DEFAULT 'pendiente',
    firmado_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inmobiliaria_contrato_firmantes_rol_chk CHECK (rol_firmante IN ('comprador_principal', 'comprador_adicional', 'propietario', 'representante_legal', 'representante_inmobiliaria', 'otro')),
    CONSTRAINT inmobiliaria_contrato_firmantes_orden_chk CHECK (orden_firma > 0),
    CONSTRAINT inmobiliaria_contrato_firmantes_estado_chk CHECK (estado_firma IN ('pendiente', 'firmado', 'rechazado')),
    CONSTRAINT inmobiliaria_contrato_firmantes_nombre_chk CHECK (length(btrim(nombre_completo)) > 0)
);

CREATE INDEX IF NOT EXISTS inmobiliaria_contrato_firmantes_org_contrato_idx
    ON public.inmobiliaria_contrato_firmantes (organizacion_id, contrato_id, orden_firma);
CREATE INDEX IF NOT EXISTS inmobiliaria_contrato_firmantes_org_persona_idx
    ON public.inmobiliaria_contrato_firmantes (organizacion_id, persona_id)
    WHERE persona_id IS NOT NULL;

COMMENT ON TABLE public.inmobiliaria_contrato_firmantes IS
    'Firmantes y snapshot de los datos usados en cada contrato inmobiliario.';

ALTER TABLE public.inmobiliaria_contrato_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_contrato_plantillas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_contratos_operacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_contratos_operacion FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_contrato_firmantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_contrato_firmantes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.inmobiliaria_contrato_plantillas FROM anon;
REVOKE ALL ON public.inmobiliaria_contratos_operacion FROM anon;
REVOKE ALL ON public.inmobiliaria_contrato_firmantes FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.inmobiliaria_contrato_plantillas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inmobiliaria_contratos_operacion TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inmobiliaria_contrato_firmantes TO authenticated;

DROP POLICY IF EXISTS inmobiliaria_contrato_plantillas_org ON public.inmobiliaria_contrato_plantillas;
CREATE POLICY inmobiliaria_contrato_plantillas_org
    ON public.inmobiliaria_contrato_plantillas
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

DROP POLICY IF EXISTS inmobiliaria_contratos_operacion_org ON public.inmobiliaria_contratos_operacion;
CREATE POLICY inmobiliaria_contratos_operacion_org
    ON public.inmobiliaria_contratos_operacion
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

DROP POLICY IF EXISTS inmobiliaria_contrato_firmantes_org ON public.inmobiliaria_contrato_firmantes;
CREATE POLICY inmobiliaria_contrato_firmantes_org
    ON public.inmobiliaria_contrato_firmantes
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));
