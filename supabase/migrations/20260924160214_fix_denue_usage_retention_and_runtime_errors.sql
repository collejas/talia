-- Corrige bloqueos del purgado DENUE y errores confirmados en RPC.
BEGIN;

-- busqueda_id es la clave idempotente/auditable de la operación. Se conserva
-- aunque el registro de búsqueda expire; no se borra ni reinicia el consumo.
ALTER TABLE public.tenant_prospeccion_raw_operations
    DROP CONSTRAINT IF EXISTS tenant_prospeccion_raw_operations_busqueda_id_fkey;
COMMENT ON COLUMN public.tenant_prospeccion_raw_operations.busqueda_id IS
    'UUID histórico e idempotente de la búsqueda DENUE; puede sobrevivir al purgado del registro busquedas.';

-- Desactiva purgadores heredados por contenido del comando, sin asumir jobid.
DO $migration$
DECLARE
    v_job_id bigint;
BEGIN
    FOR v_job_id IN
        SELECT jobid
          FROM cron.job
         WHERE command ILIKE '%purge_expired_denue_busquedas%'
    LOOP
        PERFORM cron.unschedule(v_job_id);
    END LOOP;
END;
$migration$;

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

    SELECT q.id, q.oportunidad_id, q.cuenta_id, q.total, q.moneda, q.estatus,
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

CREATE OR REPLACE FUNCTION public.reserve_brevo_daily_quota(
    p_organizacion_id uuid,
    p_quota_date date,
    p_requested_count integer,
    p_daily_limit integer DEFAULT 300
)
RETURNS TABLE (
    allowed boolean,
    daily_limit integer,
    reserved_count integer,
    available integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_row public.tenant_brevo_daily_quota_reservations%ROWTYPE;
BEGIN
    IF p_organizacion_id IS NULL OR p_quota_date IS NULL
       OR p_requested_count IS NULL OR p_requested_count <= 0
       OR p_daily_limit IS NULL OR p_daily_limit <= 0 THEN
        RAISE EXCEPTION 'brevo_daily_quota_invalid_input' USING ERRCODE = '22023';
    END IF;

    IF auth.uid() IS NOT NULL
       AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'brevo_daily_quota_organization_forbidden' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.tenant_brevo_daily_quota_reservations (
        organizacion_id, quota_date, daily_limit, reserved_count
    ) VALUES (
        p_organizacion_id, p_quota_date, p_daily_limit, 0
    )
    ON CONFLICT (organizacion_id, quota_date) DO NOTHING;

    SELECT * INTO v_row
    FROM public.tenant_brevo_daily_quota_reservations
    WHERE organizacion_id = p_organizacion_id
      AND quota_date = p_quota_date
    FOR UPDATE;

    IF v_row.daily_limit <> p_daily_limit THEN
        RAISE EXCEPTION 'brevo_daily_quota_limit_mismatch' USING ERRCODE = '22023';
    END IF;

    allowed := v_row.reserved_count + p_requested_count <= v_row.daily_limit;
    daily_limit := v_row.daily_limit;
    reserved_count := v_row.reserved_count;
    available := GREATEST(v_row.daily_limit - v_row.reserved_count, 0);

    IF allowed THEN
        UPDATE public.tenant_brevo_daily_quota_reservations AS quota
        SET reserved_count = quota.reserved_count + p_requested_count,
            updated_at = now()
        WHERE quota.organizacion_id = p_organizacion_id
          AND quota.quota_date = p_quota_date;
        reserved_count := reserved_count + p_requested_count;
        available := GREATEST(daily_limit - reserved_count, 0);
    END IF;

    RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_brevo_daily_quota(uuid, date, integer, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_brevo_daily_quota(uuid, date, integer, integer)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_brevo_daily_quota(
    p_organizacion_id uuid,
    p_quota_date date,
    p_released_count integer
)
RETURNS TABLE (
    reserved_count integer,
    available integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_row public.tenant_brevo_daily_quota_reservations%ROWTYPE;
BEGIN
    IF p_organizacion_id IS NULL OR p_quota_date IS NULL
       OR p_released_count IS NULL OR p_released_count <= 0 THEN
        RAISE EXCEPTION 'brevo_daily_quota_invalid_release' USING ERRCODE = '22023';
    END IF;
    IF auth.uid() IS NOT NULL
       AND public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'brevo_daily_quota_organization_forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_row
    FROM public.tenant_brevo_daily_quota_reservations
    WHERE organizacion_id = p_organizacion_id
      AND quota_date = p_quota_date
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'brevo_daily_quota_reservation_not_found' USING ERRCODE = '22023';
    END IF;

    UPDATE public.tenant_brevo_daily_quota_reservations AS quota
    SET reserved_count = GREATEST(quota.reserved_count - p_released_count, 0),
        updated_at = now()
    WHERE quota.organizacion_id = p_organizacion_id
      AND quota.quota_date = p_quota_date
    RETURNING quota.reserved_count INTO reserved_count;

    available := GREATEST(v_row.daily_limit - reserved_count, 0);
    RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_brevo_daily_quota(uuid, date, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_brevo_daily_quota(uuid, date, integer)
    TO authenticated, service_role;

COMMIT;
