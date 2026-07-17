BEGIN;

ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversaciones_canal_check;

ALTER TABLE public.conversaciones
    ADD CONSTRAINT conversaciones_canal_check
    CHECK (
        canal = ANY (
            ARRAY[
                'whatsapp'::text,
                'instagram'::text,
                'webchat'::text,
                'voz'::text,
                'manual'::text,
                'messenger'::text,
                'correo'::text
            ]
        )
    );

COMMIT;
