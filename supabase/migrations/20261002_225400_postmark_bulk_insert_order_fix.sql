-- Corrige el ORDER BY final después de renombrar las columnas temporales.
DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.worker_insert_postmark_contact_envios_bulk(uuid,jsonb)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(v_definition, 'ORDER BY i.id;', 'ORDER BY i.inserted_id;');

    IF v_definition NOT LIKE '%ORDER BY i.inserted_id%' THEN
        RAISE EXCEPTION 'No se encontro el ORDER BY temporal del bulk insert';
    END IF;

    EXECUTE v_definition;
END;
$do$;
