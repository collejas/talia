BEGIN;

ALTER TABLE public.operaciones_inmobiliarias
    ADD COLUMN IF NOT EXISTS estado_validacion text NOT NULL DEFAULT 'pendiente_captura',
    ADD COLUMN IF NOT EXISTS enviado_a_validacion_en timestamptz,
    ADD COLUMN IF NOT EXISTS enviado_a_validacion_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS validado_en timestamptz,
    ADD COLUMN IF NOT EXISTS validado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS observaciones_validacion text;

ALTER TABLE public.operaciones_inmobiliarias
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_estado_validacion_chk;

ALTER TABLE public.operaciones_inmobiliarias
    ADD CONSTRAINT operaciones_inmobiliarias_estado_validacion_chk
    CHECK (estado_validacion IN (
        'pendiente_captura', 'pendiente_revision', 'en_revision',
        'requiere_correccion', 'firme'
    ));

COMMENT ON COLUMN public.operaciones_inmobiliarias.estado_validacion IS
    'Validación del expediente del apartado; no sustituye el estado comercial de la propiedad.';

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_validacion_pendiente_idx
    ON public.operaciones_inmobiliarias (organizacion_id, enviado_a_validacion_en ASC, actualizado_en ASC)
    WHERE estado = 'apartada' AND estado_validacion = 'pendiente_revision';

