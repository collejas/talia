BEGIN;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_batch_idx
    ON public.prospeccion_contacto_envio (organizacion_id, batch_id);

CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_org_envio_idx
    ON public.prospeccion_contactos_log (organizacion_id, envio_id)
    WHERE envio_id IS NOT NULL;

DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.prospeccion_campana_template_atribucion_rango(uuid,integer,timestamptz,timestamptz,integer)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(
        v_definition,
        $old$),
respuesta_por_envio AS ($old$,
        $new$),
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
respuesta_por_envio AS (
    $new$);

    v_definition := replace(
        v_definition,
        $old$FROM public.prospeccion_contactos_log l
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
      AND l.envio_id IS NOT NULL
    GROUP BY l.envio_id$old$,
        $new$FROM scoped_logs l
    GROUP BY l.envio_id$new$
    );

    v_definition := replace(
        v_definition,
        $old$FROM public.prospeccion_contactos_log l
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
      AND l.envio_id IS NOT NULL
      AND l.canal = 'correo'
    GROUP BY l.envio_id$old$,
        $new$FROM scoped_logs l
    WHERE l.canal = 'correo'
    GROUP BY l.envio_id$new$
    );

    EXECUTE v_definition;
END;
$do$;

COMMIT;
