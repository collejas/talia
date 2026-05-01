BEGIN;

CREATE OR REPLACE FUNCTION public.panel_leads_list(
    p_tablero uuid DEFAULT NULL,
    p_etapa uuid DEFAULT NULL,
    p_categoria lead_categoria DEFAULT NULL,
    p_asignado uuid DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_order_by text DEFAULT 'creado_en',
    p_order_dir text DEFAULT 'desc',
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    tarjeta_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    contacto_empresa text,
    contacto_notas text,
    contacto_necesidad text,
    contacto_estado text,
    canal text,
    etapa_id uuid,
    etapa_nombre text,
    etapa_codigo text,
    etapa_metadatos jsonb,
    etapa_orden smallint,
    categoria lead_categoria,
    creado_en timestamptz,
    actualizado_en timestamptz,
    cerrado_en timestamptz,
    monto_estimado numeric,
    moneda text,
    probabilidad numeric,
    proyecto_nombre text,
    proyecto_necesidades text,
    lead_score integer,
    asignado_id uuid,
    asignado_nombre text,
    propietario_id uuid,
    propietario_nombre text,
    conversacion_id uuid,
    ultimo_mensaje_en timestamptz,
    motivo_cierre text,
    tags text[],
    metadata jsonb,
    total_rows bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $$
WITH filtered AS (
    SELECT
        l.id AS tarjeta_id,
        COALESCE(l.persona_id, l.contacto_id) AS contacto_id,
        p.nombre_completo AS contacto_nombre,
        p.correo_principal AS contacto_correo,
        p.telefono_principal_e164 AS contacto_telefono,
        COALESCE(NULLIF(p.persona_datos ->> 'company_name', ''), NULLIF(p.metadata ->> 'company_name', '')) AS contacto_empresa,
        COALESCE(NULLIF(p.persona_datos ->> 'notes', ''), NULLIF(p.metadata ->> 'notes', ''), NULLIF(p.notas, '')) AS contacto_notas,
        COALESCE(NULLIF(p.persona_datos ->> 'necesidad_proposito', ''), NULLIF(p.metadata ->> 'necesidad_proposito', '')) AS contacto_necesidad,
        COALESCE(NULLIF(p.estado, ''), NULLIF(p.persona_datos ->> 'estado', ''), NULLIF(p.metadata ->> 'estado', '')) AS contacto_estado,
        COALESCE(NULLIF(l.metadata ->> 'canal', ''), NULLIF(l.origen, ''), 'desconocido') AS canal,
        NULL::uuid AS etapa_id,
        COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta') AS etapa_nombre,
        lower(COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta')) AS etapa_codigo,
        COALESCE(l.metadata -> 'etapa', '{}'::jsonb) AS etapa_metadatos,
        CASE lower(COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta'))
            WHEN 'ganada' THEN 3
            WHEN 'perdida' THEN 4
            ELSE 1
        END::smallint AS etapa_orden,
        CASE
            WHEN lower(COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta')) = 'ganada' THEN 'ganada'::lead_categoria
            WHEN lower(COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta')) = 'perdida' THEN 'perdida'::lead_categoria
            ELSE 'abierta'::lead_categoria
        END AS categoria,
        l.creado_en,
        l.actualizado_en,
        CASE
            WHEN lower(COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta')) IN ('ganada', 'perdida')
                THEN l.actualizado_en
            ELSE NULL
        END AS cerrado_en,
        NULLIF(l.metadata ->> 'monto_estimado', '')::numeric AS monto_estimado,
        NULLIF(l.metadata ->> 'moneda', '') AS moneda,
        NULLIF(l.metadata ->> 'probabilidad', '')::numeric AS probabilidad,
        COALESCE(NULLIF(l.metadata ->> 'proyecto_nombre', ''), NULLIF(l.metadata ->> 'campana_nombre', '')) AS proyecto_nombre,
        NULLIF(l.metadata ->> 'proyecto_necesidades', '') AS proyecto_necesidades,
        NULLIF(l.metadata ->> 'lead_score', '')::integer AS lead_score,
        NULL::uuid AS asignado_id,
        NULL::text AS asignado_nombre,
        NULL::uuid AS propietario_id,
        NULL::text AS propietario_nombre,
        NULL::uuid AS conversacion_id,
        NULL::timestamptz AS ultimo_mensaje_en,
        NULLIF(l.metadata ->> 'motivo_cierre', '') AS motivo_cierre,
        COALESCE(
            CASE WHEN jsonb_typeof(l.metadata -> 'tags') = 'array' THEN ARRAY(
                SELECT jsonb_array_elements_text(l.metadata -> 'tags')
            ) END,
            ARRAY[]::text[]
        ) AS tags,
        l.metadata
    FROM public.leads l
    LEFT JOIN public.personas p ON p.id = COALESCE(l.persona_id, l.contacto_id)
    WHERE
        (p_tablero IS NULL OR l.campana_id = p_tablero)
        AND (p_from IS NULL OR l.creado_en >= p_from)
        AND (p_to IS NULL OR l.creado_en <= p_to)
        AND (
            p_search IS NULL OR p_search = '' OR
            p.nombre_completo ILIKE '%' || p_search || '%' OR
            p.correo_principal ILIKE '%' || p_search || '%' OR
            p.telefono_principal_e164 ILIKE '%' || p_search || '%' OR
            COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, '')) ILIKE '%' || p_search || '%' OR
            COALESCE(NULLIF(l.metadata ->> 'canal', ''), NULLIF(l.origen, '')) ILIKE '%' || p_search || '%'
        )
),
annotated AS (
    SELECT f.*, COUNT(*) OVER () AS total_rows
    FROM filtered f
),
ordered AS (
    SELECT *
    FROM annotated
    WHERE (p_categoria IS NULL OR categoria = p_categoria)
      AND (p_asignado IS NULL OR asignado_id = p_asignado)
      AND (p_etapa IS NULL OR etapa_id = p_etapa)
    ORDER BY
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) = 'asc' THEN actualizado_en END ASC,
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) <> 'asc' THEN actualizado_en END DESC,
        CASE WHEN lower(p_order_by) = 'cerrado_en' AND lower(p_order_dir) = 'asc' THEN cerrado_en END ASC,
        CASE WHEN lower(p_order_by) = 'cerrado_en' AND lower(p_order_dir) <> 'asc' THEN cerrado_en END DESC,
        CASE WHEN lower(p_order_by) = 'monto_estimado' AND lower(p_order_dir) = 'asc' THEN monto_estimado END ASC,
        CASE WHEN lower(p_order_by) = 'monto_estimado' AND lower(p_order_dir) <> 'asc' THEN monto_estimado END DESC,
        CASE WHEN lower(p_order_by) = 'probabilidad' AND lower(p_order_dir) = 'asc' THEN probabilidad END ASC,
        CASE WHEN lower(p_order_by) = 'probabilidad' AND lower(p_order_dir) <> 'asc' THEN probabilidad END DESC,
        CASE WHEN lower(p_order_by) = 'lead_score' AND lower(p_order_dir) = 'asc' THEN lead_score END ASC,
        CASE WHEN lower(p_order_by) = 'lead_score' AND lower(p_order_dir) <> 'asc' THEN lead_score END DESC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) = 'asc' THEN creado_en END ASC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) <> 'asc' THEN creado_en END DESC,
        creado_en DESC,
        tarjeta_id
)
SELECT
    tarjeta_id,
    contacto_id,
    contacto_nombre,
    contacto_correo,
    contacto_telefono,
    contacto_empresa,
    contacto_notas,
    contacto_necesidad,
    contacto_estado,
    canal,
    etapa_id,
    etapa_nombre,
    etapa_codigo,
    etapa_metadatos,
    etapa_orden,
    categoria,
    creado_en,
    actualizado_en,
    cerrado_en,
    monto_estimado,
    moneda,
    probabilidad,
    proyecto_nombre,
    proyecto_necesidades,
    lead_score,
    asignado_id,
    asignado_nombre,
    propietario_id,
    propietario_nombre,
    conversacion_id,
    ultimo_mensaje_en,
    motivo_cierre,
    tags,
    metadata,
    total_rows
