BEGIN;

-- Una cotizacion reemplazada conserva su historial y deja una relacion
-- explicita con la nueva propuesta.
ALTER TABLE public.cotizaciones
    ADD COLUMN IF NOT EXISTS sustituida_por_cotizacion_id uuid;

ALTER TABLE public.cotizaciones
    DROP CONSTRAINT IF EXISTS cotizaciones_sustituida_por_fkey;

ALTER TABLE public.cotizaciones
    ADD CONSTRAINT cotizaciones_sustituida_por_fkey
        FOREIGN KEY (sustituida_por_cotizacion_id)
        REFERENCES public.cotizaciones(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cotizaciones_org_sustituida_por_idx
    ON public.cotizaciones (organizacion_id, sustituida_por_cotizacion_id)
    WHERE sustituida_por_cotizacion_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inmobiliaria_operacion_cambios_unidad (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    operacion_id uuid NOT NULL REFERENCES public.operaciones_inmobiliarias(id) ON DELETE RESTRICT,
    oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE RESTRICT,
    unidad_anterior_id uuid NOT NULL REFERENCES public.propiedad_unidades(id) ON DELETE RESTRICT,
    unidad_nueva_id uuid NOT NULL REFERENCES public.propiedad_unidades(id) ON DELETE RESTRICT,
    cotizacion_anterior_id uuid REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
    cotizacion_nueva_id uuid REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
    motivo text NOT NULL,
    cambiado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    cambiado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inmobiliaria_cambio_unidad_distinta_chk
        CHECK (unidad_anterior_id <> unidad_nueva_id)
);

CREATE INDEX IF NOT EXISTS inmobiliaria_cambio_unidad_operacion_idx
    ON public.inmobiliaria_operacion_cambios_unidad (organizacion_id, operacion_id, cambiado_en DESC);

ALTER TABLE public.inmobiliaria_operacion_cambios_unidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_operacion_cambios_unidad FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.inmobiliaria_operacion_cambios_unidad FROM anon;
GRANT SELECT, INSERT ON public.inmobiliaria_operacion_cambios_unidad TO authenticated;

DROP POLICY IF EXISTS inmobiliaria_cambio_unidad_org ON public.inmobiliaria_operacion_cambios_unidad;
CREATE POLICY inmobiliaria_cambio_unidad_org
    ON public.inmobiliaria_operacion_cambios_unidad
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.crm_cambiar_unidad_operacion(
    p_organizacion_id uuid,
    p_oportunidad_id uuid,
    p_unidad_nueva_id uuid,
    p_usuario_id uuid DEFAULT NULL,
    p_motivo text DEFAULT NULL
)
RETURNS TABLE(
    operacion_id uuid,
    oportunidad_id uuid,
    unidad_anterior_id uuid,
    unidad_nueva_id uuid,
    cotizacion_anterior_id uuid,
    cotizacion_nueva_id uuid,
    estado_operacion text,
    estado_unidad text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_op public.oportunidades%ROWTYPE;
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_old_unit public.propiedad_unidades%ROWTYPE;
    v_new_unit public.propiedad_unidades%ROWTYPE;
    v_old_quote public.cotizaciones%ROWTYPE;
    v_new_quote public.cotizaciones%ROWTYPE;
    v_old_item public.cotizacion_items%ROWTYPE;
    v_price numeric(14,2);
    v_status public.propiedad_status;
    v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_usuario_id IS NULL THEN
        RAISE EXCEPTION 'property_unit_change_user_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_motivo IS NULL THEN
        RAISE EXCEPTION 'property_unit_change_reason_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_op
      FROM public.oportunidades
     WHERE id = p_oportunidad_id
       AND organizacion_id = p_organizacion_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_opportunity_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF lower(coalesce(v_op.estado, '')) <> 'abierta' THEN
        RAISE EXCEPTION 'property_opportunity_not_open' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_operation
      FROM public.operaciones_inmobiliarias
     WHERE organizacion_id = p_organizacion_id
       AND oportunidad_id = p_oportunidad_id
       AND estado IN ('borrador', 'apartada', 'reservada')
     ORDER BY actualizado_en DESC, id DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_operation_not_found' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_old_unit
      FROM public.propiedad_unidades
     WHERE id = v_operation.unidad_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_old_unit_not_found' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_new_unit
      FROM public.propiedad_unidades
     WHERE id = p_unidad_nueva_id
       AND status = 'disponible'::public.propiedad_status
       AND EXISTS (
           SELECT 1
             FROM public.propiedad_capas c
             JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = propiedad_unidades.nivel_id
              AND d.organizacion_id = p_organizacion_id
       )
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_new_unit_not_available' USING ERRCODE = 'P0001';
    END IF;

    IF v_old_unit.id = v_new_unit.id THEN
        RAISE EXCEPTION 'property_unit_change_without_changes' USING ERRCODE = 'P0001';
    END IF;

    SELECT q.* INTO v_old_quote
      FROM public.cotizaciones q
     WHERE q.organizacion_id = p_organizacion_id
       AND q.oportunidad_id = p_oportunidad_id
       AND q.dominio_comercial = 'propiedades'
       AND q.estatus NOT IN ('cancelada', 'reembolsada', 'sustituida')
     ORDER BY (q.estatus = 'aceptada') DESC, q.actualizado_en DESC, q.id DESC
     LIMIT 1
     FOR UPDATE;

    IF v_old_quote.id IS NOT NULL THEN
        SELECT ci.* INTO v_old_item
          FROM public.cotizacion_items ci
         WHERE ci.organizacion_id = p_organizacion_id
           AND ci.cotizacion_id = v_old_quote.id
         ORDER BY ci.orden, ci.id
         LIMIT 1;
        v_price := coalesce(v_old_quote.total, v_old_unit.precio, v_new_unit.precio);
    ELSE
        v_price := coalesce(v_operation.precio_acordado, v_operation.precio_ofrecido, v_new_unit.precio);
    END IF;
    IF v_price IS NULL OR v_price <= 0 THEN
        v_price := v_new_unit.precio;
    END IF;
    IF v_price IS NULL OR v_price <= 0 THEN
        RAISE EXCEPTION 'property_new_unit_price_required' USING ERRCODE = 'P0001';
    END IF;

    v_status := CASE
        WHEN v_operation.estado = 'borrador' THEN 'reservado'::public.propiedad_status
        ELSE 'apartado'::public.propiedad_status
    END;

    INSERT INTO public.cotizaciones (
        organizacion_id, oportunidad_id, estatus, total, moneda,
        dominio_comercial, propiedad_id, unidad_id, operacion_inmobiliaria_id,
        metadata
    ) VALUES (
        p_organizacion_id, p_oportunidad_id, 'borrador', v_new_unit.precio,
        coalesce(v_old_quote.moneda, v_operation.moneda, 'MXN'),
        'propiedades', v_new_unit.propiedad_id, v_new_unit.id, v_operation.id,
        jsonb_build_object('source', 'property_unit_change', 'motivo', v_motivo)
    ) RETURNING * INTO v_new_quote;

    INSERT INTO public.cotizacion_items (
        organizacion_id, cotizacion_id, producto_id, descripcion, cantidad,
        precio_unitario, subtotal, orden, propiedad_id, unidad_id, metadata
    ) VALUES (
        p_organizacion_id, v_new_quote.id, v_old_item.producto_id,
        coalesce(v_new_unit.nombre, v_new_unit.unidad, 'Unidad inmobiliaria'),
        1, v_new_unit.precio, v_new_unit.precio, 1,
        v_new_unit.propiedad_id, v_new_unit.id,
        jsonb_build_object('source', 'property_unit_change', 'unidad_id', v_new_unit.id)
    );

    IF v_old_quote.id IS NOT NULL THEN
        UPDATE public.cotizaciones
           SET estatus = 'sustituida',
               sustituida_por_cotizacion_id = v_new_quote.id,
               actualizado_en = now()
         WHERE id = v_old_quote.id;
    END IF;

    UPDATE public.inmobiliaria_operacion_documentos
       SET estado_revision = 'requiere_correccion',
           observaciones_revision = concat(
               'Documento invalidado por cambio de unidad el ',
               to_char(now(), 'YYYY-MM-DD HH24:MI:SS TZH:TZM'),
               '. Debe revisarse para la nueva unidad.'
           ),
           revisado_por_usuario_id = p_usuario_id,
           revisado_en = now()
     WHERE organizacion_id = p_organizacion_id
       AND operacion_id = v_operation.id
       AND estado_revision <> 'requiere_correccion';

    UPDATE public.inmobiliaria_contratos_operacion
       SET estado = 'cancelado', actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id
       AND operacion_id = v_operation.id
       AND estado <> 'cancelado';

    UPDATE public.propiedad_unidades
       SET status = 'disponible'::public.propiedad_status,
           oportunidad_id = NULL,
           actualizado_en = now()
     WHERE id = v_old_unit.id;

    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    ) VALUES (
        p_organizacion_id, v_old_unit.id, p_oportunidad_id, v_operation.cliente_principal_id,
        v_old_unit.status, 'disponible'::public.propiedad_status,
        v_old_unit.precio, v_operation.moneda, 'cambio_unidad_liberada', p_usuario_id
    );

    UPDATE public.propiedad_unidades
       SET status = v_status,
           oportunidad_id = p_oportunidad_id,
           actualizado_en = now()
     WHERE id = v_new_unit.id;

    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    ) VALUES (
        p_organizacion_id, v_new_unit.id, p_oportunidad_id, v_operation.cliente_principal_id,
        v_new_unit.status, v_status, v_new_unit.precio, v_operation.moneda,
        'cambio_unidad_apartada', p_usuario_id
    );

    UPDATE public.operaciones_inmobiliarias
       SET unidad_id = v_new_unit.id,
           precio_ofrecido = v_new_unit.precio,
           precio_acordado = NULL,
           precio_final = NULL,
           estado = CASE WHEN v_operation.estado = 'borrador' THEN 'borrador' ELSE 'apartada' END,
           estado_validacion = CASE WHEN v_operation.estado = 'borrador' THEN estado_validacion ELSE 'pendiente_captura' END,
           enviado_a_validacion_en = NULL,
           enviado_a_validacion_por = NULL,
           validado_en = NULL,
           validado_por_usuario_id = NULL,
           observaciones_validacion = NULL,
           actualizado_en = now()
     WHERE id = v_operation.id;

    INSERT INTO public.inmobiliaria_operacion_cambios_unidad (
        organizacion_id, operacion_id, oportunidad_id,
        unidad_anterior_id, unidad_nueva_id,
        cotizacion_anterior_id, cotizacion_nueva_id, motivo, cambiado_por_usuario_id
    ) VALUES (
        p_organizacion_id, v_operation.id, p_oportunidad_id,
        v_old_unit.id, v_new_unit.id,
        v_old_quote.id, v_new_quote.id, v_motivo, p_usuario_id
    );

    UPDATE public.oportunidades
       SET monto_estimado = v_new_unit.precio,
           actualizado_en = now()
     WHERE id = p_oportunidad_id;

    RETURN QUERY SELECT
        v_operation.id, p_oportunidad_id, v_old_unit.id, v_new_unit.id,
        v_old_quote.id, v_new_quote.id,
        CASE WHEN v_operation.estado = 'borrador' THEN 'borrador' ELSE 'apartada' END,
        v_status::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_cambiar_unidad_operacion(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_cambiar_unidad_operacion(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES ('inmobiliaria.apartados.change_unit', 'Cambiar la unidad de una oportunidad inmobiliaria', 577)
ON CONFLICT (codigo) DO UPDATE
SET descripcion = EXCLUDED.descripcion, activo = true, actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inmobiliaria.apartados.change_unit'),
    ('admin_operativo', 'inmobiliaria.apartados.change_unit'),
    ('coordinador', 'inmobiliaria.apartados.change_unit'),
    ('gerente_comercial', 'inmobiliaria.apartados.change_unit')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
CROSS JOIN public.tenant_default_permissions p
WHERE p.codigo = 'inmobiliaria.apartados.change_unit'
ON CONFLICT (organizacion_id, codigo) DO UPDATE
SET descripcion = EXCLUDED.descripcion;

WITH role_scope AS (
    SELECT 'inmobiliaria.apartados.change_unit'::text AS codigo,
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
