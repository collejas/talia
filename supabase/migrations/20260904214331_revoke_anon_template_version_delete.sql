BEGIN;

REVOKE ALL ON FUNCTION public.eliminar_prospeccion_plantilla_version(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_prospeccion_plantilla_version(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.eliminar_prospeccion_plantilla_version(uuid, uuid, uuid) TO authenticated;

COMMIT;
