BEGIN;

ALTER TABLE public.pedidos_venta
    ADD COLUMN estado_formalizacion text NOT NULL DEFAULT 'sin_enviar',
    ADD COLUMN enviado_formalizacion_en timestamptz,
    ADD COLUMN enviado_formalizacion_por_usuario_id uuid,
    ADD COLUMN devuelto_comercial_en timestamptz,
    ADD COLUMN devuelto_comercial_por_usuario_id uuid,
    ADD COLUMN motivo_devolucion_comercial text,
    ADD CONSTRAINT pedidos_venta_estado_formalizacion_check
        CHECK (estado_formalizacion IN ('sin_enviar', 'pendiente', 'devuelto', 'confirmado')),
    ADD CONSTRAINT pedidos_venta_enviado_usuario_fkey
        FOREIGN KEY (organizacion_id, enviado_formalizacion_por_usuario_id)
        REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL (enviado_formalizacion_por_usuario_id),
    ADD CONSTRAINT pedidos_venta_devuelto_usuario_fkey
        FOREIGN KEY (organizacion_id, devuelto_comercial_por_usuario_id)
        REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL (devuelto_comercial_por_usuario_id);

CREATE INDEX pedidos_venta_org_formalizacion_fecha_idx
    ON public.pedidos_venta (organizacion_id, estado_formalizacion, enviado_formalizacion_en DESC);

CREATE TABLE public.pedido_venta_eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    pedido_venta_id uuid NOT NULL,
    evento text NOT NULL,
    actor_usuario_id uuid,
    detalle text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedido_venta_eventos_evento_check CHECK (evento IN (
        'enviado_formalizacion', 'devuelto_comercial', 'reenviado_formalizacion',
        'pedido_confirmado', 'pedido_cancelado'
    )),
    CONSTRAINT pedido_venta_eventos_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT pedido_venta_eventos_pedido_org_fkey FOREIGN KEY (organizacion_id, pedido_venta_id)
        REFERENCES public.pedidos_venta(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_eventos_actor_org_fkey FOREIGN KEY (organizacion_id, actor_usuario_id)
        REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL (actor_usuario_id)
);
CREATE INDEX pedido_venta_eventos_org_pedido_fecha_idx
    ON public.pedido_venta_eventos (organizacion_id, pedido_venta_id, creado_en DESC);

ALTER TABLE public.pedido_venta_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedido_venta_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.pedido_venta_eventos TO service_role;
CREATE POLICY pedido_venta_eventos_service_role_all ON public.pedido_venta_eventos
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.crm_auditar_evento_formalizacion_pedido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_evento text;
    v_actor uuid;
    v_detalle text;
