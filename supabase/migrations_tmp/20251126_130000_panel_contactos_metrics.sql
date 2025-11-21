-- Panel contactos metrics and listings
BEGIN;

CREATE OR REPLACE FUNCTION public.puede_ver_contacto(p_contacto_id uuid) RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
SELECT EXISTS (
    SELECT 1
    FROM public.contactos c
    WHERE c.id = p_contacto_id
      AND (
        public.es_admin(auth.uid())
        OR c.propietario_usuario_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.lead_tarjetas lt
            WHERE lt.contacto_id = c.id
              AND (
                  lt.propietario_usuario_id = auth.uid()
                  OR lt.asignado_a_usuario_id = auth.uid()
              )
        )
      )
);
$function$;

COMMENT ON FUNCTION public.puede_ver_contacto(uuid) IS
    'True cuando el usuario es admin o propietario del contacto o de una tarjeta relacionada.';

CREATE OR REPLACE FUNCTION public.panel_contactos_resumen(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_propietario uuid DEFAULT NULL,
    p_origen text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
WITH base AS (
    SELECT
        c.id,
        COALESCE(NULLIF(lower(c.estado), ''), 'desconocido') AS estado,
        COALESCE(NULLIF(lower(c.captura_estado), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(c.origen), ''), 'otro') AS origen,
        c.propietario_usuario_id,
        c.creado_en
    FROM public.contactos c
    WHERE (p_from IS NULL OR c.creado_en >= p_from)
      AND (p_to IS NULL OR c.creado_en <= p_to)
      AND (p_propietario IS NULL OR c.propietario_usuario_id = p_propietario)
      AND (p_origen IS NULL OR lower(c.origen) = lower(p_origen))
      AND public.puede_ver_contacto(c.id)
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
$function$;

CREATE OR REPLACE FUNCTION public.panel_contactos_timeline(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_propietario uuid DEFAULT NULL,
    p_origen text DEFAULT NULL
) RETURNS TABLE(
    bucket_date date,
    nuevos bigint,
    completos bigint,
    webchat bigint
)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
WITH bounds AS (
    SELECT
        COALESCE(date_trunc('day', p_from), date_trunc('day', now() - INTERVAL '29 days'))::date AS start_date,
        COALESCE(date_trunc('day', p_to), date_trunc('day', now()))::date AS end_date
),
series AS (
    SELECT generate_series(start_date, end_date, '1 day')::date AS bucket_date
    FROM bounds
),
base AS (
    SELECT
        c.id,
        c.creado_en::date AS creado_date,
        COALESCE(NULLIF(lower(c.captura_estado), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(c.origen), ''), 'otro') AS origen
    FROM public.contactos c
    WHERE (p_from IS NULL OR c.creado_en >= p_from)
      AND (p_to IS NULL OR c.creado_en <= p_to)
      AND (p_propietario IS NULL OR c.propietario_usuario_id = p_propietario)
      AND (p_origen IS NULL OR lower(c.origen) = lower(p_origen))
      AND public.puede_ver_contacto(c.id)
),
agg_new AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS nuevos
    FROM base
    WHERE creado_date IS NOT NULL
    GROUP BY creado_date
),
agg_completos AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS completos
    FROM base
    WHERE captura_estado = 'completo' AND creado_date IS NOT NULL
    GROUP BY creado_date
),
agg_webchat AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS webchat
    FROM base
    WHERE origen = 'webchat' AND creado_date IS NOT NULL
    GROUP BY creado_date
)
SELECT
    s.bucket_date,
    COALESCE(agg_new.nuevos, 0) AS nuevos,
    COALESCE(agg_completos.completos, 0) AS completos,
    COALESCE(agg_webchat.webchat, 0) AS webchat
FROM series s
LEFT JOIN agg_new ON agg_new.bucket_date = s.bucket_date
LEFT JOIN agg_completos ON agg_completos.bucket_date = s.bucket_date
LEFT JOIN agg_webchat ON agg_webchat.bucket_date = s.bucket_date
ORDER BY s.bucket_date;
$function$;

