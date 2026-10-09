BEGIN;

-- Sólo el trigger interno y el worker de servicio deben poder invocar estas
-- funciones. No son RPC de negocio para usuarios autenticados.
REVOKE ALL ON FUNCTION public.prospeccion_prospectos_resumen_apply_delta(uuid, integer, public.prospeccion_prospectos)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_prospeccion_prospectos_resumen_delta()
    FROM PUBLIC, anon, authenticated;

COMMIT;
