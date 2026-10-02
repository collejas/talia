-- Califica las columnas del CTE INSERT para evitar colision con las
-- columnas de salida de la funcion PL/pgSQL.
DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.worker_insert_postmark_contact_envios_bulk(uuid,jsonb)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(
        v_definition,
        'SELECT id, batch_id, prospecto_id, canal
    FROM inserted;',
        'SELECT inserted.id, inserted.batch_id, inserted.prospecto_id, inserted.canal
    FROM inserted;'
    );

    IF v_definition NOT LIKE '%SELECT inserted.id, inserted.batch_id%' THEN
        RAISE EXCEPTION 'No se encontro la seleccion ambigua del CTE inserted';
    END IF;

    EXECUTE v_definition;
END;
$do$;