CREATE TABLE IF NOT EXISTS public.inmobiliaria_operacion_documentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    operacion_id uuid NOT NULL REFERENCES public.operaciones_inmobiliarias(id) ON DELETE CASCADE,
    persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    tipo_documento text NOT NULL,
    archivo_id uuid NOT NULL,
    estado_revision text NOT NULL DEFAULT 'pendiente',
    observaciones_revision text,
    subido_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    revisado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    subido_en timestamptz NOT NULL DEFAULT now(),
    revisado_en timestamptz,
    CONSTRAINT inmobiliaria_operacion_documentos_tipo_chk CHECK (tipo_documento IN (
        'acta_nacimiento', 'acta_matrimonio', 'ine',
        'constancia_situacion_fiscal', 'curp', 'comprobante_domicilio'
    )),
    CONSTRAINT inmobiliaria_operacion_documentos_estado_chk CHECK (
        estado_revision IN ('pendiente', 'aprobado', 'requiere_correccion')
    ),
    CONSTRAINT inmobiliaria_operacion_documentos_archivo_org_fkey
        FOREIGN KEY (organizacion_id, archivo_id)
        REFERENCES public.archivos(organizacion_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS inmobiliaria_operacion_documentos_tipo_uidx
    ON public.inmobiliaria_operacion_documentos (organizacion_id, operacion_id, persona_id, tipo_documento);
CREATE INDEX IF NOT EXISTS inmobiliaria_operacion_documentos_revision_idx
    ON public.inmobiliaria_operacion_documentos (organizacion_id, estado_revision, subido_en DESC);

ALTER TABLE public.inmobiliaria_operacion_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_operacion_documentos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.inmobiliaria_operacion_documentos FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.inmobiliaria_operacion_documentos TO authenticated;

DROP POLICY IF EXISTS inmobiliaria_operacion_documentos_org ON public.inmobiliaria_operacion_documentos;
CREATE POLICY inmobiliaria_operacion_documentos_org
    ON public.inmobiliaria_operacion_documentos
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.crm_enviar_apartado_validacion(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS SETOF public.operaciones_inmobiliarias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_required text[] := ARRAY[
        'acta_nacimiento', 'ine', 'constancia_situacion_fiscal',
        'curp', 'comprobante_domicilio'
    ];
    v_missing text[];
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT op.* INTO v_operation
      FROM public.operaciones_inmobiliarias op
     WHERE op.organizacion_id = p_organizacion_id
       AND op.unidad_id = p_unidad_id
       AND op.estado = 'apartada'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_apartado_not_found' USING ERRCODE = 'P0001';
    END IF;

    SELECT array_agg(required_type ORDER BY required_type)
      INTO v_missing
      FROM unnest(v_required) AS required_type
     WHERE NOT EXISTS (
         SELECT 1
           FROM public.inmobiliaria_operacion_documentos doc
          WHERE doc.organizacion_id = p_organizacion_id
            AND doc.operacion_id = v_operation.id
            AND doc.persona_id = v_operation.cliente_principal_id
            AND doc.tipo_documento = required_type
     );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'property_apartado_documents_required:%', array_to_string(v_missing, ',') USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.operaciones_inmobiliarias
       SET estado_validacion = 'pendiente_revision',
           enviado_a_validacion_en = now(),
           enviado_a_validacion_por = p_usuario_id,
           observaciones_validacion = NULL,
           actualizado_en = now()
     WHERE id = v_operation.id
     RETURNING * INTO v_operation;
    RETURN NEXT v_operation;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_validar_apartado_firme(
    p_organizacion_id uuid,
    p_operacion_id uuid,
    p_usuario_id uuid,
    p_observaciones text DEFAULT NULL
)
RETURNS SETOF public.operaciones_inmobiliarias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_required text[] := ARRAY[
        'acta_nacimiento', 'ine', 'constancia_situacion_fiscal',
        'curp', 'comprobante_domicilio'
    ];
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT op.* INTO v_operation
      FROM public.operaciones_inmobiliarias op
     WHERE op.organizacion_id = p_organizacion_id
       AND op.id = p_operacion_id
       AND op.estado = 'apartada'
       AND op.estado_validacion IN ('pendiente_revision', 'en_revision')
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_apartado_validation_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(v_required) required_type
         WHERE NOT EXISTS (
             SELECT 1 FROM public.inmobiliaria_operacion_documentos doc
              WHERE doc.organizacion_id = p_organizacion_id
                AND doc.operacion_id = v_operation.id
                AND doc.persona_id = v_operation.cliente_principal_id
                AND doc.tipo_documento = required_type
                AND doc.estado_revision = 'aprobado'
         )
    ) THEN
        RAISE EXCEPTION 'property_apartado_documents_not_approved' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.inmobiliaria_contratos_operacion contract
         WHERE contract.organizacion_id = p_organizacion_id
           AND contract.operacion_id = v_operation.id
           AND contract.estado = 'firmado'
           AND contract.archivo_firmado_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'property_apartado_signed_contract_required' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.operaciones_inmobiliarias
       SET estado_validacion = 'firme',
           validado_en = now(),
           validado_por_usuario_id = p_usuario_id,
           observaciones_validacion = nullif(btrim(p_observaciones), ''),
           actualizado_en = now()
     WHERE id = v_operation.id
     RETURNING * INTO v_operation;
    RETURN NEXT v_operation;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_enviar_apartado_validacion(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_enviar_apartado_validacion(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_validar_apartado_firme(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_validar_apartado_firme(uuid, uuid, uuid, text) TO authenticated, service_role;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES
    ('inmobiliaria.apartados.validate', 'Validar expedientes y apartados inmobiliarios', 575)
ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true, actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inmobiliaria.apartados.validate'),
    ('admin_operativo', 'inmobiliaria.apartados.validate'),
    ('coordinador', 'inmobiliaria.apartados.validate'),
    ('gerente_comercial', 'inmobiliaria.apartados.validate')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
CROSS JOIN public.tenant_default_permissions p
WHERE p.codigo = 'inmobiliaria.apartados.validate'
ON CONFLICT (organizacion_id, codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion;

WITH role_scope AS (
    SELECT 'inmobiliaria.apartados.validate'::text AS codigo,
           unnest(ARRAY['owner', 'admin_operativo', 'coordinador', 'gerente_comercial']) AS role_name
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT role.organizacion_id, role.id, permission.id
FROM public.roles role
JOIN role_scope scope ON lower(trim(role.nombre)) = scope.role_name
JOIN public.permisos permission
  ON permission.organizacion_id = role.organizacion_id AND permission.codigo = scope.codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
