-- La corrección de comprador debe pasar por el endpoint que valida el permiso elevado.
-- El frontend nunca debe invocar directamente este RPC como usuario autenticado.
REVOKE EXECUTE ON FUNCTION public.crm_cambiar_comprador_operacion(uuid, uuid, uuid, uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crm_cambiar_comprador_operacion(uuid, uuid, uuid, uuid, text, uuid) TO service_role;
