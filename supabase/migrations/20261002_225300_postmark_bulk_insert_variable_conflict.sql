-- Fuerza a PL/pgSQL a resolver nombres de columnas ambiguos usando la
-- columna de la consulta, no las columnas OUT de la funcion.
DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.worker_insert_postmark_contact_envios_bulk(uuid,jsonb)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(
        v_definition,
        'AS $function$
BEGIN',
        'AS $function$
#variable_conflict use_column
BEGIN'
    );

    IF v_definition NOT LIKE '%#variable_conflict use_column%' THEN
        RAISE EXCEPTION 'No se pudo aplicar la politica de resolucion de variables';
    END IF;

    EXECUTE v_definition;
END;
$do$;
