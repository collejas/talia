CREATE TABLE IF NOT EXISTS public.inmobiliaria_pagos_operacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    operacion_id uuid NOT NULL REFERENCES public.operaciones_inmobiliarias(id) ON DELETE RESTRICT,
    concepto text NOT NULL DEFAULT 'reserva',
    importe numeric(18, 2) NOT NULL CHECK (importe > 0),
    moneda character(3) NOT NULL DEFAULT 'MXN',
    fecha_pago timestamptz,
    forma_pago text,
    estado text NOT NULL DEFAULT 'pendiente',
    referencia text,
    aplicado_al_precio boolean NOT NULL DEFAULT true,
    fecha_aplicacion timestamptz,
    recibido_por text,
    archivo_comprobante_id uuid REFERENCES public.archivos(id) ON DELETE SET NULL,
    observaciones text,
    creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inmobiliaria_pagos_operacion_concepto_chk CHECK (concepto IN ('reserva', 'enganche', 'parcialidad', 'liquidacion', 'otro')),
    CONSTRAINT inmobiliaria_pagos_operacion_moneda_chk CHECK (length(btrim(moneda)) = 3),
    CONSTRAINT inmobiliaria_pagos_operacion_forma_pago_chk CHECK (
        forma_pago IS NULL OR forma_pago IN ('transferencia', 'deposito', 'efectivo', 'cheque', 'tarjeta', 'otro')
    ),
    CONSTRAINT inmobiliaria_pagos_operacion_estado_chk CHECK (estado IN ('pendiente', 'reportado', 'confirmado', 'rechazado')),
    CONSTRAINT inmobiliaria_pagos_operacion_aplicacion_chk CHECK (
        aplicado_al_precio = true OR fecha_aplicacion IS NULL
    ),
    CONSTRAINT inmobiliaria_pagos_operacion_reserva_unica UNIQUE (organizacion_id, operacion_id, concepto)
);

CREATE INDEX IF NOT EXISTS inmobiliaria_pagos_operacion_org_estado_idx
    ON public.inmobiliaria_pagos_operacion (organizacion_id, estado, fecha_pago DESC);
CREATE INDEX IF NOT EXISTS inmobiliaria_pagos_operacion_org_operacion_idx
    ON public.inmobiliaria_pagos_operacion (organizacion_id, operacion_id, creado_en DESC);

COMMENT ON TABLE public.inmobiliaria_pagos_operacion IS
    'Pagos y comprobantes registrados para una operación inmobiliaria. El crédito aprobado no equivale a un pago recibido.';
COMMENT ON COLUMN public.inmobiliaria_pagos_operacion.archivo_comprobante_id IS
    'Archivo asociado en public.archivos; no contiene el binario del comprobante.';

ALTER TABLE public.inmobiliaria_pagos_operacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_pagos_operacion FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.inmobiliaria_pagos_operacion FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.inmobiliaria_pagos_operacion TO authenticated;

DROP POLICY IF EXISTS inmobiliaria_pagos_operacion_org ON public.inmobiliaria_pagos_operacion;
CREATE POLICY inmobiliaria_pagos_operacion_org
    ON public.inmobiliaria_pagos_operacion
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.crm_guardar_pago_reserva(
    p_organizacion_id uuid,
    p_operacion_id uuid,
    p_importe numeric,
    p_moneda text DEFAULT 'MXN',
    p_fecha_pago timestamptz DEFAULT NULL,
    p_forma_pago text DEFAULT NULL,
    p_estado text DEFAULT 'pendiente',
    p_referencia text DEFAULT NULL,
    p_aplicado_al_precio boolean DEFAULT true,
    p_fecha_aplicacion timestamptz DEFAULT NULL,
    p_recibido_por text DEFAULT NULL,
    p_archivo_comprobante_id uuid DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_creado_por uuid DEFAULT NULL
)
RETURNS SETOF public.inmobiliaria_pagos_operacion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_payment public.inmobiliaria_pagos_operacion%ROWTYPE;
    v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'MXN'));
    v_estado text := lower(coalesce(nullif(btrim(p_estado), ''), 'pendiente'));
    v_forma text := nullif(lower(btrim(coalesce(p_forma_pago, ''))), '');
BEGIN
    IF auth.uid() IS NOT NULL AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'property_payment_organization_forbidden';
    END IF;
    IF p_importe IS NULL OR p_importe <= 0 THEN
        RAISE EXCEPTION 'property_payment_amount_invalid';
    END IF;
    IF length(v_moneda) <> 3 THEN
        RAISE EXCEPTION 'property_payment_currency_invalid';
    END IF;
    IF v_estado NOT IN ('pendiente', 'reportado', 'confirmado', 'rechazado') THEN
        RAISE EXCEPTION 'property_payment_status_invalid';
    END IF;
    IF v_forma IS NOT NULL AND v_forma NOT IN ('transferencia', 'deposito', 'efectivo', 'cheque', 'tarjeta', 'otro') THEN
        RAISE EXCEPTION 'property_payment_method_invalid';
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

    INSERT INTO public.inmobiliaria_pagos_operacion (
        organizacion_id, operacion_id, concepto, importe, moneda, fecha_pago,
        forma_pago, estado, referencia, aplicado_al_precio, fecha_aplicacion,
        recibido_por, archivo_comprobante_id, observaciones, creado_por
    ) VALUES (
        p_organizacion_id, p_operacion_id, 'reserva', p_importe, v_moneda,
        p_fecha_pago, v_forma, v_estado, nullif(btrim(p_referencia), ''),
        coalesce(p_aplicado_al_precio, true), p_fecha_aplicacion,
        nullif(btrim(p_recibido_por), ''), p_archivo_comprobante_id,
        nullif(btrim(p_observaciones), ''), p_creado_por
    )
    ON CONFLICT (organizacion_id, operacion_id, concepto) DO UPDATE
       SET importe = EXCLUDED.importe,
           moneda = EXCLUDED.moneda,
           fecha_pago = EXCLUDED.fecha_pago,
           forma_pago = EXCLUDED.forma_pago,
           estado = EXCLUDED.estado,
           referencia = EXCLUDED.referencia,
           aplicado_al_precio = EXCLUDED.aplicado_al_precio,
           fecha_aplicacion = EXCLUDED.fecha_aplicacion,
           recibido_por = EXCLUDED.recibido_por,
           archivo_comprobante_id = COALESCE(EXCLUDED.archivo_comprobante_id, inmobiliaria_pagos_operacion.archivo_comprobante_id),
           observaciones = EXCLUDED.observaciones,
           actualizado_en = now()
     RETURNING * INTO v_payment;

    RETURN NEXT v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_guardar_pago_reserva(uuid, uuid, numeric, text, timestamptz, text, text, text, boolean, timestamptz, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_guardar_pago_reserva(uuid, uuid, numeric, text, timestamptz, text, text, text, boolean, timestamptz, text, uuid, text, uuid) TO authenticated, service_role;
