BEGIN;

ALTER TABLE public.pedidos_venta
    ADD COLUMN forma_confirmacion text,
    ADD COLUMN fecha_confirmacion_cliente date,
    ADD COLUMN observaciones_confirmacion text;

ALTER TABLE public.pedidos_venta
    ADD CONSTRAINT pedidos_venta_forma_confirmacion_check CHECK (
        forma_confirmacion IS NULL OR forma_confirmacion IN (
            'orden_compra', 'cotizacion_firmada_aceptada', 'correo_electronico',
            'whatsapp', 'contrato', 'confirmacion_verbal', 'anticipo_pago', 'otro'
        )
    );

CREATE UNIQUE INDEX archivos_organizacion_id_id_uidx
    ON public.archivos (organizacion_id, id);

CREATE TABLE public.pedido_venta_documentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    pedido_venta_id uuid NOT NULL,
    archivo_id uuid NOT NULL,
    tipo_documento text NOT NULL,
    subido_por_usuario_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedido_venta_documentos_org_id_key UNIQUE (organizacion_id, id),
    CONSTRAINT pedido_venta_documentos_type_check CHECK (
        tipo_documento IN ('orden_compra')
    ),
    CONSTRAINT pedido_venta_documentos_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT pedido_venta_documentos_order_org_fkey FOREIGN KEY (organizacion_id, pedido_venta_id)
        REFERENCES public.pedidos_venta (organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT pedido_venta_documentos_archivo_org_fkey FOREIGN KEY (organizacion_id, archivo_id)
        REFERENCES public.archivos (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_documentos_usuario_fkey FOREIGN KEY (subido_por_usuario_id)
        REFERENCES public.usuarios (id) ON DELETE SET NULL,
    CONSTRAINT pedido_venta_documentos_order_type_uidx UNIQUE (organizacion_id, pedido_venta_id, tipo_documento),
    CONSTRAINT pedido_venta_documentos_archivo_uidx UNIQUE (organizacion_id, archivo_id)
);

CREATE INDEX pedido_venta_documentos_org_order_idx
    ON public.pedido_venta_documentos (organizacion_id, pedido_venta_id, creado_en DESC);

ALTER TABLE public.pedido_venta_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedido_venta_documentos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_venta_documentos TO service_role;
CREATE POLICY pedido_venta_documentos_service_role_all
    ON public.pedido_venta_documentos FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE FUNCTION public.crm_confirmar_pedido_venta_con_evidencia(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid DEFAULT NULL,
    p_fecha_vencimiento date DEFAULT NULL,
    p_referencia_pedido_cliente text DEFAULT NULL,
    p_fecha_orden_cliente date DEFAULT NULL,
    p_forma_confirmacion text DEFAULT 'otro',
    p_fecha_confirmacion_cliente date DEFAULT CURRENT_DATE,
    p_observaciones_confirmacion text DEFAULT NULL
)
RETURNS TABLE (
    venta_id uuid,
    cliente_id uuid,
    cuenta_por_cobrar_id uuid,
    venta_estatus text,
    total numeric,
    pago_acumulado numeric,
    saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido_id uuid;
    v_estatus text;
    v_forma text := lower(btrim(COALESCE(p_forma_confirmacion, '')));
BEGIN
    PERFORM public.crm_crear_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);
    SELECT pv.id, pv.estatus INTO v_pedido_id, v_estatus
      FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_estatus = 'confirmado' THEN
        RETURN QUERY SELECT * FROM public.crm_confirmar_pedido_venta(
            p_organizacion_id, p_cotizacion_id, p_usuario_id, p_fecha_vencimiento,
            p_referencia_pedido_cliente, p_fecha_orden_cliente
        );
        RETURN;
    END IF;
    IF v_estatus = 'cancelado' THEN
        RAISE EXCEPTION 'sales_order_cancelled' USING ERRCODE = 'P0001';
    END IF;
    IF v_forma NOT IN (
        'orden_compra', 'cotizacion_firmada_aceptada', 'correo_electronico',
        'whatsapp', 'contrato', 'confirmacion_verbal', 'otro'
    ) THEN
        RAISE EXCEPTION 'invalid_order_confirmation_method' USING ERRCODE = 'P0001';
    END IF;
    IF v_forma = 'orden_compra'
       AND NULLIF(btrim(p_referencia_pedido_cliente), '') IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.pedido_venta_documentos AS pvd
            WHERE pvd.organizacion_id = p_organizacion_id
              AND pvd.pedido_venta_id = v_pedido_id
              AND pvd.tipo_documento = 'orden_compra'
       ) THEN
        RAISE EXCEPTION 'order_purchase_order_evidence_required' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.pedidos_venta
       SET forma_confirmacion = v_forma,
           fecha_confirmacion_cliente = COALESCE(p_fecha_confirmacion_cliente, CURRENT_DATE),
           observaciones_confirmacion = NULLIF(btrim(p_observaciones_confirmacion), ''),
           referencia_pedido_cliente = COALESCE(NULLIF(btrim(p_referencia_pedido_cliente), ''), referencia_pedido_cliente),
           fecha_orden_cliente = COALESCE(p_fecha_orden_cliente, fecha_orden_cliente),
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido_id;

    RETURN QUERY
    SELECT * FROM public.crm_confirmar_pedido_venta(
        p_organizacion_id, p_cotizacion_id, p_usuario_id, p_fecha_vencimiento,
        p_referencia_pedido_cliente, p_fecha_orden_cliente
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirmar_pedido_venta_con_evidencia(uuid, uuid, uuid, date, text, date, text, date, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_confirmar_pedido_venta_con_evidencia(uuid, uuid, uuid, date, text, date, text, date, text)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_confirmar_pedido_venta_con_pago_y_evidencia(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_monto numeric,
    p_tipo_pago text DEFAULT 'anticipo',
    p_fecha_pago timestamptz DEFAULT now(),
    p_metodo_pago text DEFAULT NULL,
    p_referencia_pago text DEFAULT NULL,
    p_registrado_por_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (
    venta_id uuid,
    cliente_id uuid,
    cuenta_por_cobrar_id uuid,
    pago_id uuid,
    venta_estatus text,
    pago_acumulado numeric,
    total numeric,
    saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido_id uuid;
    v_estatus text;
BEGIN
    PERFORM public.crm_crear_pedido_venta(
        p_organizacion_id, p_cotizacion_id, p_registrado_por_usuario_id
    );
    SELECT pv.id, pv.estatus INTO v_pedido_id, v_estatus
      FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF v_estatus <> 'confirmado' THEN
        UPDATE public.pedidos_venta
           SET forma_confirmacion = 'anticipo_pago',
               fecha_confirmacion_cliente = COALESCE(p_fecha_pago::date, CURRENT_DATE),
               observaciones_confirmacion = 'Compra confirmada al registrar el pago',
               actualizado_en = now()
         WHERE organizacion_id = p_organizacion_id AND id = v_pedido_id;
    END IF;
    RETURN QUERY
    SELECT * FROM public.crm_confirmar_pedido_venta_con_pago(
        p_organizacion_id, p_cotizacion_id, p_monto, p_tipo_pago, p_fecha_pago,
        p_metodo_pago, p_referencia_pago, p_registrado_por_usuario_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirmar_pedido_venta_con_pago_y_evidencia(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_confirmar_pedido_venta_con_pago_y_evidencia(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
