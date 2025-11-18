BEGIN;

CREATE OR REPLACE FUNCTION public.embudo_visitantes_whatsapp(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH visibles AS (
    SELECT c.id
      FROM public.conversaciones c
     WHERE c.canal = 'whatsapp'
       AND public.puede_ver_conversacion(c.id)
       AND (p_from IS NULL OR c.iniciada_en >= p_from)
       AND (p_to IS NULL OR c.iniciada_en <= p_to)
)
SELECT COUNT(*)::bigint AS total
  FROM visibles;
$$;

COMMENT ON FUNCTION public.embudo_visitantes_whatsapp(timestamptz, timestamptz)
    IS 'Cuenta conversaciones de WhatsApp visibles para el usuario en el periodo indicado.';

COMMIT;
