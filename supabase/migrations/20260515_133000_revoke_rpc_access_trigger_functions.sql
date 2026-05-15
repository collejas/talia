BEGIN;

REVOKE EXECUTE ON FUNCTION public.roles_autofill_codigo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.roles_before_insert_guard() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_personas_derive_nombre_completo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_contactos_to_personas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_validate_empleados_supervisores_org() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_set_organizacion_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_eventos_auditoria_organizacion_id() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_set_org_from_contacto_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_org_from_conversacion_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_org_from_cotizacion_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_org_from_empleado_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_org_from_lead_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_org_from_mensaje_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_org_from_usuario_id() FROM PUBLIC, anon, authenticated;

COMMIT;
