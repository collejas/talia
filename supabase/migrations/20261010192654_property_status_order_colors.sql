-- Alinea el flujo visual y la reserva operativa inmobiliaria:
-- disponible (verde) -> apartado (amarillo) -> reservado (naranja) -> vendido (rojo).

DO $migration$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.crm_propiedades_geojson_impl(uuid,integer,uuid)'::regprocedure
    ) INTO v_definition;

    IF v_definition IS NOT NULL THEN
        v_definition := replace(v_definition, 'WHEN ''reservado'' THEN ''#9B59B6''', 'WHEN ''reservado'' THEN ''#F97316''');
        EXECUTE v_definition;
    END IF;
END;
$migration$;

