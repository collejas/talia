-- Evita colisiones entre columnas de salida PL/pgSQL y columnas temporales
-- usadas para devolver las filas insertadas.
DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.worker_insert_postmark_contact_envios_bulk(uuid,jsonb)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(v_definition,
        'id uuid PRIMARY KEY,
        batch_id uuid NOT NULL,
        prospecto_id uuid NOT NULL,
        canal text NOT NULL',
        'inserted_id uuid PRIMARY KEY,
        inserted_batch_id uuid NOT NULL,
        inserted_prospecto_id uuid NOT NULL,
        inserted_canal text NOT NULL');
    v_definition := replace(v_definition,
        'INSERT INTO postmark_inserted_contact_envios (id, batch_id, prospecto_id, canal)
    SELECT inserted.id, inserted.batch_id, inserted.prospecto_id, inserted.canal',
        'INSERT INTO postmark_inserted_contact_envios (
        inserted_id, inserted_batch_id, inserted_prospecto_id, inserted_canal
    )
    SELECT inserted.id, inserted.batch_id, inserted.prospecto_id, inserted.canal');
    v_definition := replace(v_definition,
        'JOIN (SELECT DISTINCT prospecto_id FROM postmark_inserted_contact_envios) AS affected
          ON affected.prospecto_id = e.prospecto_id',
        'JOIN (
            SELECT DISTINCT i.inserted_prospecto_id
            FROM postmark_inserted_contact_envios AS i
        ) AS affected
          ON affected.inserted_prospecto_id = e.prospecto_id');
    v_definition := replace(v_definition,
        'SELECT i.id, i.batch_id, i.prospecto_id, i.canal',
        'SELECT i.inserted_id, i.inserted_batch_id, i.inserted_prospecto_id, i.inserted_canal');

    IF v_definition NOT LIKE '%inserted_id uuid PRIMARY KEY%'
       OR v_definition NOT LIKE '%i.inserted_prospecto_id%' THEN
        RAISE EXCEPTION 'No se pudo corregir la salida temporal del bulk insert';
    END IF;

    EXECUTE v_definition;
END;
$do$;
