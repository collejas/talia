BEGIN;

GRANT EXECUTE ON FUNCTION public.registrar_recepcion_compra(
    uuid,
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_recepcion_compra(
    uuid,
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.registrar_recepcion_compra(
    uuid,
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    jsonb
) FROM anon;

COMMIT;
