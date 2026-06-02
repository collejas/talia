CREATE OR REPLACE FUNCTION public.panel_contactos_resumen(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_propietario uuid DEFAULT NULL,
    p_origen text DEFAULT NULL,
    p_puesto text DEFAULT NULL,
    p_rol_decision text DEFAULT NULL,
    p_estado_contacto text DEFAULT NULL,
    p_ligado text DEFAULT NULL,
    p_tipo_cuenta text DEFAULT NULL,
    p_tamano text DEFAULT NULL,
    p_clasificacion text DEFAULT NULL,
    p_cuenta_from timestamptz DEFAULT NULL,
    p_cuenta_to timestamptz DEFAULT NULL,
    p_fecha_incorporacion_from timestamptz DEFAULT NULL,
    p_fecha_incorporacion_to timestamptz DEFAULT NULL,
    p_fusionada text DEFAULT NULL,
    p_pais text DEFAULT NULL,
    p_estado_direccion text DEFAULT NULL,
    p_municipio text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH person_accounts AS (
    SELECT
        p.id AS persona_id,
        p.estado,
        COALESCE(NULLIF(lower(p.metadata->>'legacy_captura_estado'), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(p.origen), ''), 'otro') AS origen,
        p.propietario_usuario_id,
        p.creado_en,
        p.puesto,
        p.rol_decision,
        p.tipo_industria AS persona_tipo_industria,
        p.tamano AS persona_tamano,
        p.fecha_incorporacion AS persona_fecha_incorporacion,
        p.entidad AS persona_entidad,
        p.municipio AS persona_municipio,
        p.pais AS persona_pais,
        relation.cuenta_id,
        relation.activo AS relacion_activa,
        account.tipo AS cuenta_tipo,
        account.tamano AS cuenta_tamano,
        account.tipo_industria AS cuenta_tipo_industria,
        account.creado_en AS cuenta_creado_en,
        account.fecha_incorporacion AS cuenta_fecha_incorporacion,
        account.entidad AS cuenta_entidad,
        account.municipio AS cuenta_municipio,
        account.pais AS cuenta_pais,
        row_number() OVER (
            PARTITION BY p.id
            ORDER BY relation.es_contacto_principal DESC, relation.es_representante_legal DESC, relation.activo DESC, relation.creado_en ASC
        ) AS rn
    FROM public.personas p
    LEFT JOIN public.cuenta_personas relation
      ON relation.persona_id = p.id
     AND relation.organizacion_id = p.organizacion_id
    LEFT JOIN public.cuentas account
      ON account.id = relation.cuenta_id
     AND account.organizacion_id = p.organizacion_id
    WHERE (
        public.es_admin(auth.uid())
        OR p.organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
      AND (p_from IS NULL OR p.creado_en >= p_from)
      AND (p_to IS NULL OR p.creado_en <= p_to)
      AND (p_propietario IS NULL OR p.propietario_usuario_id = p_propietario)
      AND (p_origen IS NULL OR lower(p.origen) = lower(p_origen))
      AND (p_puesto IS NULL OR lower(COALESCE(p.puesto, '')) = lower(p_puesto))
      AND (p_rol_decision IS NULL OR lower(COALESCE(p.rol_decision, '')) = lower(p_rol_decision))
      AND (p_estado_contacto IS NULL OR lower(p.estado) = lower(p_estado_contacto))
      AND (
        p_ligado IS NULL OR p_ligado = '' OR
        (lower(p_ligado) IN ('si', 'sí', 'true', '1') AND relation.cuenta_id IS NOT NULL) OR
        (lower(p_ligado) IN ('no', 'false', '0') AND relation.cuenta_id IS NULL)
      )
      AND (p_tipo_cuenta IS NULL OR p_tipo_cuenta = '' OR lower(COALESCE(account.tipo, '')) = lower(p_tipo_cuenta))
      AND (p_tamano IS NULL OR p_tamano = '' OR lower(COALESCE(account.tamano, p.tamano, '')) = lower(p_tamano))
      AND (p_clasificacion IS NULL OR p_clasificacion = '' OR lower(COALESCE(account.tipo_industria, p.tipo_industria, '')) = lower(p_clasificacion))
      AND (p_cuenta_from IS NULL OR account.creado_en >= p_cuenta_from)
      AND (p_cuenta_to IS NULL OR account.creado_en <= p_cuenta_to)
      AND (
        p_fecha_incorporacion_from IS NULL
        OR COALESCE(account.fecha_incorporacion, p.fecha_incorporacion) >= p_fecha_incorporacion_from
      )
      AND (
        p_fecha_incorporacion_to IS NULL
        OR COALESCE(account.fecha_incorporacion, p.fecha_incorporacion) <= p_fecha_incorporacion_to
      )
      AND (
        p_fusionada IS NULL OR p_fusionada = '' OR
        (lower(p_fusionada) IN ('si', 'sí', 'true', '1') AND lower(COALESCE(p.estado, '')) IN ('fusionado', 'fusionada')) OR
        (lower(p_fusionada) IN ('no', 'false', '0') AND lower(COALESCE(p.estado, '')) NOT IN ('fusionado', 'fusionada'))
      )
      AND (p_pais IS NULL OR p_pais = '' OR lower(COALESCE(account.pais, p.pais, '')) = lower(p_pais))
      AND (
        p_estado_direccion IS NULL OR p_estado_direccion = '' OR
        lower(COALESCE(account.entidad, p.entidad, '')) = lower(p_estado_direccion)
      )
      AND (p_municipio IS NULL OR p_municipio = '' OR lower(COALESCE(account.municipio, p.municipio, '')) = lower(p_municipio))
),
base AS (
    SELECT *
    FROM person_accounts
    WHERE rn = 1
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

CREATE OR REPLACE FUNCTION public.panel_contactos_list(
    p_estado text DEFAULT NULL,
    p_captura text DEFAULT NULL,
    p_origen text DEFAULT NULL,
    p_propietario uuid DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_puesto text DEFAULT NULL,
    p_rol_decision text DEFAULT NULL,
    p_estado_contacto text DEFAULT NULL,
    p_ligado text DEFAULT NULL,
    p_tipo_cuenta text DEFAULT NULL,
    p_tamano text DEFAULT NULL,
    p_clasificacion text DEFAULT NULL,
    p_cuenta_from timestamptz DEFAULT NULL,
    p_cuenta_to timestamptz DEFAULT NULL,
    p_fecha_incorporacion_from timestamptz DEFAULT NULL,
    p_fecha_incorporacion_to timestamptz DEFAULT NULL,
    p_fusionada text DEFAULT NULL,
    p_pais text DEFAULT NULL,
    p_estado_direccion text DEFAULT NULL,
    p_municipio text DEFAULT NULL,
    p_order_by text DEFAULT 'creado_en',
    p_order_dir text DEFAULT 'desc',
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
) RETURNS TABLE(
    contacto_id uuid,
    codigo_contacto text,
    codigo_cuenta text,
    cuenta_id uuid,
    cuenta_tipo text,
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
    notes text,
    rfc text,
    puesto text,
    area text,
    rol_decision text,
    codigo_postal text,
    entidad text,
    municipio text,
    pais text,
    website text,
    tipo_establecimiento text,
    fecha_incorporacion timestamptz,
    cuenta_creado_en timestamptz,
    tipo_industria text,
    tamano text,
    relacion_activa boolean,
    total_rows bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH person_accounts AS (
    SELECT
        p.id AS persona_id,
        p.organizacion_id,
        p.nombre_completo,
        p.correo_principal,
        p.telefono_principal_e164,
        p.estado,
        COALESCE(NULLIF(lower(p.metadata->>'legacy_captura_estado'), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(p.origen), ''), 'otro') AS origen,
        p.creado_en,
        p.actualizado_en,
        p.propietario_usuario_id,
        owner.nombre_completo AS propietario_nombre,
        p.notas,
        p.puesto,
        p.area,
        p.rol_decision,
        p.metadata,
        relation.rol_en_cuenta,
        relation.es_contacto_principal,
        relation.es_representante_legal,
        relation.activo AS relacion_activa,
        relation.cuenta_id,
        account.codigo_cuenta,
        account.tipo AS cuenta_tipo,
        account.nombre AS account_nombre,
        account.razon_social,
        account.rfc,
        account.sitio_web,
        account.website,
        account.tipo_establecimiento,
        account.codigo_postal,
        account.entidad,
        account.municipio,
        account.pais,
        account.email_facturacion,
        account.necesidad_proposito,
        account.fecha_incorporacion,
        account.creado_en AS cuenta_creado_en,
        account.tipo_industria,
        account.tamano,
        row_number() OVER (
            PARTITION BY p.id
            ORDER BY relation.es_contacto_principal DESC, relation.es_representante_legal DESC, relation.activo DESC, relation.creado_en ASC
        ) AS rn
    FROM public.personas p
    LEFT JOIN public.usuarios owner ON owner.id = p.propietario_usuario_id
    LEFT JOIN public.cuenta_personas relation
      ON relation.persona_id = p.id
     AND relation.organizacion_id = p.organizacion_id
    LEFT JOIN public.cuentas account
      ON account.id = relation.cuenta_id
     AND account.organizacion_id = p.organizacion_id
    WHERE (
        public.es_admin(auth.uid())
        OR p.organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
      AND (p_estado IS NULL OR lower(p.estado) = lower(p_estado))
      AND (COALESCE(p_estado_contacto, p_estado) IS NULL OR lower(p.estado) = lower(COALESCE(p_estado_contacto, p_estado)))
      AND (p_captura IS NULL OR lower(COALESCE(p.metadata->>'legacy_captura_estado', 'incompleto')) = lower(p_captura))
      AND (p_origen IS NULL OR lower(p.origen) = lower(p_origen))
      AND (p_propietario IS NULL OR p.propietario_usuario_id = p_propietario)
      AND (p_from IS NULL OR p.creado_en >= p_from)
      AND (p_to IS NULL OR p.creado_en <= p_to)
      AND (p_puesto IS NULL OR p_puesto = '' OR lower(COALESCE(p.puesto, '')) = lower(p_puesto))
      AND (p_rol_decision IS NULL OR p_rol_decision = '' OR lower(COALESCE(p.rol_decision, '')) = lower(p_rol_decision))
      AND (
        p_ligado IS NULL OR p_ligado = '' OR
        (lower(p_ligado) IN ('si', 'sí', 'true', '1') AND relation.cuenta_id IS NOT NULL) OR
        (lower(p_ligado) IN ('no', 'false', '0') AND relation.cuenta_id IS NULL)
      )
      AND (p_tipo_cuenta IS NULL OR p_tipo_cuenta = '' OR lower(COALESCE(account.tipo, '')) = lower(p_tipo_cuenta))
      AND (p_tamano IS NULL OR p_tamano = '' OR lower(COALESCE(account.tamano, p.tamano, '')) = lower(p_tamano))
      AND (p_clasificacion IS NULL OR p_clasificacion = '' OR lower(COALESCE(account.tipo_industria, p.tipo_industria, '')) = lower(p_clasificacion))
      AND (p_cuenta_from IS NULL OR account.creado_en >= p_cuenta_from)
      AND (p_cuenta_to IS NULL OR account.creado_en <= p_cuenta_to)
      AND (
        p_fecha_incorporacion_from IS NULL
        OR COALESCE(account.fecha_incorporacion, p.fecha_incorporacion) >= p_fecha_incorporacion_from
      )
      AND (
        p_fecha_incorporacion_to IS NULL
        OR COALESCE(account.fecha_incorporacion, p.fecha_incorporacion) <= p_fecha_incorporacion_to
      )
      AND (
        p_fusionada IS NULL OR p_fusionada = '' OR
        (lower(p_fusionada) IN ('si', 'sí', 'true', '1') AND lower(COALESCE(p.estado, '')) IN ('fusionado', 'fusionada')) OR
        (lower(p_fusionada) IN ('no', 'false', '0') AND lower(COALESCE(p.estado, '')) NOT IN ('fusionado', 'fusionada'))
      )
      AND (p_pais IS NULL OR p_pais = '' OR lower(COALESCE(account.pais, p.pais, '')) = lower(p_pais))
      AND (p_estado_direccion IS NULL OR p_estado_direccion = '' OR lower(COALESCE(account.entidad, p.entidad, '')) = lower(p_estado_direccion))
      AND (p_municipio IS NULL OR p_municipio = '' OR lower(COALESCE(account.municipio, p.municipio, '')) = lower(p_municipio))
      AND (
        p_search IS NULL OR p_search = '' OR
        p.nombre_completo ILIKE '%' || p_search || '%' OR
        p.correo_principal ILIKE '%' || p_search || '%' OR
        p.telefono_principal_e164 ILIKE '%' || p_search || '%' OR
        p.notas ILIKE '%' || p_search || '%' OR
        COALESCE(account.nombre, account.razon_social, '') ILIKE '%' || p_search || '%' OR
        COALESCE(account.rfc, '') ILIKE '%' || p_search || '%' OR
        COALESCE(p.metadata->>'legacy_contacto_codigo', '') ILIKE '%' || p_search || '%'
      )
),
primary_rows AS (
    SELECT * FROM person_accounts WHERE rn = 1
),
conversation_stats AS (
    SELECT
        conv.contacto_id,
        COUNT(*) AS conversaciones,
        MAX(conv.ultimo_mensaje_en) AS ultimo_contacto_en
    FROM public.conversaciones conv
    GROUP BY conv.contacto_id
),
annotated AS (
    SELECT
        pr.*,
        COALESCE(cs.ultimo_contacto_en, pr.creado_en) AS display_actualizado_en,
        cs.conversaciones,
        cs.ultimo_contacto_en,
        COUNT(*) OVER () AS total_rows,
        public._contacto_legacy_uuid(pr.metadata, pr.persona_id) AS legacy_contacto_id
    FROM primary_rows pr
    LEFT JOIN conversation_stats cs
      ON cs.contacto_id = public._contacto_legacy_uuid(pr.metadata, pr.persona_id)
),
ordered AS (
    SELECT *
    FROM annotated
    ORDER BY
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) = 'asc' THEN display_actualizado_en END ASC,
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) <> 'asc' THEN display_actualizado_en END DESC,
        CASE WHEN lower(p_order_by) = 'ultimo_contacto_en' AND lower(p_order_dir) = 'asc' THEN ultimo_contacto_en END ASC,
        CASE WHEN lower(p_order_by) = 'ultimo_contacto_en' AND lower(p_order_dir) <> 'asc' THEN ultimo_contacto_en END DESC,
        CASE WHEN lower(p_order_by) = 'nombre' AND lower(p_order_dir) = 'asc' THEN nombre_completo END ASC,
        CASE WHEN lower(p_order_by) = 'nombre' AND lower(p_order_dir) <> 'asc' THEN nombre_completo END DESC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) = 'asc' THEN creado_en END ASC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) <> 'asc' THEN creado_en END DESC,
        creado_en DESC,
        legacy_contacto_id
)
SELECT
    legacy_contacto_id AS contacto_id,
    NULLIF(metadata->>'legacy_contacto_codigo', '') AS codigo_contacto,
    codigo_cuenta,
    cuenta_id,
    cuenta_tipo,
    COALESCE(NULLIF(btrim(nombre_completo), ''), 'Sin nombre') AS nombre,
    NULLIF(correo_principal, '') AS correo,
    NULLIF(telefono_principal_e164, '') AS telefono,
    COALESCE(NULLIF(estado, ''), 'desconocido') AS estado,
    COALESCE(NULLIF(captura_estado, ''), 'incompleto') AS captura_estado,
    COALESCE(NULLIF(origen, ''), 'otro') AS origen,
    creado_en,
    display_actualizado_en AS actualizado_en,
    COALESCE(NULLIF(account_nombre, ''), NULLIF(razon_social, ''), NULLIF(metadata->>'legacy_company_name', '')) AS company_name,
    propietario_usuario_id AS propietario_id,
    propietario_nombre,
    ultimo_contacto_en,
    COALESCE(conversaciones, 0)::integer AS conversaciones,
    notas AS notes,
    COALESCE(NULLIF(rfc, ''), metadata->>'legacy_rfc') AS rfc,
    puesto,
    area,
    rol_decision,
    codigo_postal,
    entidad,
    municipio,
    pais,
    COALESCE(NULLIF(website, ''), NULLIF(sitio_web, ''), metadata->>'legacy_website') AS website,
    tipo_establecimiento,
    fecha_incorporacion,
    cuenta_creado_en,
    tipo_industria,
    tamano,
    relacion_activa,
    total_rows
FROM ordered
LIMIT COALESCE(NULLIF(p_limit, 0), 100)
OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.panel_contactos_resumen(
    timestamptz,
    timestamptz,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    timestamptz,
    timestamptz,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    text
) TO authenticated, service_role;

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
    text,
    text,
    text,
    text,
    timestamptz,
    timestamptz,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer
) TO authenticated, service_role;
