-- Evita el comportamiento inconsistente del bloque PL/pgSQL y devuelve
-- directamente la fila cerrada al repositorio.
DROP FUNCTION IF EXISTS public.close_message_billing_period(uuid, uuid);

CREATE FUNCTION public.close_message_billing_period(
  p_periodo_id uuid,
  p_usuario_id uuid
)
RETURNS SETOF public.cobro_periodos
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  UPDATE public.cobro_periodos
  SET estado = 'cerrado',
      cerrado_en = now(),
      cerrado_por_usuario_id = p_usuario_id
  WHERE id = p_periodo_id
    AND estado IN ('abierto', 'en_revision')
    AND fecha_fin <= now()
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.close_message_billing_period(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_message_billing_period(uuid, uuid) TO service_role;
