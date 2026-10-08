BEGIN;

-- `envios_correo_total` conserva su semántica de negocio: sólo cuenta un
-- envío aceptado por el proveedor. Este contador es operativo y evita que un
-- prospecto pendiente, suprimido o fallido vuelva a entrar automáticamente
-- en otra campaña.
ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS envios_correo_intentos_total bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.prospeccion_prospectos.envios_correo_intentos_total IS
    'Intentos de correo reservados/enviados que bloquean una nueva selección automática; excluye cancelados y omitidos.';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_correo_intentos_lookup_idx
    ON public.prospeccion_prospectos (
        organizacion_id,
        envios_correo_intentos_total,
        email_lookup_status,
        creado_en DESC,
        id
    )
    WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE OR REPLACE FUNCTION public.sync_prospeccion_prospectos_envio_totales(
    p_organizacion_id uuid,
    p_prospecto_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_prospecto_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.prospeccion_prospectos p
    SET envios_correo_intentos_total = COALESCE(s.correo_intentos_total, 0),
        envios_correo_total = COALESCE(s.correo_total, 0),
        envios_whatsapp_total = COALESCE(s.whatsapp_total, 0),
        envios_voz_total = COALESCE(s.voz_total, 0),
        envios_total = COALESCE(s.total_envios, 0)
    FROM (
        SELECT
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) = 'correo'
                  AND LOWER(COALESCE(e.estado, '')) NOT IN ('cancelado', 'canceled', 'omitido')
            )::bigint AS correo_intentos_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) = 'correo'
                  AND LOWER(COALESCE(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
            )::bigint AS correo_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) = 'whatsapp'
                  AND (e.proveedor_aceptado_en IS NOT NULL OR NULLIF(TRIM(e.mensaje_id), '') IS NOT NULL)
            )::bigint AS whatsapp_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) IN ('llamada', 'voz', 'voice', 'call')
                  AND LOWER(COALESCE(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
            )::bigint AS voz_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
                   OR e.proveedor_aceptado_en IS NOT NULL
                   OR NULLIF(TRIM(e.mensaje_id), '') IS NOT NULL
            )::bigint AS total_envios
        FROM public.prospeccion_contacto_envio e
        WHERE e.organizacion_id = p_organizacion_id
          AND e.prospecto_id = p_prospecto_id
    ) AS s
    WHERE p.organizacion_id = p_organizacion_id
      AND p.id = p_prospecto_id;
END;
$function$;

-- Reconstrucción idempotente de los datos existentes.
WITH stats AS (
    SELECT
        e.organizacion_id,
        e.prospecto_id,
        COUNT(*) FILTER (
            WHERE LOWER(COALESCE(e.canal, '')) = 'correo'
              AND LOWER(COALESCE(e.estado, '')) NOT IN ('cancelado', 'canceled', 'omitido')
        )::bigint AS correo_intentos_total
    FROM public.prospeccion_contacto_envio e
    GROUP BY e.organizacion_id, e.prospecto_id
)
UPDATE public.prospeccion_prospectos p
SET envios_correo_intentos_total = COALESCE(s.correo_intentos_total, 0)
FROM stats s
WHERE p.organizacion_id = s.organizacion_id
  AND p.id = s.prospecto_id;

-- La preparación Postmark desactiva el trigger de totales para insertar en
-- bloque. Se agrega el contador operativo en una sola actualización por batch.
DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.worker_insert_postmark_contact_envios_bulk(uuid,jsonb)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(
        v_definition,
        '    RETURN QUERY
    SELECT i.inserted_id, i.inserted_batch_id, i.inserted_prospecto_id, i.inserted_canal',
        '    WITH attempt_stats AS (
        SELECT e.organizacion_id, e.prospecto_id,
               COUNT(*) FILTER (
                   WHERE LOWER(COALESCE(e.canal, '''')) = ''correo''
                     AND LOWER(COALESCE(e.estado, '''')) NOT IN (''cancelado'', ''canceled'', ''omitido'')
               )::bigint AS correo_intentos_total
        FROM public.prospeccion_contacto_envio e
        JOIN (SELECT DISTINCT inserted_prospecto_id FROM postmark_inserted_contact_envios) affected
          ON affected.inserted_prospecto_id = e.prospecto_id
        WHERE e.organizacion_id = p_organizacion_id
        GROUP BY e.organizacion_id, e.prospecto_id
    )
    UPDATE public.prospeccion_prospectos p
    SET envios_correo_intentos_total = s.correo_intentos_total
    FROM attempt_stats s
    WHERE p.organizacion_id = s.organizacion_id
      AND p.id = s.prospecto_id;

    RETURN QUERY
    SELECT i.inserted_id, i.inserted_batch_id, i.inserted_prospecto_id, i.inserted_canal'
    );

    IF v_definition NOT LIKE '%envios_correo_intentos_total%' THEN
        RAISE EXCEPTION 'No se pudo agregar el contador de intentos de correo al worker Postmark';
    END IF;
    EXECUTE v_definition;
END;
$do$;

COMMIT;
