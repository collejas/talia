-- Evita que la vista use los permisos/RLS del propietario.
ALTER VIEW public.prospeccion_prospecto_contacto_stats
    SET (security_invoker = true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.prospeccion_prospecto_contacto_stats FROM authenticated;
GRANT SELECT ON public.prospeccion_prospecto_contacto_stats TO authenticated;
