-- Resumen de reinicios de oportunidades por contacto.

DROP FUNCTION IF EXISTS public.crm_contact_restart_stats(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.crm_contact_restart_stats(
    p_organizacion_id uuid,
    p_min_restart_sequence integer DEFAULT 2,
    p_limit integer DEFAULT 200
)
RETURNS TABLE(
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    total_ciclos integer,
    ciclo_actual integer,
    monto_total numeric,
    monto_ciclo_actual numeric,
    monto_ciclos_previos numeric,
    oportunidad_id uuid,
    etapa_id uuid,
    etapa_nombre text,
    estado text,
    vendedor_id uuid,
    vendedor_nombre text,
    actualizado_en timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
WITH base AS (
    SELECT
        o.id AS oportunidad_id,
        o.contacto_principal_id AS contacto_id,
        o.organizacion_id,
        COALESCE((o.metadata->>'restart_sequence')::integer, 1) AS restart_sequence,
        COALESCE(o.monto_estimado, 0) AS monto_estimado,
        o.estado,
        o.etapa_id,
        o.asignado_a_usuario_id,
        COALESCE(o.actualizado_en, o.creado_en) AS actualizado_en,
        o.creado_en
    FROM public.oportunidades o
    WHERE
        o.organizacion_id = p_organizacion_id
        AND o.contacto_principal_id IS NOT NULL
),
ranked AS (
    SELECT
        b.*,
        ROW_NUMBER() OVER (
            PARTITION BY b.contacto_id
            ORDER BY b.restart_sequence DESC,
                     b.actualizado_en DESC,
                     b.creado_en DESC
        ) AS rn
    FROM base b
),
aggregated AS (
    SELECT
        contacto_id,
        COUNT(*)::integer AS total_ciclos,
        MAX(restart_sequence)::integer AS ciclo_actual,
        SUM(monto_estimado)::numeric AS monto_total
    FROM base
    GROUP BY contacto_id
),
current_cycle AS (
    SELECT r.*
    FROM ranked r
    WHERE r.rn = 1
)
SELECT
    agg.contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.correo AS contacto_correo,
    ct.telefono_e164 AS contacto_telefono,
    agg.total_ciclos,
    agg.ciclo_actual,
    agg.monto_total,
    cur.monto_estimado AS monto_ciclo_actual,
    (agg.monto_total - cur.monto_estimado) AS monto_ciclos_previos,
    cur.oportunidad_id,
    cur.etapa_id,
    ep.nombre AS etapa_nombre,
    cur.estado,
    cur.asignado_a_usuario_id AS vendedor_id,
    usr.nombre_completo AS vendedor_nombre,
    cur.actualizado_en
FROM aggregated agg
JOIN current_cycle cur ON cur.contacto_id = agg.contacto_id
JOIN public.contactos ct ON ct.id = agg.contacto_id
LEFT JOIN public.etapas_pipeline ep ON ep.id = cur.etapa_id
LEFT JOIN public.usuarios usr ON usr.id = cur.asignado_a_usuario_id
WHERE agg.ciclo_actual >= GREATEST(p_min_restart_sequence, 1)
ORDER BY agg.ciclo_actual DESC, agg.total_ciclos DESC, cur.actualizado_en DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 200);
$function$;

COMMENT ON FUNCTION public.crm_contact_restart_stats(uuid, integer, integer)
IS 'Devuelve métricas de reinicio de oportunidades agrupadas por contacto.';
