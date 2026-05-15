BEGIN;

-- ============================================================================
-- Sincronizacion legacy -> nuevo modelo
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_sync_contactos_to_personas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_persona_id uuid;
    v_nombre text;
    v_correo text;
    v_telefono text;
    v_estado text;
    v_origen text;
    v_notas text;
    v_legacy_tipo text;
    v_metadata jsonb;
    v_role text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT p.id
        INTO v_persona_id
        FROM public.personas p
        WHERE p.metadata->>'legacy_contacto_id' = OLD.id::text
        LIMIT 1;

        IF v_persona_id IS NOT NULL THEN
            DELETE FROM public.cuenta_personas
            WHERE persona_id = v_persona_id;

            DELETE FROM public.personas
            WHERE id = v_persona_id;
        END IF;

        RETURN OLD;
    END IF;

    IF COALESCE(NEW.contacto_datos->>'legacy_shadow', '') = 'true' THEN
        RETURN NEW;
    END IF;

    v_nombre := btrim(COALESCE(
        NULLIF(NEW.nombre_completo, ''),
        NULLIF(concat_ws(' ', NEW.nombre_nombres, NEW.apellido_paterno, NEW.apellido_materno), ''),
        NULLIF(NEW.company_name, ''),
        NULLIF(NEW.razon_social, ''),
        'Contacto'
    ));

    v_correo := COALESCE(NULLIF(lower(btrim(NEW.correo)), ''), NULLIF(lower(btrim(NEW.email)), ''));
    v_telefono := COALESCE(NULLIF(btrim(NEW.telefono_e164), ''), NULLIF(btrim(NEW.telefono), ''));
    v_estado := CASE
        WHEN lower(COALESCE(NEW.estado, '')) IN ('lead', 'activo', 'inactivo', 'bloqueado')
            THEN lower(NEW.estado)
        ELSE 'lead'
    END;
    v_origen := NULLIF(btrim(NEW.origen), '');
    v_notas := NULLIF(btrim(concat_ws(' | ', NEW.notas, NEW.notes, NEW.necesidad_proposito)), '');
    v_legacy_tipo := CASE
        WHEN lower(COALESCE(NEW.persona_fisica_moral, '')) = 'fisica' THEN 'persona_fisica'
        WHEN COALESCE(
            NULLIF(btrim(NEW.company_name), ''),
            NULLIF(btrim(NEW.razon_social), ''),
            NULLIF(btrim(NEW.rfc), ''),
            NULLIF(btrim(NEW.email_facturacion), ''),
            NULLIF(btrim(NEW.website), '')
        ) IS NOT NULL THEN 'empresa'
        ELSE 'persona'
    END;

    v_metadata := jsonb_strip_nulls(
        jsonb_build_object(
            'legacy_contacto_id', NEW.id::text,
            'legacy_contacto_codigo', NEW.codigo_contacto,
            'legacy_contacto_tipo', v_legacy_tipo,
            'legacy_persona_fisica_moral', NEW.persona_fisica_moral,
            'legacy_company_name', NEW.company_name,
            'legacy_razon_social', NEW.razon_social,
            'legacy_rfc', NEW.rfc,
            'legacy_uso_cfdi', NEW.uso_cfdi,
            'legacy_metodo_pago', NEW.metodo_pago,
            'legacy_forma_pago', NEW.forma_pago,
            'legacy_email_facturacion', NEW.email_facturacion,
            'legacy_tipo_industria', NEW.tipo_industria,
            'legacy_tamano', NEW.tamano,
            'legacy_codigo_cuenta', (SELECT codigo_cuenta FROM public.cuentas WHERE id = NEW.cuenta_id LIMIT 1),
            'legacy_cuenta_id', NEW.cuenta_id::text,
            'legacy_contacto_datos', NEW.contacto_datos,
            'legacy_necesidad_proposito', NEW.necesidad_proposito,
            'legacy_captura_estado', NEW.captura_estado,
            'legacy_direccion', jsonb_strip_nulls(jsonb_build_object(
                'tipo_vialidad', NEW.tipo_vialidad,
                'nombre_vialidad', NEW.nombre_vialidad,
                'numero_exterior', NEW.numero_exterior,
                'letra_exterior', NEW.letra_exterior,
                'edificio', NEW.edificio,
                'edificio_piso', NEW.edificio_piso,
                'numero_interior', NEW.numero_interior,
                'letra_interior', NEW.letra_interior,
                'tipo_asentamiento', NEW.tipo_asentamiento,
                'nombre_asentamiento', NEW.nombre_asentamiento,
                'tipo_centro_comercial', NEW.tipo_centro_comercial,
                'corredor_industrial', NEW.corredor_industrial,
                'numero_local', NEW.numero_local,
                'codigo_postal', NEW.codigo_postal,
                'clave_entidad', NEW.clave_entidad,
                'entidad', NEW.entidad,
                'clave_municipio', NEW.clave_municipio,
                'municipio', NEW.municipio,
                'clave_localidad', NEW.clave_localidad,
                'localidad', NEW.localidad,
                'pais', NEW.pais,
                'latitud', NEW.latitud,
                'longitud', NEW.longitud
            ))
        )
    );

    SELECT p.id
    INTO v_persona_id
    FROM public.personas p
    WHERE p.metadata->>'legacy_contacto_id' = NEW.id::text
    LIMIT 1;

    IF v_persona_id IS NULL THEN
        INSERT INTO public.personas (
            id,
            organizacion_id,
            nombre,
            apellido_paterno,
            apellido_materno,
            nombre_completo,
            correo_principal,
            telefono_principal_e164,
            puesto,
            area,
            rol_decision,
            estado,
            origen,
            notas,
            metadata,
            propietario_usuario_id,
            creado_en,
            actualizado_en
        ) VALUES (
            gen_random_uuid(),
            NEW.organizacion_id,
            v_nombre,
            NULLIF(btrim(NEW.apellido_paterno), ''),
            NULLIF(btrim(NEW.apellido_materno), ''),
            v_nombre,
            v_correo,
            v_telefono,
            NULLIF(btrim(NEW.puesto), ''),
            NULLIF(btrim(NEW.area), ''),
            NULLIF(btrim(NEW.rol_decision), ''),
            v_estado,
            v_origen,
            v_notas,
            v_metadata,
            NEW.propietario_usuario_id,
            COALESCE(NEW.fecha_incorporacion, NEW.creado_en, now()),
            now()
        )
        RETURNING id INTO v_persona_id;
    ELSE
        UPDATE public.personas
        SET
            nombre = v_nombre,
            apellido_paterno = NULLIF(btrim(NEW.apellido_paterno), ''),
            apellido_materno = NULLIF(btrim(NEW.apellido_materno), ''),
            nombre_completo = v_nombre,
            correo_principal = v_correo,
            telefono_principal_e164 = v_telefono,
            puesto = NULLIF(btrim(NEW.puesto), ''),
            area = NULLIF(btrim(NEW.area), ''),
            rol_decision = NULLIF(btrim(NEW.rol_decision), ''),
            estado = v_estado,
            origen = v_origen,
            notas = v_notas,
            metadata = v_metadata,
            propietario_usuario_id = NEW.propietario_usuario_id,
            actualizado_en = now()
        WHERE id = v_persona_id;
    END IF;

    IF NEW.cuenta_id IS NOT NULL THEN
        v_role := CASE
            WHEN lower(COALESCE(NEW.persona_fisica_moral, '')) = 'fisica' THEN 'dueno'
            ELSE 'contacto_principal'
        END;

        INSERT INTO public.cuenta_personas (
            id,
            organizacion_id,
            cuenta_id,
            persona_id,
            rol_en_cuenta,
            puesto,
            es_contacto_principal,
            es_contacto_facturacion,
            es_representante_legal,
            activo,
            fecha_inicio,
            notas,
            metadata,
            creado_en,
            actualizado_en
        ) VALUES (
            gen_random_uuid(),
            NEW.organizacion_id,
            NEW.cuenta_id,
            v_persona_id,
            v_role,
            NULLIF(btrim(NEW.puesto), ''),
            true,
            false,
            lower(COALESCE(NEW.persona_fisica_moral, '')) = 'fisica',
            true,
            COALESCE(NEW.fecha_incorporacion::date, NEW.creado_en::date, current_date),
            v_notas,
            jsonb_strip_nulls(jsonb_build_object(
                'legacy_contacto_id', NEW.id::text,
                'legacy_contacto_codigo', NEW.codigo_contacto
            )),
            now(),
            now()
        )
        ON CONFLICT (cuenta_id, persona_id, rol_en_cuenta)
        DO UPDATE SET
            puesto = EXCLUDED.puesto,
            es_contacto_principal = EXCLUDED.es_contacto_principal,
            es_contacto_facturacion = EXCLUDED.es_contacto_facturacion,
            es_representante_legal = EXCLUDED.es_representante_legal,
            activo = EXCLUDED.activo,
            fecha_inicio = COALESCE(public.cuenta_personas.fecha_inicio, EXCLUDED.fecha_inicio),
            notas = EXCLUDED.notas,
            metadata = EXCLUDED.metadata,
            actualizado_en = now();
    ELSE
        DELETE FROM public.cuenta_personas
        WHERE persona_id = v_persona_id
          AND metadata->>'legacy_contacto_id' = NEW.id::text;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contactos_sync_nuevo_modelo ON public.contactos;