BEGIN
    IF NEW.estatus = 'confirmado' AND OLD.estatus IS DISTINCT FROM NEW.estatus THEN
        IF OLD.estado_formalizacion <> 'pendiente' THEN
            RAISE EXCEPTION 'sales_order_not_submitted_for_review' USING ERRCODE = 'P0001';
        END IF;
        NEW.estado_formalizacion := 'confirmado';
        v_evento := 'pedido_confirmado';
        v_actor := NEW.confirmado_por_usuario_id;
    ELSIF NEW.estatus = 'cancelado' AND OLD.estatus IS DISTINCT FROM NEW.estatus THEN
        v_evento := 'pedido_cancelado';
        v_actor := NEW.cancelado_por_usuario_id;
        v_detalle := NEW.motivo_cancelacion;
    ELSIF NEW.estado_formalizacion IS DISTINCT FROM OLD.estado_formalizacion THEN
        IF NEW.estado_formalizacion = 'pendiente' THEN
            v_evento := CASE WHEN OLD.estado_formalizacion = 'devuelto'
                THEN 'reenviado_formalizacion' ELSE 'enviado_formalizacion' END;
            v_actor := NEW.enviado_formalizacion_por_usuario_id;
        ELSIF NEW.estado_formalizacion = 'devuelto' THEN
            v_evento := 'devuelto_comercial';
            v_actor := NEW.devuelto_comercial_por_usuario_id;
            v_detalle := NEW.motivo_devolucion_comercial;
        END IF;
    END IF;

    IF v_evento IS NOT NULL THEN
        INSERT INTO public.pedido_venta_eventos (
            organizacion_id, pedido_venta_id, evento, actor_usuario_id, detalle
        ) VALUES (
            NEW.organizacion_id, NEW.id, v_evento, v_actor, v_detalle
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER pedidos_venta_auditar_formalizacion_trg
    BEFORE UPDATE OF estatus, estado_formalizacion ON public.pedidos_venta
    FOR EACH ROW EXECUTE FUNCTION public.crm_auditar_evento_formalizacion_pedido();

CREATE OR REPLACE FUNCTION public.crm_enviar_pedido_a_formalizacion(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid,
    p_forma_confirmacion text,
    p_fecha_confirmacion_cliente date,
    p_referencia_pedido_cliente text DEFAULT NULL,
    p_fecha_orden_cliente date DEFAULT NULL,
    p_observaciones_confirmacion text DEFAULT NULL
)
RETURNS TABLE (pedido_venta_id uuid, estado_formalizacion text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_quote record;
BEGIN
    IF p_organizacion_id IS NULL OR p_cotizacion_id IS NULL OR p_usuario_id IS NULL THEN
        RAISE EXCEPTION 'organization_quote_and_user_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_forma_confirmacion NOT IN (
        'orden_compra', 'cotizacion_firmada_aceptada', 'correo_electronico',
        'whatsapp', 'contrato', 'confirmacion_verbal', 'anticipo_pago', 'otro'
    ) THEN
        RAISE EXCEPTION 'invalid_order_confirmation_method' USING ERRCODE = 'P0001';
    END IF;
    IF p_fecha_confirmacion_cliente IS NULL THEN
        RAISE EXCEPTION 'order_confirmation_date_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT q.estatus AS cotizacion_estatus, o.estado AS oportunidad_estado
      INTO v_quote
      FROM public.cotizaciones q
      JOIN public.oportunidades o
        ON o.organizacion_id = q.organizacion_id AND o.id = q.oportunidad_id
     WHERE q.organizacion_id = p_organizacion_id AND q.id = p_cotizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF lower(v_quote.cotizacion_estatus) <> 'aceptada' OR v_quote.oportunidad_estado <> 'ganada' THEN
        RAISE EXCEPTION 'accepted_won_quote_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT pv.* INTO v_pedido
      FROM public.pedidos_venta pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM public.crm_crear_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);
        SELECT pv.* INTO v_pedido
          FROM public.pedidos_venta pv
         WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
         FOR UPDATE;
    END IF;
    IF v_pedido.estatus NOT IN ('borrador', 'pendiente_confirmacion') THEN
        RAISE EXCEPTION 'sales_order_not_submittable' USING ERRCODE = 'P0001';
    END IF;
    IF v_pedido.estado_formalizacion = 'pendiente' THEN
        RETURN QUERY SELECT v_pedido.id, v_pedido.estado_formalizacion;
        RETURN;
    END IF;
    IF v_pedido.estado_formalizacion NOT IN ('sin_enviar', 'devuelto') THEN
        RAISE EXCEPTION 'sales_order_not_submittable' USING ERRCODE = 'P0001';
    END IF;
    IF p_forma_confirmacion = 'orden_compra'
       AND NULLIF(btrim(p_referencia_pedido_cliente), '') IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.pedido_venta_documentos d
           WHERE d.organizacion_id = p_organizacion_id
             AND d.pedido_venta_id = v_pedido.id
             AND d.tipo_documento = 'orden_compra'
       ) THEN
        RAISE EXCEPTION 'order_purchase_order_evidence_required' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.pedidos_venta
       SET estado_formalizacion = 'pendiente',
           enviado_formalizacion_en = now(),
           enviado_formalizacion_por_usuario_id = p_usuario_id,
           devuelto_comercial_en = NULL,
           devuelto_comercial_por_usuario_id = NULL,
           motivo_devolucion_comercial = NULL,
           forma_confirmacion = p_forma_confirmacion,
           fecha_confirmacion_cliente = p_fecha_confirmacion_cliente,
           referencia_pedido_cliente = NULLIF(btrim(p_referencia_pedido_cliente), ''),
           fecha_orden_cliente = p_fecha_orden_cliente,
           observaciones_confirmacion = NULLIF(btrim(p_observaciones_confirmacion), ''),
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido.id;
    RETURN QUERY SELECT v_pedido.id, 'pendiente'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_enviar_pedido_a_formalizacion(uuid, uuid, uuid, text, date, text, date, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_enviar_pedido_a_formalizacion(uuid, uuid, uuid, text, date, text, date, text)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_devolver_pedido_a_comercial(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_usuario_id uuid,
    p_motivo text
)
RETURNS TABLE (pedido_venta_id uuid, cotizacion_id uuid, estado_formalizacion text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL OR p_usuario_id IS NULL
       OR NULLIF(btrim(p_motivo), '') IS NULL THEN
        RAISE EXCEPTION 'organization_order_user_and_return_reason_required' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(p_motivo)) > 2000 THEN
        RAISE EXCEPTION 'order_return_reason_too_long' USING ERRCODE = 'P0001';
    END IF;
    SELECT pv.* INTO v_pedido
      FROM public.pedidos_venta pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.id = p_pedido_venta_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_pedido.estatus <> 'pendiente_confirmacion'
       OR v_pedido.estado_formalizacion <> 'pendiente' THEN
        RAISE EXCEPTION 'sales_order_not_returnable' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.pedidos_venta
       SET estado_formalizacion = 'devuelto',
           devuelto_comercial_en = now(),
           devuelto_comercial_por_usuario_id = p_usuario_id,
           motivo_devolucion_comercial = btrim(p_motivo),
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = p_pedido_venta_id;
    RETURN QUERY SELECT v_pedido.id, v_pedido.cotizacion_id, 'devuelto'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_devolver_pedido_a_comercial(uuid, uuid, uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_devolver_pedido_a_comercial(uuid, uuid, uuid, text)
    TO service_role;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES
    ('sales.orders.submit', 'Enviar pedidos aceptados a formalización', 540),
    ('sales.orders.confirm', 'Revisar y confirmar pedidos para formalizar ventas', 550),
    ('inventory.fulfillment.view', 'Consultar pedidos pendientes de surtido', 560),
    ('inventory.fulfillment.manage', 'Registrar entregas y surtidos de inventario', 570)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('agente', 'sales.orders.submit'),
    ('coordinador', 'sales.orders.submit'),
    ('gerente_comercial', 'sales.orders.submit'),
    ('admin_operativo', 'sales.orders.confirm'),
    ('admin_operativo', 'inventory.fulfillment.view'),
    ('admin_operativo', 'inventory.fulfillment.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
CROSS JOIN public.tenant_default_permissions p
WHERE p.codigo IN (
    'sales.orders.submit', 'sales.orders.confirm',
    'inventory.fulfillment.view', 'inventory.fulfillment.manage'
)
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT r.organizacion_id, r.id, p.id
FROM public.roles r
JOIN public.tenant_default_role_permissions rp
  ON rp.rol_codigo = CASE lower(trim(r.nombre))
      WHEN 'agente' THEN 'agente'
      WHEN 'coordinador' THEN 'coordinador'
      WHEN 'gerente_comercial' THEN 'gerente_comercial'
      WHEN 'admin_operativo' THEN 'admin_operativo'
      ELSE NULL
  END
JOIN public.permisos p
  ON p.organizacion_id = r.organizacion_id AND p.codigo = rp.permiso_codigo
WHERE rp.permiso_codigo IN (
    'sales.orders.submit', 'sales.orders.confirm',
    'inventory.fulfillment.view', 'inventory.fulfillment.manage'
)
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
