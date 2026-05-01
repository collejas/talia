BEGIN;

DROP FUNCTION IF EXISTS public.tg_contactos_auto_asignacion();
DROP FUNCTION IF EXISTS public.tg_contactos_auto_precalificado();
DROP FUNCTION IF EXISTS public.tg_contactos_captura_estado();
DROP FUNCTION IF EXISTS public.tg_contactos_codigo_y_sync();

COMMIT;
