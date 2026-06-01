BEGIN;

CREATE OR REPLACE FUNCTION public.panel_contactos_resumen(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_propietario uuid DEFAULT NULL,
    p_origen text DEFAULT NULL,
    p_organizacion uuid DEFAULT NULL,
    p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH base AS (
    SELECT
        p.id,
        p.estado,
        COALESCE(NULLIF(lower(p.metadata->>'legacy_captura_estado'), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(p.origen), ''), 'otro') AS origen,
        p.propietario_usuario_id,
        p.creado_en
    FROM public.personas p
    WHERE (p_from IS NULL OR p.creado_en >= p_from)
      AND (p_to IS NULL OR p.creado_en <= p_to)
      AND (p_propietario IS NULL OR p.propietario_usuario_id = p_propietario)
      AND (p_origen IS NULL OR lower(p.origen) = lower(p_origen))
      AND (
        p_search IS NULL OR p_search = '' OR
        p.nombre_completo ILIKE '%' || p_search || '%' OR
        p.correo_principal ILIKE '%' || p_search || '%' OR
        p.telefono_principal_e164 ILIKE '%' || p_search || '%' OR
        COALESCE(p.metadata->>'legacy_company_name', '') ILIKE '%' || p_search || '%' OR
        COALESCE(p.notas, '') ILIKE '%' || p_search || '%' OR
        COALESCE(p.metadata->>'legacy_contacto_codigo', '') ILIKE '%' || p_search || '%' OR
        COALESCE(p.metadata->>'legacy_rfc', '') ILIKE '%' || p_search || '%'
      )
      AND (
        (
          p_organizacion IS NOT NULL
          AND p.organizacion_id = p_organizacion
        )
        OR (
          p_organizacion IS NULL
          AND (
            public.es_admin(auth.uid())
            OR p.organizacion_id = public.usuario_organizacion_id(auth.uid())
          )
        )
      )
),
counts AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE captura_estado = 'completo') AS completos,
        COUNT(*) FILTER (WHERE captura_estado <> 'completo') AS incompletos,
        COUNT(*) FILTER (WHERE estado = 'activo') AS activos,
        COUNT(*) FILTER (WHERE estado = 'lead') AS leads,
        COUNT(*) FILTER (WHERE origen = 'webchat') AS webchat,
        COUNT(DISTINCT propietario_usuario_id) FILTER (WHERE propietario_usuario_id IS NOT NULL) AS propietarios
    FROM base
),
recent AS (
    SELECT MAX(creado_en) AS ultimo_creado
    FROM base
)
SELECT jsonb_build_object(
    'total', COALESCE((SELECT total FROM counts), 0),
    'completos', COALESCE((SELECT completos FROM counts), 0),
    'incompletos', COALESCE((SELECT incompletos FROM counts), 0),
    'activos', COALESCE((SELECT activos FROM counts), 0),
    'leads', COALESCE((SELECT leads FROM counts), 0),
    'webchat', COALESCE((SELECT webchat FROM counts), 0),
    'propietarios', COALESCE((SELECT propietarios FROM counts), 0),
    'ultimo', (SELECT ultimo_creado FROM recent)
);
$$;

GRANT EXECUTE ON FUNCTION public.panel_contactos_resumen(
    timestamptz,
    timestamptz,
    uuid,
    text,
    uuid,
    text
) TO authenticated, service_role;

COMMIT;
