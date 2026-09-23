BEGIN;

CREATE UNIQUE INDEX ventas_org_id_cliente_uidx
    ON public.ventas (organizacion_id, id, cliente_id);

CREATE TABLE public.cuentas_por_cobrar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    venta_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    importe_original numeric(14, 2) NOT NULL,
    importe_pagado numeric(14, 2) NOT NULL DEFAULT 0,
    saldo numeric(14, 2) GENERATED ALWAYS AS (
        GREATEST(importe_original - importe_pagado, 0)::numeric(14, 2)
    ) STORED,
    moneda char(3) NOT NULL,
    fecha_emision timestamptz NOT NULL DEFAULT now(),
    fecha_vencimiento date,
    estatus text NOT NULL DEFAULT 'pendiente',
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cuentas_por_cobrar_org_id_key UNIQUE (organizacion_id, id),
    CONSTRAINT cuentas_por_cobrar_venta_uidx UNIQUE (organizacion_id, venta_id),
    CONSTRAINT cuentas_por_cobrar_venta_cliente_id_key UNIQUE (organizacion_id, venta_id, id),
    CONSTRAINT cuentas_por_cobrar_importe_original_check CHECK (importe_original >= 0),
    CONSTRAINT cuentas_por_cobrar_importe_pagado_check CHECK (importe_pagado >= 0),
    CONSTRAINT cuentas_por_cobrar_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT cuentas_por_cobrar_estatus_check CHECK (estatus IN (
        'pendiente', 'parcial', 'pagada', 'vencida', 'cancelada', 'reembolsada'
    )),
    CONSTRAINT cuentas_por_cobrar_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT cuentas_por_cobrar_venta_cliente_org_fkey FOREIGN KEY (organizacion_id, venta_id, cliente_id)
        REFERENCES public.ventas (organizacion_id, id, cliente_id) ON DELETE RESTRICT,
    CONSTRAINT cuentas_por_cobrar_cliente_org_fkey FOREIGN KEY (organizacion_id, cliente_id)
        REFERENCES public.clientes (organizacion_id, id) ON DELETE RESTRICT
);

CREATE INDEX cuentas_por_cobrar_org_cliente_estado_idx
    ON public.cuentas_por_cobrar (organizacion_id, cliente_id, estatus, fecha_emision DESC);
CREATE INDEX cuentas_por_cobrar_org_vencimiento_idx
    ON public.cuentas_por_cobrar (organizacion_id, fecha_vencimiento)
    WHERE saldo > 0 AND estatus NOT IN ('cancelada', 'reembolsada');

-- Bring existing sales into the new one-to-one receivable model.
INSERT INTO public.cuentas_por_cobrar (
    organizacion_id, venta_id, cliente_id, importe_original, importe_pagado,
    moneda, fecha_emision, estatus
)
SELECT v.organizacion_id,
       v.id,
       v.cliente_id,
       v.total,
       COALESCE(p.importe_pagado, 0),
       v.moneda,
       v.fecha_venta,
       CASE
           WHEN v.estatus = 'cancelada' THEN 'cancelada'
           WHEN v.estatus = 'reembolsada' THEN 'reembolsada'
           WHEN v.total <= 0 THEN 'pagada'
           WHEN COALESCE(p.importe_pagado, 0) >= v.total THEN 'pagada'
           WHEN COALESCE(p.importe_pagado, 0) > 0 THEN 'parcial'
           ELSE 'pendiente'
       END
  FROM public.ventas AS v
  LEFT JOIN (
      SELECT organizacion_id, venta_id,
             SUM(monto) FILTER (WHERE estatus = 'confirmado') AS importe_pagado
        FROM public.pagos
       GROUP BY organizacion_id, venta_id
  ) AS p ON p.organizacion_id = v.organizacion_id AND p.venta_id = v.id;

ALTER TABLE public.pagos
    ADD COLUMN cuenta_por_cobrar_id uuid;

UPDATE public.pagos AS p
   SET cuenta_por_cobrar_id = c.id
  FROM public.cuentas_por_cobrar AS c
 WHERE c.organizacion_id = p.organizacion_id
   AND c.venta_id = p.venta_id;

ALTER TABLE public.pagos
    ALTER COLUMN cuenta_por_cobrar_id SET NOT NULL,
    ADD CONSTRAINT pagos_cuenta_por_cobrar_org_fkey
        FOREIGN KEY (organizacion_id, venta_id, cuenta_por_cobrar_id)
        REFERENCES public.cuentas_por_cobrar (organizacion_id, venta_id, id)
        ON DELETE RESTRICT;

