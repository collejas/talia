-- La proyeccion de Postmark reemplazo la funcion despues de la optimizacion
-- original. Esta version limita los logs a los envios ya seleccionados.
DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.prospeccion_campana_template_atribucion_rango(uuid,integer,timestamptz,timestamptz,integer)'::regprocedure
    ) INTO v_definition;

    v_definition := regexp_replace(
        v_definition,
        E'\\),\\s*respuesta_por_envio AS \\(',
        $replacement$),
scoped_envio_ids AS (
    SELECT DISTINCT envio_id FROM envios_base
),
scoped_logs AS MATERIALIZED (
    SELECT l.envio_id, l.accion, l.estado, l.canal, l.detalle
    FROM public.prospeccion_contactos_log l
    JOIN scoped_envio_ids s ON s.envio_id = l.envio_id
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
),
respuesta_por_envio AS ($replacement$,
        1
    );

    v_definition := regexp_replace(
        v_definition,
        E'FROM public\\.prospeccion_contactos_log l\\s+CROSS JOIN contexto_org co\\s+WHERE l\\.organizacion_id\\s*=\\s*co\\.organizacion_id\\s+AND l\\.envio_id IS NOT NULL\\s+AND l\\.canal = ''correo''\\s+GROUP BY l\\.envio_id',
        $replacement$FROM scoped_logs l
    WHERE l.canal = 'correo'
    GROUP BY l.envio_id$replacement$,
        1
    );

    v_definition := regexp_replace(
        v_definition,
        E'FROM public\\.prospeccion_contactos_log l\\s+CROSS JOIN contexto_org co\\s+WHERE l\\.organizacion_id\\s*=\\s*co\\.organizacion_id\\s+AND l\\.envio_id IS NOT NULL\\s+GROUP BY l\\.envio_id',
        $replacement$FROM scoped_logs l
    GROUP BY l.envio_id$replacement$,
        1
    );

    IF v_definition NOT ILIKE '%scoped_logs AS MATERIALIZED%'
       OR v_definition NOT ILIKE '%FROM scoped_logs l%' THEN
        RAISE EXCEPTION 'No se pudo aplicar la optimizacion de logs a la funcion';
    END IF;

    EXECUTE v_definition;
END;
$do$;
