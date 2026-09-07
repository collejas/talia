BEGIN;

-- La transaccion DENUE valida duplicados y ejecuta triggers de auditoria por
-- prospecto. El limite general del rol authenticator (8s) la cancelaba antes
-- de que pudiera terminar, aun con lotes de 250 resultados.
ALTER FUNCTION public.prospeccion_guardar_denue_transaccional(
    uuid,
    uuid,
    uuid,
    uuid[],
    text,
    jsonb
)
SET statement_timeout = '60s';

COMMIT;
