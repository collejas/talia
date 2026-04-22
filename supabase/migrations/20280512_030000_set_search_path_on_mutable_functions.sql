-- Pin search_path on functions flagged by the Supabase security advisor.

ALTER FUNCTION public.gen_codigo_contacto(uuid) SET search_path TO public;
ALTER FUNCTION public._contacto_legacy_uuid(jsonb, uuid) SET search_path TO public;
ALTER FUNCTION public.gen_codigo_cuenta(uuid) SET search_path TO public;
ALTER FUNCTION public.tg_contactos_codigo_y_sync() SET search_path TO public;
ALTER FUNCTION public.tg_cuentas_codigo_y_sync() SET search_path TO public;
ALTER FUNCTION public.sync_prospeccion_prospectos_derived_cols() SET search_path TO public;
