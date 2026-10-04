-- La finalizacion de un bloque de hasta 500 es una operacion exclusiva del
-- worker. El timeout global de PostgREST es demasiado corto cuando coincide
-- con la actualizacion de contadores, pero no se debe elevar globalmente.
ALTER FUNCTION public.worker_finalize_postmark_envios_bulk(uuid, jsonb)
    SET statement_timeout = '30s';
