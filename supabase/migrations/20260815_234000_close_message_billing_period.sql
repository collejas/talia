-- Cierre explícito y protegido de periodos de cobro.
CREATE OR REPLACE FUNCTION public.close_message_billing_period(
  p_periodo_id uuid,
  p_usuario_id uuid
)
RETURNS public.cobro_periodos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period public.cobro_periodos;
BEGIN
  UPDATE public.cobro_periodos
  SET estado = 'cerrado',
      cerrado_en = now(),
      cerrado_por_usuario_id = p_usuario_id
  WHERE id = p_periodo_id
    AND estado IN ('abierto', 'en_revision')
    AND fecha_fin <= now()
  RETURNING * INTO v_period;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_period_not_closable';
  END IF;
  RETURN v_period;
END;
$$;

REVOKE ALL ON FUNCTION public.close_message_billing_period(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_message_billing_period(uuid, uuid) TO service_role;