CREATE TRIGGER contactos_sync_nuevo_modelo
    AFTER INSERT OR UPDATE OR DELETE ON public.contactos
    FOR EACH ROW EXECUTE FUNCTION public.tg_sync_contactos_to_personas();

COMMENT ON FUNCTION public.tg_sync_contactos_to_personas() IS
    'Sincroniza el legacy contactos con personas y cuenta_personas durante la transición.';

-- ============================================================================
-- Helper de acceso a la nueva lectura
-- ============================================================================

CREATE OR REPLACE FUNCTION public._contacto_legacy_uuid(p_metadata jsonb, p_fallback uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_metadata->>'legacy_contacto_id', '') ~* '^[0-9a-f-]{36}$'
            THEN (p_metadata->>'legacy_contacto_id')::uuid
        ELSE p_fallback
    END;
$$;

-- ============================================================================
-- Panel de contactos sobre el nuevo modelo
-- ============================================================================

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
        public.es_admin(auth.uid())
        OR p.organizacion_id = public.usuario_organizacion_id(auth.uid())
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
base AS (
    SELECT
        p.creado_en::date AS creado_date,
        COALESCE(NULLIF(lower(p.metadata->>'legacy_captura_estado'), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(p.origen), ''), 'otro') AS origen
    FROM public.personas p
    WHERE (p_from IS NULL OR p.creado_en >= p_from)
      AND (p_to IS NULL OR p.creado_en <= p_to)
      AND (p_propietario IS NULL OR p.propietario_usuario_id = p_propietario)
      AND (p_origen IS NULL OR lower(p.origen) = lower(p_origen))
      AND (
        public.es_admin(auth.uid())
        OR p.organizacion_id = public.usuario_organizacion_id(auth.uid())
      )
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
$$;

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
    codigo_contacto text,
    codigo_cuenta text,
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
        relation.cuenta_id,
        account.codigo_cuenta,
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
        account.tipo_industria,
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
      AND (p_captura IS NULL OR lower(COALESCE(p.metadata->>'legacy_captura_estado', 'incompleto')) = lower(p_captura))
      AND (p_origen IS NULL OR lower(p.origen) = lower(p_origen))
      AND (p_propietario IS NULL OR p.propietario_usuario_id = p_propietario)
      AND (p_from IS NULL OR p.creado_en >= p_from)
      AND (p_to IS NULL OR p.creado_en <= p_to)
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
    total_rows
FROM ordered
LIMIT COALESCE(NULLIF(p_limit, 0), 100)
OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.tg_sync_contactos_to_personas() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._contacto_legacy_uuid(jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.panel_contactos_resumen(timestamptz, timestamptz, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.panel_contactos_timeline(timestamptz, timestamptz, uuid, text) TO authenticated, service_role;
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
