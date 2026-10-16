CREATE TABLE IF NOT EXISTS public.inmobiliaria_operacion_cambios_comprador (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    operacion_id uuid NOT NULL REFERENCES public.operaciones_inmobiliarias(id) ON DELETE CASCADE,
    comprador_anterior_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
    comprador_nuevo_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    oportunidad_anterior_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
    oportunidad_nueva_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
    motivo text NOT NULL,
    documentos_invalidados integer NOT NULL DEFAULT 0 CHECK (documentos_invalidados >= 0),
    contratos_cancelados integer NOT NULL DEFAULT 0 CHECK (contratos_cancelados >= 0),
    cambiado_por_usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    cambiado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inmobiliaria_cambio_comprador_operacion_idx
    ON public.inmobiliaria_operacion_cambios_comprador (organizacion_id, operacion_id, cambiado_en DESC);
CREATE INDEX IF NOT EXISTS inmobiliaria_cambio_comprador_usuario_idx
    ON public.inmobiliaria_operacion_cambios_comprador (organizacion_id, cambiado_por_usuario_id, cambiado_en DESC);

ALTER TABLE public.inmobiliaria_operacion_cambios_comprador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_operacion_cambios_comprador FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.inmobiliaria_operacion_cambios_comprador FROM anon;
GRANT SELECT, INSERT ON public.inmobiliaria_operacion_cambios_comprador TO authenticated;

DROP POLICY IF EXISTS inmobiliaria_cambio_comprador_org ON public.inmobiliaria_operacion_cambios_comprador;
CREATE POLICY inmobiliaria_cambio_comprador_org
    ON public.inmobiliaria_operacion_cambios_comprador
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.crm_cambiar_comprador_operacion(
    p_organizacion_id uuid,
    p_operacion_id uuid,
    p_comprador_nuevo_id uuid,
    p_oportunidad_nueva_id uuid DEFAULT NULL,
    p_motivo text DEFAULT NULL,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS SETOF public.inmobiliaria_operacion_cambios_comprador
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_new_person public.personas%ROWTYPE;
    v_change public.inmobiliaria_operacion_cambios_comprador%ROWTYPE;
    v_old_buyer uuid;
    v_old_opportunity uuid;
    v_documents_invalidated integer := 0;
    v_contracts_cancelled integer := 0;
    v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_usuario_id IS NULL THEN
        RAISE EXCEPTION 'property_buyer_change_user_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_motivo IS NULL THEN
        RAISE EXCEPTION 'property_buyer_change_reason_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_operation
      FROM public.operaciones_inmobiliarias
     WHERE id = p_operacion_id
       AND organizacion_id = p_organizacion_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_operation_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_operation.estado_validacion = 'firme' THEN
        RAISE EXCEPTION 'property_buyer_change_not_allowed_firme' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.propiedad_unidades u
         WHERE u.id = v_operation.unidad_id
           AND u.status = 'vendido'::public.propiedad_status
    ) THEN
        RAISE EXCEPTION 'property_buyer_change_not_allowed_vendido' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_new_person
      FROM public.personas
     WHERE id = p_comprador_nuevo_id
       AND organizacion_id = p_organizacion_id
       AND archived_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_client_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF p_oportunidad_nueva_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.oportunidades
         WHERE id = p_oportunidad_nueva_id
           AND organizacion_id = p_organizacion_id
    ) THEN
        RAISE EXCEPTION 'property_opportunity_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF p_comprador_nuevo_id = v_operation.cliente_principal_id
       AND p_oportunidad_nueva_id IS NOT DISTINCT FROM v_operation.oportunidad_id THEN
        RAISE EXCEPTION 'property_buyer_change_without_changes' USING ERRCODE = 'P0001';
    END IF;

    v_old_buyer := v_operation.cliente_principal_id;
    v_old_opportunity := v_operation.oportunidad_id;

    UPDATE public.inmobiliaria_operacion_documentos
       SET estado_revision = 'requiere_correccion',
           observaciones_revision = concat(
               'Documento invalidado por cambio de comprador el ',
               to_char(now(), 'YYYY-MM-DD HH24:MI:SS TZH:TZM'),
               '. Debe cargarse nuevamente para el comprador correcto.'
           ),
           revisado_por_usuario_id = p_usuario_id,
           revisado_en = now()
     WHERE organizacion_id = p_organizacion_id
       AND operacion_id = p_operacion_id
       AND estado_revision <> 'requiere_correccion';
    GET DIAGNOSTICS v_documents_invalidated = ROW_COUNT;

    UPDATE public.inmobiliaria_contratos_operacion
       SET estado = 'cancelado',
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id
       AND operacion_id = p_operacion_id
       AND estado <> 'cancelado';
    GET DIAGNOSTICS v_contracts_cancelled = ROW_COUNT;

    UPDATE public.operaciones_inmobiliarias
       SET cliente_principal_id = p_comprador_nuevo_id,
           oportunidad_id = p_oportunidad_nueva_id,
           estado_validacion = 'pendiente_captura',
           enviado_a_validacion_en = NULL,
           enviado_a_validacion_por = NULL,
           validado_en = NULL,
           validado_por_usuario_id = NULL,
           observaciones_validacion = NULL,
           actualizado_en = now()
     WHERE id = p_operacion_id;

    INSERT INTO public.inmobiliaria_operacion_cambios_comprador (
        organizacion_id, operacion_id,
        comprador_anterior_id, comprador_nuevo_id,
        oportunidad_anterior_id, oportunidad_nueva_id,
        motivo, documentos_invalidados, contratos_cancelados,
        cambiado_por_usuario_id
    ) VALUES (
        p_organizacion_id, p_operacion_id,
        v_old_buyer, p_comprador_nuevo_id,
        v_old_opportunity, p_oportunidad_nueva_id,
        v_motivo, v_documents_invalidated, v_contracts_cancelled,
        p_usuario_id
    ) RETURNING * INTO v_change;

    RETURN NEXT v_change;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_cambiar_comprador_operacion(uuid, uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_cambiar_comprador_operacion(uuid, uuid, uuid, uuid, text, uuid) TO authenticated, service_role;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES ('inmobiliaria.apartados.change_buyer', 'Corregir comprador y oportunidad de apartados inmobiliarios', 576)
ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true, actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inmobiliaria.apartados.change_buyer'),
    ('admin_operativo', 'inmobiliaria.apartados.change_buyer'),
    ('coordinador', 'inmobiliaria.apartados.change_buyer'),
    ('gerente_comercial', 'inmobiliaria.apartados.change_buyer')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
CROSS JOIN public.tenant_default_permissions p
WHERE p.codigo = 'inmobiliaria.apartados.change_buyer'
ON CONFLICT (organizacion_id, codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion;

WITH role_scope AS (
    SELECT 'inmobiliaria.apartados.change_buyer'::text AS codigo,
           unnest(ARRAY['owner', 'admin_operativo', 'coordinador', 'gerente_comercial']) AS role_name
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT role.organizacion_id, role.id, permission.id
FROM public.roles role
JOIN role_scope scope ON lower(trim(role.nombre)) = scope.role_name
JOIN public.permisos permission
  ON permission.organizacion_id = role.organizacion_id AND permission.codigo = scope.codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;
