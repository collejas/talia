BEGIN;

-- ============================================================================
-- Incluye el orden de la etapa en panel_leads_list para que el frontend pueda
-- respetar la secuencia definida en lead_etapas.
-- ============================================================================

DROP FUNCTION IF EXISTS public.panel_leads_list(
    uuid,
    uuid,
    public.lead_categoria,
    uuid,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    integer,
    integer
);

CREATE OR REPLACE FUNCTION public.panel_leads_list(
    p_tablero uuid DEFAULT NULL,
    p_etapa uuid DEFAULT NULL,
    p_categoria public.lead_categoria DEFAULT NULL,
    p_asignado uuid DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_order_by text DEFAULT 'creado_en',
    p_order_dir text DEFAULT 'desc',
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
) RETURNS TABLE(
    tarjeta_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    contacto_estado text,
    canal text,
    etapa_id uuid,
    etapa_nombre text,
    etapa_orden smallint,
    categoria public.lead_categoria,
    creado_en timestamptz,
    actualizado_en timestamptz,
    cerrado_en timestamptz,
    monto_estimado numeric,
    moneda text,
    probabilidad numeric,
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
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
WITH filtered AS (
    SELECT
        lt.id AS tarjeta_id,
        lt.contacto_id,
        ct.nombre_completo AS contacto_nombre,
        ct.correo AS contacto_correo,
        ct.telefono_e164 AS contacto_telefono,
        COALESCE(NULLIF(ct.estado, ''), NULLIF(ct.captura_estado, '')) AS contacto_estado,
        COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, '')) AS canal,
        le.id AS etapa_id,
        le.nombre AS etapa_nombre,
        le.orden AS etapa_orden,
        le.categoria,
        lt.creado_en,
        lt.actualizado_en,
        lt.cerrado_en,
        lt.monto_estimado,
        lt.moneda,
        COALESCE(lt.probabilidad_override, le.probabilidad) AS probabilidad,
        lt.lead_score,
        lt.asignado_a_usuario_id AS asignado_id,
        asignado.nombre_completo AS asignado_nombre,
        lt.propietario_usuario_id AS propietario_id,
        propietario.nombre_completo AS propietario_nombre,
        lt.conversacion_id,
        conv.ultimo_mensaje_en,
        lt.motivo_cierre,
        lt.tags,
        lt.metadata
    FROM public.lead_tarjetas lt
    JOIN public.lead_etapas le ON le.id = lt.etapa_id
    JOIN public.contactos ct ON ct.id = lt.contacto_id
    LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
    LEFT JOIN public.usuarios asignado ON asignado.id = lt.asignado_a_usuario_id
    LEFT JOIN public.usuarios propietario ON propietario.id = lt.propietario_usuario_id
    WHERE public.puede_ver_lead(lt.id)
      AND (p_tablero IS NULL OR lt.tablero_id = p_tablero)
      AND (p_etapa IS NULL OR lt.etapa_id = p_etapa)
      AND (p_categoria IS NULL OR le.categoria = p_categoria)
      AND (p_asignado IS NULL OR lt.asignado_a_usuario_id = p_asignado)
      AND (p_from IS NULL OR lt.creado_en >= p_from)
      AND (p_to IS NULL OR lt.creado_en <= p_to)
      AND (
        p_search IS NULL OR p_search = '' OR
        ct.nombre_completo ILIKE '%' || p_search || '%' OR
        ct.correo ILIKE '%' || p_search || '%' OR
        ct.telefono_e164 ILIKE '%' || p_search || '%' OR
        le.nombre ILIKE '%' || p_search || '%' OR
        COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, '')) ILIKE '%' || p_search || '%' OR
        asignado.nombre_completo ILIKE '%' || p_search || '%' OR
        propietario.nombre_completo ILIKE '%' || p_search || '%'
      )
),
annotated AS (
    SELECT
        f.*,
        COUNT(*) OVER () AS total_rows
    FROM filtered f
),
ordered AS (
    SELECT *
    FROM annotated
    ORDER BY
        CASE
            WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) = 'asc' THEN actualizado_en
        END ASC,
        CASE
            WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) <> 'asc' THEN actualizado_en
        END DESC,
        CASE
            WHEN lower(p_order_by) = 'cerrado_en' AND lower(p_order_dir) = 'asc' THEN cerrado_en
        END ASC,
        CASE
            WHEN lower(p_order_by) = 'cerrado_en' AND lower(p_order_dir) <> 'asc' THEN cerrado_en
        END DESC,
        CASE
            WHEN lower(p_order_by) = 'monto_estimado' AND lower(p_order_dir) = 'asc' THEN monto_estimado
        END ASC,
        CASE
            WHEN lower(p_order_by) = 'monto_estimado' AND lower(p_order_dir) <> 'asc' THEN monto_estimado
        END DESC,
        CASE
            WHEN lower(p_order_by) = 'probabilidad' AND lower(p_order_dir) = 'asc' THEN probabilidad
        END ASC,
        CASE
            WHEN lower(p_order_by) = 'probabilidad' AND lower(p_order_dir) <> 'asc' THEN probabilidad
        END DESC,
        CASE
            WHEN lower(p_order_by) = 'lead_score' AND lower(p_order_dir) = 'asc' THEN lead_score
        END ASC,
        CASE
            WHEN lower(p_order_by) = 'lead_score' AND lower(p_order_dir) <> 'asc' THEN lead_score
        END DESC,
        CASE
            WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) = 'asc' THEN creado_en
        END ASC,
        CASE
            WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) <> 'asc' THEN creado_en
        END DESC,
        creado_en DESC,
        tarjeta_id
)
SELECT
    tarjeta_id,
    contacto_id,
    contacto_nombre,
    contacto_correo,
    contacto_telefono,
    contacto_estado,
    canal,
    etapa_id,
    etapa_nombre,
    etapa_orden,
    categoria,
    creado_en,
    actualizado_en,
    cerrado_en,
    monto_estimado,
    moneda,
    probabilidad,
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
$function$;

COMMIT;