CREATE OR REPLACE FUNCTION public.panel_contactos_list(
    p_estado text DEFAULT NULL,
    p_captura text DEFAULT NULL,
    p_origen text DEFAULT NULL,
    p_propietario uuid DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_order_by text DEFAULT 'creado_en',
    p_order_dir text DEFAULT 'desc',
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
) RETURNS TABLE(
    contacto_id uuid,
    nombre text,
    correo text,
    telefono text,
    estado text,
    captura_estado text,
    origen text,
    creado_en timestamptz,
    actualizado_en timestamptz,
    company_name text,
    propietario_id uuid,
    propietario_nombre text,
    ultimo_contacto_en timestamptz,
    conversaciones integer,
    notas text,
    metadata jsonb,
    total_rows bigint
)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
WITH base AS (
    SELECT
        c.id AS contacto_id,
        COALESCE(NULLIF(c.nombre_completo, ''), 'Sin nombre') AS nombre,
        NULLIF(c.correo, '') AS correo,
        NULLIF(c.telefono_e164, '') AS telefono,
        COALESCE(NULLIF(c.estado, ''), 'desconocido') AS estado,
        COALESCE(NULLIF(c.captura_estado, ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(c.origen, ''), 'otro') AS origen,
        c.creado_en,
        NULLIF(c.company_name, '') AS company_name,
        c.propietario_usuario_id AS propietario_id,
        owner.nombre_completo AS propietario_nombre,
        c.notes,
        c.contacto_datos AS metadata
    FROM public.contactos c
    LEFT JOIN public.usuarios owner ON owner.id = c.propietario_usuario_id
    WHERE (p_estado IS NULL OR lower(c.estado) = lower(p_estado))
      AND (p_captura IS NULL OR lower(c.captura_estado) = lower(p_captura))
      AND (p_origen IS NULL OR lower(c.origen) = lower(p_origen))
      AND (p_propietario IS NULL OR c.propietario_usuario_id = p_propietario)
      AND (p_from IS NULL OR c.creado_en >= p_from)
      AND (p_to IS NULL OR c.creado_en <= p_to)
      AND (
        p_search IS NULL OR p_search = '' OR
        c.nombre_completo ILIKE '%' || p_search || '%' OR
        c.correo ILIKE '%' || p_search || '%' OR
        c.telefono_e164 ILIKE '%' || p_search || '%' OR
        c.company_name ILIKE '%' || p_search || '%' OR
        c.notes ILIKE '%' || p_search || '%'
      )
      AND public.puede_ver_contacto(c.id)
),
conversation_stats AS (
    SELECT
        conv.contacto_id,
        COUNT(*) AS conversaciones,
        MAX(conv.ultimo_mensaje_en) AS ultimo_contacto_en
    FROM public.conversaciones conv
    WHERE conv.contacto_id IS NOT NULL
    GROUP BY conv.contacto_id
),
annotated AS (
    SELECT
        b.*,
        COALESCE(cs.ultimo_contacto_en, b.creado_en) AS actualizado_en,
        cs.conversaciones,
        cs.ultimo_contacto_en,
        COUNT(*) OVER () AS total_rows
    FROM base b
    LEFT JOIN conversation_stats cs ON cs.contacto_id = b.contacto_id
),
ordered AS (
    SELECT *
    FROM annotated
    ORDER BY
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) = 'asc' THEN actualizado_en END ASC,
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) <> 'asc' THEN actualizado_en END DESC,
        CASE WHEN lower(p_order_by) = 'ultimo_contacto_en' AND lower(p_order_dir) = 'asc' THEN ultimo_contacto_en END ASC,
        CASE WHEN lower(p_order_by) = 'ultimo_contacto_en' AND lower(p_order_dir) <> 'asc' THEN ultimo_contacto_en END DESC,
        CASE WHEN lower(p_order_by) = 'nombre' AND lower(p_order_dir) = 'asc' THEN nombre END ASC,
        CASE WHEN lower(p_order_by) = 'nombre' AND lower(p_order_dir) <> 'asc' THEN nombre END DESC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) = 'asc' THEN creado_en END ASC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) <> 'asc' THEN creado_en END DESC,
        creado_en DESC,
        contacto_id
)
SELECT
    contacto_id,
    nombre,
    correo,
    telefono,
    estado,
    captura_estado,
    origen,
    creado_en,
    actualizado_en,
    company_name,
    propietario_id,
    propietario_nombre,
    ultimo_contacto_en,
    COALESCE(conversaciones, 0) AS conversaciones,
    notes,
    metadata,
    total_rows
FROM ordered
LIMIT COALESCE(NULLIF(p_limit, 0), 100)
OFFSET GREATEST(p_offset, 0);
$function$;

GRANT EXECUTE ON FUNCTION public.puede_ver_contacto(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.panel_contactos_resumen(timestamptz, timestamptz, uuid, text)
    TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.panel_contactos_timeline(timestamptz, timestamptz, uuid, text)
    TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.panel_contactos_list(
    text,
    text,
    text,
    uuid,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    integer,
    integer
) TO authenticated, service_role;

COMMIT;
