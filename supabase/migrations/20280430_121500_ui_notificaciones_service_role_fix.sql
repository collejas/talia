BEGIN;

ALTER TABLE public.ui_notificaciones NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ui_notificaciones TO service_role;

COMMIT;
