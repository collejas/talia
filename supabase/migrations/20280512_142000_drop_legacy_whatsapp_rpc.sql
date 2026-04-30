BEGIN;

DROP FUNCTION IF EXISTS public.registrar_mensaje_whatsapp(
    text,
    text,
    text,
    text,
    jsonb,
    text,
    text,
    uuid,
    uuid,
    text,
    integer,
    integer,
    jsonb,
    jsonb
);

COMMIT;
