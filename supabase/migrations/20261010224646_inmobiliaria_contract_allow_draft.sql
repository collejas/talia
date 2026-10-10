CREATE OR REPLACE FUNCTION public.crm_guardar_contrato_inmobiliario(
    p_organizacion_id uuid,
    p_operacion_id uuid,
    p_plantilla_id uuid,
    p_contenido_generado text,
    p_cliente_principal_id uuid,
    p_archivo_firmado_id uuid DEFAULT NULL,
    p_generado_por uuid DEFAULT NULL
)
RETURNS SETOF public.inmobiliaria_contratos_operacion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_template public.inmobiliaria_contrato_plantillas%ROWTYPE;
    v_person public.personas%ROWTYPE;
    v_contract public.inmobiliaria_contratos_operacion%ROWTYPE;
    v_version integer;
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'property_contract_organization_forbidden';
    END IF;
    IF length(btrim(COALESCE(p_contenido_generado, ''))) = 0 THEN
        RAISE EXCEPTION 'property_contract_content_required';
    END IF;
    SELECT * INTO v_operation FROM public.operaciones_inmobiliarias AS op
     WHERE op.id = p_operacion_id AND op.organizacion_id = p_organizacion_id
       AND op.estado IN ('borrador', 'apartada', 'reservada') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_operation_not_found'; END IF;
    SELECT * INTO v_template FROM public.inmobiliaria_contrato_plantillas AS tp
     WHERE tp.id = p_plantilla_id AND tp.organizacion_id = p_organizacion_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_contract_template_not_found'; END IF;
    SELECT * INTO v_person FROM public.personas AS person
     WHERE person.id = p_cliente_principal_id AND person.organizacion_id = p_organizacion_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'property_contract_signer_not_found'; END IF;
    SELECT COALESCE(max(ct.version_operacion), 0) + 1 INTO v_version
      FROM public.inmobiliaria_contratos_operacion AS ct WHERE ct.operacion_id = p_operacion_id;
    INSERT INTO public.inmobiliaria_contratos_operacion (
        organizacion_id, operacion_id, plantilla_id, plantilla_version, version_operacion,
        estado, contenido_generado, archivo_firmado_id, generado_por, generado_en, firmado_en
    ) VALUES (
        p_organizacion_id, p_operacion_id, p_plantilla_id, v_template.version, v_version,
        CASE WHEN p_archivo_firmado_id IS NULL THEN 'generado' ELSE 'firmado' END,
        p_contenido_generado, p_archivo_firmado_id, p_generado_por, now(),
        CASE WHEN p_archivo_firmado_id IS NULL THEN NULL ELSE now() END
    ) RETURNING * INTO v_contract;
    INSERT INTO public.inmobiliaria_contrato_firmantes (
        organizacion_id, contrato_id, persona_id, rol_firmante, orden_firma, nombre_completo,
        correo, estado_firma, firmado_en
    ) VALUES (
        p_organizacion_id, v_contract.id, v_person.id, 'comprador_principal', 1,
        COALESCE(NULLIF(btrim(v_person.nombre_completo), ''), NULLIF(btrim(concat_ws(' ', v_person.nombre, v_person.apellido_paterno, v_person.apellido_materno)), ''), 'Sin nombre'),
        COALESCE(v_person.correo_principal, v_person.correo),
        CASE WHEN p_archivo_firmado_id IS NULL THEN 'pendiente' ELSE 'firmado' END,
        CASE WHEN p_archivo_firmado_id IS NULL THEN NULL ELSE now() END
    );
    RETURN NEXT v_contract;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_guardar_contrato_inmobiliario(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_contrato_inmobiliario(uuid, uuid, uuid, text, uuid, uuid, uuid) TO authenticated, service_role;
