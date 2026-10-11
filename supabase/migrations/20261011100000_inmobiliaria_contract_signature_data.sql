ALTER TABLE public.inmobiliaria_contratos_operacion
    ADD COLUMN IF NOT EXISTS fecha_firma date,
    ADD COLUMN IF NOT EXISTS parte_vendedora_nombre text,
    ADD COLUMN IF NOT EXISTS parte_vendedora_firmante text,
    ADD COLUMN IF NOT EXISTS parte_vendedora_cargo text;

COMMENT ON COLUMN public.inmobiliaria_contratos_operacion.fecha_firma IS
    'Fecha que el usuario establece para la firma del contrato; es independiente de la fecha de generación.';
COMMENT ON COLUMN public.inmobiliaria_contratos_operacion.parte_vendedora_nombre IS
    'Nombre de la empresa o persona que comparece como parte vendedora en este contrato.';
COMMENT ON COLUMN public.inmobiliaria_contratos_operacion.parte_vendedora_firmante IS
    'Nombre de la persona que firma por la parte vendedora o la inmobiliaria.';
COMMENT ON COLUMN public.inmobiliaria_contratos_operacion.parte_vendedora_cargo IS
    'Cargo de la persona que firma por la parte vendedora o la inmobiliaria.';

CREATE OR REPLACE FUNCTION public.crm_guardar_contrato_inmobiliario_v2(
    p_organizacion_id uuid,
    p_operacion_id uuid,
    p_plantilla_id uuid,
    p_contenido_generado text,
    p_cliente_principal_id uuid,
    p_fecha_firma date DEFAULT NULL,
    p_parte_vendedora_nombre text DEFAULT NULL,
    p_parte_vendedora_firmante text DEFAULT NULL,
    p_parte_vendedora_cargo text DEFAULT NULL,
    p_archivo_firmado_id uuid DEFAULT NULL,
    p_generado_por uuid DEFAULT NULL
)
RETURNS SETOF public.inmobiliaria_contratos_operacion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_template public.inmobiliaria_contrato_plantillas%ROWTYPE;
    v_person public.personas%ROWTYPE;
    v_contract public.inmobiliaria_contratos_operacion%ROWTYPE;
    v_version integer;
    v_vendedor_nombre text := nullif(btrim(coalesce(p_parte_vendedora_nombre, '')), '');
    v_vendedor_firmante text := nullif(btrim(coalesce(p_parte_vendedora_firmante, '')), '');
    v_vendedor_cargo text := nullif(btrim(coalesce(p_parte_vendedora_cargo, '')), '');
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'property_contract_organization_forbidden';
    END IF;
    IF length(btrim(COALESCE(p_contenido_generado, ''))) = 0 THEN
        RAISE EXCEPTION 'property_contract_content_required';
    END IF;

    SELECT * INTO v_operation
      FROM public.operaciones_inmobiliarias AS op
     WHERE op.id = p_operacion_id
       AND op.organizacion_id = p_organizacion_id
       AND op.estado IN ('borrador', 'apartada', 'reservada')
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_operation_not_found';
    END IF;

    SELECT * INTO v_template
      FROM public.inmobiliaria_contrato_plantillas AS tp
     WHERE tp.id = p_plantilla_id
       AND tp.organizacion_id = p_organizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_contract_template_not_found';
    END IF;

    SELECT * INTO v_person
      FROM public.personas AS person
     WHERE person.id = p_cliente_principal_id
       AND person.organizacion_id = p_organizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_contract_signer_not_found';
    END IF;

    SELECT COALESCE(max(ct.version_operacion), 0) + 1
      INTO v_version
      FROM public.inmobiliaria_contratos_operacion AS ct
     WHERE ct.operacion_id = p_operacion_id;

    INSERT INTO public.inmobiliaria_contratos_operacion (
        organizacion_id, operacion_id, plantilla_id, plantilla_version,
        version_operacion, estado, contenido_generado, archivo_firmado_id,
        generado_por, generado_en, firmado_en, fecha_firma,
        parte_vendedora_nombre, parte_vendedora_firmante, parte_vendedora_cargo
    ) VALUES (
        p_organizacion_id, p_operacion_id, p_plantilla_id, v_template.version,
        v_version,
        CASE WHEN p_archivo_firmado_id IS NULL THEN 'generado' ELSE 'firmado' END,
        p_contenido_generado, p_archivo_firmado_id, p_generado_por, now(),
        CASE WHEN p_archivo_firmado_id IS NULL THEN NULL ELSE now() END,
        p_fecha_firma, v_vendedor_nombre, v_vendedor_firmante, v_vendedor_cargo
    ) RETURNING * INTO v_contract;

    INSERT INTO public.inmobiliaria_contrato_firmantes (
        organizacion_id, contrato_id, persona_id, rol_firmante, orden_firma,
        nombre_completo, domicilio, correo, estado_firma, firmado_en
    ) VALUES (
        p_organizacion_id, v_contract.id, v_person.id, 'comprador_principal', 1,
        COALESCE(NULLIF(btrim(v_person.nombre_completo), ''), NULLIF(btrim(concat_ws(' ', v_person.nombre, v_person.apellido_paterno, v_person.apellido_materno)), '')),
        NULLIF(btrim(concat_ws(', ', v_person.municipio, v_person.entidad, v_person.pais)), ''),
        COALESCE(v_person.correo_principal, v_person.correo),
        CASE WHEN p_archivo_firmado_id IS NULL THEN 'pendiente' ELSE 'firmado' END,
        CASE WHEN p_archivo_firmado_id IS NULL THEN NULL ELSE now() END
    );

    IF v_vendedor_firmante IS NOT NULL THEN
        INSERT INTO public.inmobiliaria_contrato_firmantes (
            organizacion_id, contrato_id, rol_firmante, orden_firma,
            nombre_completo, estado_firma, firmado_en
        ) VALUES (
            p_organizacion_id, v_contract.id, 'representante_inmobiliaria', 2,
            v_vendedor_firmante,
            CASE WHEN p_archivo_firmado_id IS NULL THEN 'pendiente' ELSE 'firmado' END,
            CASE WHEN p_archivo_firmado_id IS NULL THEN NULL ELSE now() END
        );
    END IF;

    RETURN NEXT v_contract;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_guardar_contrato_inmobiliario_v2(uuid, uuid, uuid, text, uuid, date, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_contrato_inmobiliario_v2(uuid, uuid, uuid, text, uuid, date, text, text, text, uuid, uuid) TO authenticated, service_role;
