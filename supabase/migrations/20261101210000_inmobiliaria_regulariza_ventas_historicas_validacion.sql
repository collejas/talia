BEGIN;

-- Regulariza únicamente las dos ventas históricas ya identificadas en
-- Gran Peñón. Conserva la venta, la oportunidad y la unidad como cerradas;
-- solo las incorpora al expediente pendiente de validación.
UPDATE public.operaciones_inmobiliarias
   SET estado_validacion = 'pendiente_revision',
       enviado_a_validacion_en = COALESCE(enviado_a_validacion_en, creado_en, now()),
       enviado_a_validacion_por = NULL,
       observaciones_validacion = 'Regularización histórica posterior al refactor; requiere completar expediente inmobiliario.',
       actualizado_en = now()
 WHERE organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'::uuid
   AND id IN (
       '9090dc8a-b613-4aa3-9b65-208967a06e30'::uuid,
       '983beb5a-4b07-4f6c-8b0d-e49ea3302e68'::uuid
   )
   AND estado = 'vendida'
   AND estado_validacion = 'pendiente_captura';

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_validacion_historica_idx
    ON public.operaciones_inmobiliarias (
        organizacion_id,
        estado_validacion,
        enviado_a_validacion_en ASC,
        actualizado_en ASC
    )
    WHERE estado IN ('apartada', 'vendida')
      AND estado_validacion IN ('pendiente_revision', 'en_revision');

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
       AND op.estado IN ('apartada', 'vendida')
       AND op.estado_validacion IN ('pendiente_revision', 'en_revision')
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_apartado_validation_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(v_required) required_type
         WHERE NOT EXISTS (
             SELECT 1
               FROM public.inmobiliaria_operacion_documentos doc
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

COMMIT;