FROM ordered
LIMIT COALESCE(NULLIF(p_limit, 0), 100)
OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.panel_leads_resumen(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_tablero uuid DEFAULT NULL,
    p_asignado uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $$
WITH base AS (
    SELECT
        l.*,
        COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta') AS stage_value
    FROM public.leads l
    WHERE (p_from IS NULL OR l.creado_en >= p_from)
      AND (p_to IS NULL OR l.creado_en <= p_to)
      AND (p_tablero IS NULL OR l.campana_id = p_tablero)
      AND (p_asignado IS NULL OR false)
),
counts AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE lower(stage_value) = 'abierta') AS abiertas,
        COUNT(*) FILTER (WHERE lower(stage_value) = 'ganada') AS ganadas,
        COUNT(*) FILTER (WHERE lower(stage_value) = 'perdida') AS perdidas,
        COUNT(*) FILTER (
            WHERE l.creado_en >= COALESCE(p_from, now() - INTERVAL '24 hours')
        ) AS nuevas,
        0::bigint AS vendedores_activos
    FROM base l
),
monto AS (
    SELECT COALESCE(SUM(NULLIF(metadata ->> 'monto_estimado', '')::numeric), 0)::numeric AS monto_total
    FROM base
),
top_vendedor_datos AS (
    SELECT NULL::uuid AS id, NULL::text AS nombre_completo, 0::bigint AS total
)
SELECT jsonb_build_object(
    'total', COALESCE((SELECT total FROM counts), 0),
    'abiertas', COALESCE((SELECT abiertas FROM counts), 0),
    'ganadas', COALESCE((SELECT ganadas FROM counts), 0),
    'perdidas', COALESCE((SELECT perdidas FROM counts), 0),
    'nuevas', COALESCE((SELECT nuevas FROM counts), 0),
    'vendedores_activos', COALESCE((SELECT vendedores_activos FROM counts), 0),
    'monto_total', COALESCE((SELECT monto_total FROM monto), 0),
    'top_vendedor', COALESCE((
        SELECT jsonb_build_object('id', id, 'nombre', nombre_completo, 'total', total)
        FROM top_vendedor_datos
    ), '{}'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.panel_leads_timeline(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_tablero uuid DEFAULT NULL,
    p_asignado uuid DEFAULT NULL
)
RETURNS TABLE(bucket_date date, nuevos bigint, ganados bigint, perdidos bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $$
WITH bounds AS (
    SELECT
        COALESCE(date_trunc('day', p_from), date_trunc('day', now() - INTERVAL '29 days'))::date AS start_date,
        COALESCE(date_trunc('day', p_to), date_trunc('day', now()))::date AS end_date
),
series AS (
    SELECT generate_series(start_date, end_date, '1 day')::date AS bucket_date
    FROM bounds
),
visibles AS (
    SELECT
        l.id,
        l.creado_en::date AS creado_date,
        CASE
            WHEN lower(COALESCE(l.metadata ->> 'stage', l.estado, '')) = 'ganada'
                THEN COALESCE(l.actualizado_en, l.creado_en)::date
            WHEN lower(COALESCE(l.metadata ->> 'stage', l.estado, '')) = 'perdida'
                THEN COALESCE(l.actualizado_en, l.creado_en)::date
            ELSE NULL
        END AS cerrado_date,
        COALESCE(NULLIF(l.metadata ->> 'stage', ''), NULLIF(l.estado, ''), 'abierta') AS stage_value
    FROM public.leads l
    WHERE (p_tablero IS NULL OR l.campana_id = p_tablero)
      AND (p_to IS NULL OR l.creado_en <= p_to)
      AND (p_asignado IS NULL OR false)
),
agg_new AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS nuevos
    FROM visibles
    WHERE creado_date IS NOT NULL
      AND (p_from IS NULL OR creado_date >= p_from::date)
    GROUP BY creado_date
),
agg_closed AS (
    SELECT
        cerrado_date AS bucket_date,
        COUNT(*) FILTER (WHERE lower(stage_value) = 'ganada') AS ganados,
        COUNT(*) FILTER (WHERE lower(stage_value) = 'perdida') AS perdidos
    FROM visibles
    WHERE cerrado_date IS NOT NULL
      AND (p_from IS NULL OR cerrado_date >= p_from::date)
      AND (p_to IS NULL OR cerrado_date <= p_to::date)
    GROUP BY cerrado_date
)
SELECT
    s.bucket_date,
    COALESCE(agg_new.nuevos, 0) AS nuevos,
    COALESCE(agg_closed.ganados, 0) AS ganados,
    COALESCE(agg_closed.perdidos, 0) AS perdidos
FROM series s
LEFT JOIN agg_new ON agg_new.bucket_date = s.bucket_date
LEFT JOIN agg_closed ON agg_closed.bucket_date = s.bucket_date
ORDER BY s.bucket_date;
$$;

COMMIT;
