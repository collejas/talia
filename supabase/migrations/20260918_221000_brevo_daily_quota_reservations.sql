BEGIN;

-- Límite comercial de Talia para Brevo. La fecha se guarda explícitamente en
-- UTC para que dos campañas concurrentes no puedan reservar el mismo cupo.
CREATE TABLE IF NOT EXISTS public.tenant_brevo_daily_quota_reservations (
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    quota_date date NOT NULL,
    daily_limit integer NOT NULL DEFAULT 300,
    reserved_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organizacion_id, quota_date),
    CONSTRAINT tenant_brevo_daily_quota_limit_check CHECK (daily_limit > 0),
    CONSTRAINT tenant_brevo_daily_quota_reserved_check CHECK (reserved_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_brevo_daily_quota_date
    ON public.tenant_brevo_daily_quota_reservations (quota_date, organizacion_id);

ALTER TABLE public.tenant_brevo_daily_quota_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_brevo_daily_quota_member_read
    ON public.tenant_brevo_daily_quota_reservations;
CREATE POLICY tenant_brevo_daily_quota_member_read
    ON public.tenant_brevo_daily_quota_reservations
    FOR SELECT TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

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
        UPDATE public.tenant_brevo_daily_quota_reservations
        SET reserved_count = reserved_count + p_requested_count,
            updated_at = now()
        WHERE organizacion_id = p_organizacion_id
          AND quota_date = p_quota_date;
        reserved_count := reserved_count + p_requested_count;
        available := GREATEST(daily_limit - reserved_count, 0);
    END IF;

    RETURN NEXT;
END;
$function$;

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

    UPDATE public.tenant_brevo_daily_quota_reservations
    SET reserved_count = GREATEST(reserved_count - p_released_count, 0),
        updated_at = now()
    WHERE organizacion_id = p_organizacion_id
      AND quota_date = p_quota_date
    RETURNING tenant_brevo_daily_quota_reservations.reserved_count INTO reserved_count;

    available := GREATEST(v_row.daily_limit - reserved_count, 0);
    RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_brevo_daily_quota(uuid, date, integer, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_brevo_daily_quota(uuid, date, integer, integer)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_brevo_daily_quota(uuid, date, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_brevo_daily_quota(uuid, date, integer)
    TO authenticated, service_role;

COMMENT ON TABLE public.tenant_brevo_daily_quota_reservations IS
    'Reservas atómicas del límite diario de 300 envíos Brevo por tenant en UTC.';

COMMIT;
