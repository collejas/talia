BEGIN;

GRANT USAGE ON TYPE public.geometry TO authenticated, service_role;
GRANT USAGE ON TYPE public.geography TO authenticated, service_role;

COMMIT;
