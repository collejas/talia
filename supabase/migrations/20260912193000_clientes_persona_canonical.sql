BEGIN;

-- Canonical CRM identity is personas.id. contacto_id remains nullable only for
-- historical integrations that still carry the legacy column.
ALTER TABLE public.personas
    ADD CONSTRAINT personas_organizacion_id_key UNIQUE (organizacion_id, id);

ALTER TABLE public.clientes
    DROP CONSTRAINT IF EXISTS clientes_contacto_org_fkey,
    DROP CONSTRAINT IF EXISTS clientes_contacto_unique;

ALTER TABLE public.clientes
    ALTER COLUMN contacto_id DROP NOT NULL;

ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_persona_org_fkey
        FOREIGN KEY (organizacion_id, persona_id)
        REFERENCES public.personas (organizacion_id, id)
        ON DELETE RESTRICT;

CREATE UNIQUE INDEX clientes_org_cuenta_persona_uidx
    ON public.clientes (organizacion_id, cuenta_id, persona_id)
    WHERE persona_id IS NOT NULL;

CREATE INDEX clientes_org_persona_idx
    ON public.clientes (organizacion_id, persona_id)
    WHERE persona_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_registrar_pago_confirmado(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_monto numeric,
    p_tipo_pago text DEFAULT 'parcial',
    p_fecha_pago timestamptz DEFAULT now(),
    p_metodo_pago text DEFAULT NULL,
    p_referencia_pago text DEFAULT NULL,
    p_registrado_por_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (venta_id uuid, cliente_id uuid, pago_id uuid, venta_estatus text, pago_acumulado numeric, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_quote record;
    v_client_id uuid;
    v_sale_id uuid;
    v_payment_id uuid;
    v_total numeric(14,2);
    v_accumulated numeric(14,2);
    v_sale_status text;
    v_persona_id uuid;
    v_cuenta_id uuid;
BEGIN
    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'payment_amount_must_be_positive' USING ERRCODE = '22023';
    END IF;
    IF p_tipo_pago NOT IN ('anticipo','parcial','liquidacion','otro') THEN
        RAISE EXCEPTION 'invalid_payment_type' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(btrim(p_referencia_pago), '') IS NOT NULL THEN
        SELECT p.id, p.venta_id, p.cliente_id, v.estatus, p.monto, v.total
          INTO v_payment_id, v_sale_id, v_client_id, v_sale_status, v_accumulated, v_total
          FROM public.pagos p
          JOIN public.ventas v ON v.organizacion_id=p.organizacion_id AND v.id=p.venta_id
         WHERE p.organizacion_id=p_organizacion_id AND p.referencia_pago=btrim(p_referencia_pago)
         FOR UPDATE OF p, v;
        IF v_payment_id IS NOT NULL THEN
            RETURN QUERY SELECT v_sale_id,v_client_id,v_payment_id,v_sale_status,v_accumulated,v_total;
            RETURN;
        END IF;
    END IF;

    SELECT q.id,q.oportunidad_id,q.cuenta_id,q.total,q.moneda,
           COALESCE(q.persona_id,q.contacto_id,o.persona_id,o.contacto_principal_id) AS persona_id,
           o.cuenta_id AS oportunidad_cuenta_id
      INTO v_quote
      FROM public.cotizaciones q
      JOIN public.oportunidades o ON o.organizacion_id=q.organizacion_id AND o.id=q.oportunidad_id
     WHERE q.organizacion_id=p_organizacion_id AND q.id=p_cotizacion_id
       AND lower(q.estatus)='aceptada' AND o.estado='ganada'
     FOR UPDATE OF q,o;
    IF NOT FOUND THEN RAISE EXCEPTION 'accepted_won_quote_not_found' USING ERRCODE='P0001'; END IF;

    v_persona_id := v_quote.persona_id;
    v_cuenta_id := COALESCE(v_quote.cuenta_id,v_quote.oportunidad_cuenta_id);
    IF v_persona_id IS NULL THEN RAISE EXCEPTION 'sale_persona_missing' USING ERRCODE='P0001'; END IF;
    IF v_cuenta_id IS NULL THEN RAISE EXCEPTION 'sale_account_missing' USING ERRCODE='P0001'; END IF;
    v_total := round(COALESCE(v_quote.total,0)::numeric,2);
    IF v_total <= 0 THEN RAISE EXCEPTION 'sale_total_must_be_positive' USING ERRCODE='22023'; END IF;

    SELECT c.id INTO v_client_id FROM public.clientes c
     WHERE c.organizacion_id=p_organizacion_id AND c.persona_id=v_persona_id AND c.cuenta_id=v_cuenta_id
     FOR UPDATE;
    IF v_client_id IS NULL THEN
        INSERT INTO public.clientes (
            organizacion_id,persona_id,contacto_id,cuenta_id,oportunidad_id,legacy_lead_id,
            estado_onboarding,fuente,monto_estimado,moneda,ganado_en
        ) VALUES (
            p_organizacion_id,v_persona_id,NULL,v_cuenta_id,v_quote.oportunidad_id,v_quote.oportunidad_id,
            'pendiente','crm_pago_confirmado',v_total,v_quote.moneda,COALESCE(p_fecha_pago,now())
        ) ON CONFLICT (organizacion_id,cuenta_id,persona_id) WHERE persona_id IS NOT NULL DO UPDATE
            SET actualizado_en=now()
        RETURNING id INTO v_client_id;
    END IF;

    UPDATE public.oportunidades SET cliente_id=v_client_id,persona_id=v_persona_id,cuenta_id=v_cuenta_id,actualizado_en=now()
     WHERE organizacion_id=p_organizacion_id AND id=v_quote.oportunidad_id;

    INSERT INTO public.ventas (organizacion_id,cliente_id,cuenta_id,oportunidad_id,cotizacion_id,estatus,subtotal,impuestos,total,moneda,fecha_venta,creado_por_usuario_id)
    VALUES (p_organizacion_id,v_client_id,v_cuenta_id,v_quote.oportunidad_id,v_quote.id,'pendiente_pago',v_total,0,v_total,v_quote.moneda,COALESCE(p_fecha_pago,now()),p_registrado_por_usuario_id)
    ON CONFLICT (organizacion_id,oportunidad_id) DO NOTHING;
    SELECT v.id INTO v_sale_id FROM public.ventas v WHERE v.organizacion_id=p_organizacion_id AND v.oportunidad_id=v_quote.oportunidad_id FOR UPDATE;

    INSERT INTO public.venta_items (organizacion_id,venta_id,descripcion,cantidad,precio_unitario,descuento_monto,impuestos,subtotal,moneda,orden)
    SELECT p_organizacion_id,v_sale_id,qi.descripcion,qi.cantidad,COALESCE(qi.precio_unitario,0),
           COALESCE((COALESCE(qi.precio_unitario,0)*qi.cantidad)*COALESCE(qi.descuento_porcentaje,0)/100,0),0,
           COALESCE(qi.subtotal,(COALESCE(qi.precio_unitario,0)*qi.cantidad)*(1-COALESCE(qi.descuento_porcentaje,0)/100),0),
           COALESCE(qi.moneda_aplicada,v_quote.moneda),qi.orden
      FROM public.cotizacion_items qi
     WHERE qi.organizacion_id=p_organizacion_id AND qi.cotizacion_id=v_quote.id
       AND NOT EXISTS (SELECT 1 FROM public.venta_items vi WHERE vi.organizacion_id=p_organizacion_id AND vi.venta_id=v_sale_id);

    INSERT INTO public.pagos (organizacion_id,venta_id,cliente_id,cuenta_id,oportunidad_id,monto,moneda,tipo_pago,estatus,fecha_pago,fecha_confirmacion,metodo_pago,referencia_pago,registrado_por_usuario_id)
    VALUES (p_organizacion_id,v_sale_id,v_client_id,v_cuenta_id,v_quote.oportunidad_id,round(p_monto,2),v_quote.moneda,p_tipo_pago,'confirmado',COALESCE(p_fecha_pago,now()),COALESCE(p_fecha_pago,now()),NULLIF(btrim(p_metodo_pago),''),NULLIF(btrim(p_referencia_pago),''),p_registrado_por_usuario_id)
    RETURNING id INTO v_payment_id;

    SELECT round(COALESCE(SUM(p.monto) FILTER (WHERE p.estatus='confirmado'),0),2) INTO v_accumulated
      FROM public.pagos p WHERE p.organizacion_id=p_organizacion_id AND p.venta_id=v_sale_id;
    v_sale_status := CASE WHEN v_accumulated>=v_total THEN 'pagada' ELSE 'pago_parcial' END;
    UPDATE public.ventas SET estatus=v_sale_status,fecha_pago_completo=CASE WHEN v_sale_status='pagada' THEN COALESCE(p_fecha_pago,now()) ELSE fecha_pago_completo END,actualizado_en=now()
     WHERE organizacion_id=p_organizacion_id AND id=v_sale_id;
    RETURN QUERY SELECT v_sale_id,v_client_id,v_payment_id,v_sale_status,v_accumulated,v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_registrar_pago_confirmado(uuid,uuid,numeric,text,timestamptz,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_registrar_pago_confirmado(uuid,uuid,numeric,text,timestamptz,text,text,uuid) TO service_role;

COMMIT;