CREATE INDEX pagos_org_cuenta_por_cobrar_fecha_idx
    ON public.pagos (organizacion_id, cuenta_por_cobrar_id, fecha_pago DESC);

ALTER TABLE public.cuentas_por_cobrar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cuentas_por_cobrar_service_role_all ON public.cuentas_por_cobrar;
CREATE POLICY cuentas_por_cobrar_service_role_all ON public.cuentas_por_cobrar
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cuentas_por_cobrar IS
    'Obligación de cobro única por venta; el saldo se deriva del importe original y pagos confirmados.';
COMMENT ON COLUMN public.cuentas_por_cobrar.saldo IS
    'Saldo calculado; no representa dinero cobrado y nunca es menor que cero.';
COMMENT ON COLUMN public.pagos.cuenta_por_cobrar_id IS
    'Cuenta por cobrar asociada al pago; queda ligada a la venta y al tenant.';

CREATE OR REPLACE FUNCTION public.crm_formalizar_venta(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid DEFAULT NULL,
    p_fecha_vencimiento date DEFAULT NULL
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
    v_quote record;
    v_client_id uuid;
    v_sale_id uuid;
    v_receivable_id uuid;
    v_paid numeric(14, 2);
    v_existing_quote_id uuid;
BEGIN
    IF p_organizacion_id IS NULL OR p_cotizacion_id IS NULL THEN
        RAISE EXCEPTION 'sale_source_required' USING ERRCODE = '22023';
    END IF;

    SELECT q.id, q.oportunidad_id, q.cuenta_id, q.total, q.moneda,
           COALESCE(q.persona_id, q.contacto_id, o.persona_id, o.contacto_principal_id) AS persona_id,
           o.cuenta_id AS oportunidad_cuenta_id,
           o.cliente_id AS oportunidad_cliente_id,
           o.estado AS oportunidad_estado,
           o.asignado_a_usuario_id AS vendedor_usuario_id
      INTO v_quote
      FROM public.cotizaciones AS q
      JOIN public.oportunidades AS o
        ON o.organizacion_id = q.organizacion_id AND o.id = q.oportunidad_id
     WHERE q.organizacion_id = p_organizacion_id AND q.id = p_cotizacion_id
     FOR UPDATE OF q, o;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001';
    END IF;

    SELECT v.id, v.cliente_id, v.cotizacion_id
      INTO v_sale_id, v_client_id, v_existing_quote_id
      FROM public.ventas AS v
     WHERE v.organizacion_id = p_organizacion_id
       AND v.oportunidad_id = v_quote.oportunidad_id
     FOR UPDATE;

    IF v_sale_id IS NOT NULL THEN
        IF v_existing_quote_id <> p_cotizacion_id THEN
            RAISE EXCEPTION 'opportunity_already_formalized_from_another_quote' USING ERRCODE = 'P0001';
        END IF;
        SELECT c.id INTO v_receivable_id
          FROM public.cuentas_por_cobrar AS c
         WHERE c.organizacion_id = p_organizacion_id AND c.venta_id = v_sale_id
         FOR UPDATE;
        IF v_receivable_id IS NULL THEN
            RAISE EXCEPTION 'receivable_missing_for_formalized_sale' USING ERRCODE = 'P0001';
        END IF;
        SELECT COALESCE(SUM(p.monto) FILTER (WHERE p.estatus = 'confirmado'), 0)::numeric(14,2)
          INTO v_paid
          FROM public.pagos AS p
         WHERE p.organizacion_id = p_organizacion_id AND p.venta_id = v_sale_id;
        RETURN QUERY
        SELECT v.id, v.cliente_id, c.id, v.estatus, v.total, v_paid, c.saldo
          FROM public.ventas AS v
          JOIN public.cuentas_por_cobrar AS c
            ON c.organizacion_id = v.organizacion_id AND c.venta_id = v.id
         WHERE v.organizacion_id = p_organizacion_id AND v.id = v_sale_id;
        RETURN;
    END IF;

    IF lower(v_quote.estatus) <> 'aceptada' OR v_quote.oportunidad_estado <> 'ganada' THEN
        RAISE EXCEPTION 'accepted_won_quote_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_quote.persona_id IS NULL THEN
        RAISE EXCEPTION 'sale_persona_missing' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(v_quote.cuenta_id, v_quote.oportunidad_cuenta_id) IS NULL THEN
        RAISE EXCEPTION 'sale_account_missing' USING ERRCODE = 'P0001';
    END IF;
    IF v_quote.total IS NULL OR round(v_quote.total::numeric, 2) <= 0 THEN
        RAISE EXCEPTION 'sale_total_must_be_positive' USING ERRCODE = '22023';
    END IF;

    IF v_quote.oportunidad_cliente_id IS NOT NULL THEN
        SELECT c.id INTO v_client_id
          FROM public.clientes AS c
         WHERE c.organizacion_id = p_organizacion_id
           AND c.id = v_quote.oportunidad_cliente_id
           AND c.cuenta_id = COALESCE(v_quote.cuenta_id, v_quote.oportunidad_cuenta_id)
           AND c.persona_id = v_quote.persona_id
         FOR UPDATE;
    END IF;
    IF v_client_id IS NULL THEN
        SELECT c.id INTO v_client_id
          FROM public.clientes AS c
         WHERE c.organizacion_id = p_organizacion_id
           AND c.cuenta_id = COALESCE(v_quote.cuenta_id, v_quote.oportunidad_cuenta_id)
           AND c.persona_id = v_quote.persona_id
         FOR UPDATE;
    END IF;
    IF v_client_id IS NULL THEN
        INSERT INTO public.clientes (
            organizacion_id, persona_id, contacto_id, cuenta_id, oportunidad_id,
            legacy_lead_id, estado_onboarding, fuente, monto_estimado, moneda, ganado_en
        ) VALUES (
            p_organizacion_id, v_quote.persona_id, NULL,
            COALESCE(v_quote.cuenta_id, v_quote.oportunidad_cuenta_id),
            v_quote.oportunidad_id, v_quote.oportunidad_id,
            'pendiente', 'crm_venta_formalizada', round(v_quote.total::numeric, 2),
            COALESCE(NULLIF(btrim(v_quote.moneda), ''), 'MXN'), now()
        )
        ON CONFLICT (organizacion_id, cuenta_id, persona_id) WHERE persona_id IS NOT NULL
        DO UPDATE SET actualizado_en = now()
        RETURNING id INTO v_client_id;
    END IF;

    UPDATE public.oportunidades
       SET cliente_id = v_client_id,
           persona_id = v_quote.persona_id,
           cuenta_id = COALESCE(v_quote.cuenta_id, v_quote.oportunidad_cuenta_id),
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_quote.oportunidad_id;

    INSERT INTO public.ventas (
        organizacion_id, cliente_id, cuenta_id, oportunidad_id, cotizacion_id,
        estatus, subtotal, impuestos, total, moneda, fecha_venta, creado_por_usuario_id
    ) VALUES (
        p_organizacion_id, v_client_id,
        COALESCE(v_quote.cuenta_id, v_quote.oportunidad_cuenta_id),
        v_quote.oportunidad_id, v_quote.id,
        'pendiente_pago', round(v_quote.total::numeric, 2), 0,
        round(v_quote.total::numeric, 2),
        COALESCE(NULLIF(btrim(v_quote.moneda), ''), 'MXN'), now(), p_usuario_id
    )
    RETURNING id INTO v_sale_id;

    INSERT INTO public.venta_items (
        organizacion_id, venta_id, descripcion, cantidad, precio_unitario,
        descuento_monto, impuestos, subtotal, moneda, orden
    )
    SELECT p_organizacion_id, v_sale_id, qi.descripcion, qi.cantidad,
           COALESCE(qi.precio_unitario, 0),
           COALESCE(COALESCE(qi.precio_unitario, 0) * qi.cantidad
                    * COALESCE(qi.descuento_porcentaje, 0) / 100, 0),
           0,
           COALESCE(qi.subtotal,
                    COALESCE(qi.precio_unitario, 0) * qi.cantidad
                    * (1 - COALESCE(qi.descuento_porcentaje, 0) / 100), 0),
           COALESCE(qi.moneda_aplicada, v_quote.moneda), qi.orden
      FROM public.cotizacion_items AS qi
     WHERE qi.organizacion_id = p_organizacion_id AND qi.cotizacion_id = v_quote.id;

    INSERT INTO public.cuentas_por_cobrar (
        organizacion_id, venta_id, cliente_id, importe_original, importe_pagado,
        moneda, fecha_emision, fecha_vencimiento, estatus
    ) VALUES (
        p_organizacion_id, v_sale_id, v_client_id,
        round(v_quote.total::numeric, 2), 0,
        COALESCE(NULLIF(btrim(v_quote.moneda), ''), 'MXN'), now(),
        p_fecha_vencimiento, 'pendiente'
    )
    RETURNING id INTO v_receivable_id;

    RETURN QUERY SELECT v_sale_id, v_client_id, v_receivable_id,
                        'pendiente_pago'::text, round(v_quote.total::numeric, 2),
                        0::numeric, round(v_quote.total::numeric, 2);
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_formalizar_venta(uuid, uuid, uuid, date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_formalizar_venta(uuid, uuid, uuid, date)
    TO service_role;

DROP FUNCTION public.crm_registrar_pago_confirmado(uuid, uuid, numeric, text, timestamptz, text, text, uuid);
CREATE FUNCTION public.crm_registrar_pago_confirmado(
    p_organizacion_id uuid,
    p_venta_id uuid,
    p_monto numeric,
    p_tipo_pago text DEFAULT 'parcial',
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
    v_sale record;
    v_payment_id uuid;
    v_accumulated numeric(14, 2);
    v_status text;
    v_existing_sale_id uuid;
BEGIN
    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'payment_amount_must_be_positive' USING ERRCODE = '22023';
    END IF;
    IF p_tipo_pago NOT IN ('anticipo', 'parcial', 'liquidacion', 'otro') THEN
        RAISE EXCEPTION 'invalid_payment_type' USING ERRCODE = '22023';
    END IF;

    SELECT v.id, v.cliente_id, v.cuenta_id, v.oportunidad_id, v.total,
           v.moneda, v.estatus, c.id AS cuenta_por_cobrar_id, c.saldo
      INTO v_sale
      FROM public.ventas AS v
      JOIN public.cuentas_por_cobrar AS c
        ON c.organizacion_id = v.organizacion_id AND c.venta_id = v.id
     WHERE v.organizacion_id = p_organizacion_id AND v.id = p_venta_id
     FOR UPDATE OF v, c;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'formalized_sale_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_sale.estatus IN ('cancelada', 'reembolsada') THEN
        RAISE EXCEPTION 'sale_not_payable' USING ERRCODE = 'P0001';
    END IF;

    IF NULLIF(btrim(p_referencia_pago), '') IS NOT NULL THEN
        SELECT p.id, p.venta_id INTO v_payment_id, v_existing_sale_id
          FROM public.pagos AS p
         WHERE p.organizacion_id = p_organizacion_id
           AND p.referencia_pago = btrim(p_referencia_pago)
         FOR UPDATE;
        IF v_payment_id IS NOT NULL THEN
            IF v_existing_sale_id <> p_venta_id THEN
                RAISE EXCEPTION 'duplicate_payment_reference' USING ERRCODE = 'P0001';
            END IF;
            SELECT COALESCE(SUM(p.monto) FILTER (WHERE p.estatus = 'confirmado'), 0)::numeric(14,2)
              INTO v_accumulated
              FROM public.pagos AS p
             WHERE p.organizacion_id = p_organizacion_id AND p.venta_id = p_venta_id;
            RETURN QUERY SELECT v_sale.id, v_sale.cliente_id, v_sale.cuenta_por_cobrar_id,
                                v_payment_id, v_sale.estatus, v_accumulated,
                                v_sale.total, v_sale.saldo;
            RETURN;
        END IF;
    END IF;

    IF p_monto > v_sale.saldo THEN
        RAISE EXCEPTION 'payment_exceeds_receivable_balance' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.pagos (
        organizacion_id, venta_id, cuenta_por_cobrar_id, cliente_id, cuenta_id,
        oportunidad_id, monto, moneda, tipo_pago, estatus, fecha_pago,
        fecha_confirmacion, metodo_pago, referencia_pago, registrado_por_usuario_id
    ) VALUES (
        p_organizacion_id, p_venta_id, v_sale.cuenta_por_cobrar_id,
        v_sale.cliente_id, v_sale.cuenta_id, v_sale.oportunidad_id,
        round(p_monto, 2), v_sale.moneda, p_tipo_pago, 'confirmado',
        COALESCE(p_fecha_pago, now()), COALESCE(p_fecha_pago, now()),
        NULLIF(btrim(p_metodo_pago), ''), NULLIF(btrim(p_referencia_pago), ''),
        p_registrado_por_usuario_id
    ) RETURNING id INTO v_payment_id;

    SELECT COALESCE(SUM(p.monto) FILTER (WHERE p.estatus = 'confirmado'), 0)::numeric(14,2)
      INTO v_accumulated
      FROM public.pagos AS p
     WHERE p.organizacion_id = p_organizacion_id AND p.venta_id = p_venta_id;
    v_status := CASE WHEN v_accumulated >= v_sale.total THEN 'pagada' ELSE 'pago_parcial' END;

    UPDATE public.cuentas_por_cobrar AS c
       SET importe_pagado = v_accumulated,
           estatus = CASE
               WHEN v_accumulated >= v_sale.total THEN 'pagada'
               WHEN v_accumulated > 0 AND c.fecha_vencimiento < current_date THEN 'vencida'
               WHEN v_accumulated > 0 THEN 'parcial'
               WHEN c.fecha_vencimiento < current_date THEN 'vencida'
               ELSE 'pendiente'
           END,
           actualizado_en = now()
     WHERE c.organizacion_id = p_organizacion_id AND c.id = v_sale.cuenta_por_cobrar_id;

    UPDATE public.ventas AS v
       SET estatus = v_status,
           fecha_pago_completo = CASE
               WHEN v_status = 'pagada' THEN COALESCE(p_fecha_pago, now())
               ELSE v.fecha_pago_completo
           END,
           actualizado_en = now()
     WHERE v.organizacion_id = p_organizacion_id AND v.id = p_venta_id;

    RETURN QUERY SELECT v_sale.id, v_sale.cliente_id, v_sale.cuenta_por_cobrar_id,
                        v_payment_id, v_status, v_accumulated,
                        v_sale.total, GREATEST(v_sale.total - v_accumulated, 0)::numeric(14,2);
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_registrar_pago_confirmado(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_registrar_pago_confirmado(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_formalizar_venta_con_pago(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_monto numeric,
    p_tipo_pago text DEFAULT 'parcial',
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
    v_sale record;
BEGIN
    SELECT * INTO v_sale
      FROM public.crm_formalizar_venta(
          p_organizacion_id, p_cotizacion_id, p_registrado_por_usuario_id, NULL
      );
    RETURN QUERY
    SELECT * FROM public.crm_registrar_pago_confirmado(
        p_organizacion_id, v_sale.venta_id, p_monto, p_tipo_pago,
        p_fecha_pago, p_metodo_pago, p_referencia_pago,
        p_registrado_por_usuario_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_formalizar_venta_con_pago(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_formalizar_venta_con_pago(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    TO service_role;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES
    ('sales.manage', 'Formalizar ventas y registrar pagos propios', 510),
    ('sales.manage_team', 'Formalizar ventas y registrar pagos del equipo', 520),
    ('sales.manage_all', 'Formalizar ventas y registrar pagos de toda la organización', 530)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'sales.manage'), ('owner', 'sales.manage_all'),
    ('admin', 'sales.manage'), ('admin', 'sales.manage_all'),
    ('admin_operativo', 'sales.manage'), ('admin_operativo', 'sales.manage_all'),
    ('gerente_comercial', 'sales.manage'), ('gerente_comercial', 'sales.manage_team'),
    ('supervisor', 'sales.manage'), ('supervisor', 'sales.manage_team'),
    ('coordinador', 'sales.manage'), ('coordinador', 'sales.manage_team'),
    ('agente', 'sales.manage'),
    ('finanzas', 'sales.manage'), ('finanzas', 'sales.manage_all')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT org.id, permission.codigo, permission.descripcion
  FROM public.organizaciones AS org
 CROSS JOIN public.tenant_default_permissions AS permission
 WHERE permission.codigo IN ('sales.manage', 'sales.manage_team', 'sales.manage_all')
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

WITH role_scope AS (
    SELECT 'sales.manage'::text AS codigo, unnest(ARRAY['owner','admin','admin_operativo','gerente_comercial','supervisor','coordinador','agente','finanzas']) AS role_name
    UNION ALL SELECT 'sales.manage_team', unnest(ARRAY['gerente_comercial','supervisor','coordinador'])
    UNION ALL SELECT 'sales.manage_all', unnest(ARRAY['owner','admin','admin_operativo','finanzas'])
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT r.organizacion_id, r.id, p.id
  FROM public.roles AS r
  JOIN role_scope AS rs ON lower(trim(r.nombre)) = rs.role_name
  JOIN public.permisos AS p
    ON p.organizacion_id = r.organizacion_id AND p.codigo = rs.codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
