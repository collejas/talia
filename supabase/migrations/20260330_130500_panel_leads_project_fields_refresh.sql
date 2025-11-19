BEGIN;

-- ============================================================================
-- Ensure panel_leads_list / panel_lead_update / panel_lead_move expose the
-- new project + necesidad fields with a consistent structure.
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
    categoria public.lead_categoria,
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
        NULLIF(ct.company_name, '') AS contacto_empresa,
        NULLIF(ct.notes, '') AS contacto_notas,
        NULLIF(ct.necesidad_proposito, '') AS contacto_necesidad,
        COALESCE(NULLIF(ct.estado, ''), NULLIF(ct.captura_estado, '')) AS contacto_estado,
        COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, '')) AS canal,
        le.id AS etapa_id,
        le.nombre AS etapa_nombre,
        le.codigo AS etapa_codigo,
        le.metadatos AS etapa_metadatos,
        le.orden AS etapa_orden,
        le.categoria,
        lt.creado_en,
        lt.actualizado_en,
        lt.cerrado_en,
        lt.monto_estimado,
        lt.moneda,
        COALESCE(lt.probabilidad_override, le.probabilidad) AS probabilidad,
        lt.proyecto_nombre,
        lt.proyecto_necesidades,
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
$function$;

GRANT EXECUTE ON FUNCTION public.panel_leads_list(
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
) TO postgres, service_role, authenticated;

DROP FUNCTION IF EXISTS public.panel_lead_update(
    uuid,
    jsonb,
    jsonb,
    boolean
) CASCADE;

CREATE FUNCTION public.panel_lead_update(
    p_tarjeta_id uuid,
    p_contacto jsonb DEFAULT '{}'::jsonb,
    p_tarjeta jsonb DEFAULT '{}'::jsonb,
    p_merge_metadata boolean DEFAULT true
) RETURNS TABLE(
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
    categoria public.lead_categoria,
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
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_lead public.lead_tarjetas%ROWTYPE;
    v_contact public.contactos%ROWTYPE;
    v_contact_updates jsonb := COALESCE(p_contacto, '{}'::jsonb);
    v_card_updates jsonb := COALESCE(p_tarjeta, '{}'::jsonb);
    v_merge boolean := COALESCE(p_merge_metadata, TRUE);
    v_now timestamptz := now();
BEGIN
    SELECT lt.*
    INTO v_lead
    FROM public.lead_tarjetas lt
    WHERE lt.id = p_tarjeta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.puede_ver_lead(v_lead.id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_contact
    FROM public.contactos
    WHERE id = v_lead.contacto_id
    FOR UPDATE;

    IF jsonb_typeof(v_contact_updates) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'invalid_contact_payload' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_card_updates) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'invalid_lead_payload' USING ERRCODE = '22023';
    END IF;

    IF v_contact_updates <> '{}'::jsonb THEN
        UPDATE public.contactos c
        SET
            nombre_completo = CASE
                WHEN v_contact_updates ? 'nombre_completo' THEN
                    CASE jsonb_typeof(v_contact_updates->'nombre_completo')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(btrim(v_contact_updates->>'nombre_completo'), '')
                    END
                ELSE c.nombre_completo
            END,
            correo = CASE
                WHEN v_contact_updates ? 'correo' THEN
                    CASE jsonb_typeof(v_contact_updates->'correo')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(btrim(lower(v_contact_updates->>'correo')), '')
                    END
                ELSE c.correo
            END,
            telefono_e164 = CASE
                WHEN v_contact_updates ? 'telefono_e164' THEN
                    CASE jsonb_typeof(v_contact_updates->'telefono_e164')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(btrim(v_contact_updates->>'telefono_e164'), '')
                    END
                ELSE c.telefono_e164
            END,
            company_name = CASE
                WHEN v_contact_updates ? 'company_name' THEN
                    CASE jsonb_typeof(v_contact_updates->'company_name')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(btrim(v_contact_updates->>'company_name'), '')
                    END
                ELSE c.company_name
            END,
            notes = CASE
                WHEN v_contact_updates ? 'notes' THEN
                    CASE jsonb_typeof(v_contact_updates->'notes')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(v_contact_updates->>'notes', '')
                    END
                ELSE c.notes
            END,
            necesidad_proposito = CASE
                WHEN v_contact_updates ? 'necesidad_proposito' THEN
                    CASE jsonb_typeof(v_contact_updates->'necesidad_proposito')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(v_contact_updates->>'necesidad_proposito', '')
                    END
                ELSE c.necesidad_proposito
            END
        WHERE c.id = v_contact.id;
    END IF;

    IF v_card_updates <> '{}'::jsonb THEN
        UPDATE public.lead_tarjetas lt
        SET
            monto_estimado = CASE
                WHEN v_card_updates ? 'monto_estimado' THEN
                    CASE jsonb_typeof(v_card_updates->'monto_estimado')
                        WHEN 'null' THEN NULL
                        ELSE (v_card_updates->>'monto_estimado')::numeric
                    END
                ELSE lt.monto_estimado
            END,
            moneda = CASE
                WHEN v_card_updates ? 'moneda' THEN
                    CASE jsonb_typeof(v_card_updates->'moneda')
                        WHEN 'null' THEN lt.moneda
                        ELSE upper(NULLIF(btrim(v_card_updates->>'moneda'), ''))
                    END
                ELSE lt.moneda
            END,
            probabilidad_override = CASE
                WHEN v_card_updates ? 'probabilidad_override' THEN
                    CASE jsonb_typeof(v_card_updates->'probabilidad_override')
                        WHEN 'null' THEN NULL
                        ELSE (v_card_updates->>'probabilidad_override')::numeric
                    END
                ELSE lt.probabilidad_override
            END,
            proyecto_nombre = CASE
                WHEN v_card_updates ? 'proyecto_nombre' THEN
                    CASE jsonb_typeof(v_card_updates->'proyecto_nombre')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(v_card_updates->>'proyecto_nombre', '')
                    END
                ELSE lt.proyecto_nombre
            END,
            proyecto_necesidades = CASE
                WHEN v_card_updates ? 'proyecto_necesidades' THEN
                    CASE jsonb_typeof(v_card_updates->'proyecto_necesidades')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(v_card_updates->>'proyecto_necesidades', '')
                    END
                ELSE lt.proyecto_necesidades
            END,
            asignado_a_usuario_id = CASE
                WHEN v_card_updates ? 'asignado_id' THEN
                    CASE jsonb_typeof(v_card_updates->'asignado_id')
                        WHEN 'null' THEN NULL
                        ELSE (v_card_updates->>'asignado_id')::uuid
                    END
                ELSE lt.asignado_a_usuario_id
            END,
            propietario_usuario_id = CASE
                WHEN v_card_updates ? 'propietario_id' THEN
                    CASE jsonb_typeof(v_card_updates->'propietario_id')
                        WHEN 'null' THEN NULL
                        ELSE (v_card_updates->>'propietario_id')::uuid
                    END
                ELSE lt.propietario_usuario_id
            END,
            motivo_cierre = CASE
                WHEN v_card_updates ? 'motivo_cierre' THEN
                    CASE jsonb_typeof(v_card_updates->'motivo_cierre')
                        WHEN 'null' THEN NULL
                        ELSE NULLIF(v_card_updates->>'motivo_cierre', '')
                    END
                ELSE lt.motivo_cierre
            END,
            cerrado_en = CASE
                WHEN v_card_updates ? 'cerrado_en' THEN
                    CASE jsonb_typeof(v_card_updates->'cerrado_en')
                        WHEN 'null' THEN NULL
                        ELSE (v_card_updates->>'cerrado_en')::timestamptz
                    END
                ELSE lt.cerrado_en
            END,
            tags = CASE
                WHEN v_card_updates ? 'tags' THEN
                    CASE jsonb_typeof(v_card_updates->'tags')
                        WHEN 'null' THEN NULL
                        WHEN 'array' THEN ARRAY(
                            SELECT NULLIF(btrim(value), '')
                            FROM jsonb_array_elements_text(v_card_updates->'tags') AS value
                        )
                        ELSE lt.tags
                    END
                ELSE lt.tags
            END,
            metadata = CASE
                WHEN v_card_updates ? 'metadata' THEN
                    CASE
                        WHEN v_merge THEN COALESCE(lt.metadata, '{}'::jsonb) || COALESCE(v_card_updates->'metadata', '{}'::jsonb)
                        ELSE COALESCE(v_card_updates->'metadata', '{}'::jsonb)
                    END
                ELSE lt.metadata
            END,
            actualizado_en = v_now
        WHERE lt.id = p_tarjeta_id
        RETURNING * INTO v_lead;
    ELSE
        UPDATE public.lead_tarjetas
        SET actualizado_en = v_now
        WHERE id = p_tarjeta_id;
    END IF;

    RETURN QUERY
    SELECT
        ls.tarjeta_id,
        ls.contacto_id,
        ls.contacto_nombre,
        ls.contacto_correo,
        ls.contacto_telefono,
        ls.contacto_empresa,
        ls.contacto_notas,
        ls.contacto_necesidad,
        ls.contacto_estado,
        ls.canal,
        ls.etapa_id,
        ls.etapa_nombre,
        ls.etapa_codigo,
        ls.etapa_metadatos,
        ls.etapa_orden,
        ls.categoria,
        ls.creado_en,
        ls.actualizado_en,
        ls.cerrado_en,
        ls.monto_estimado,
        ls.moneda,
        ls.probabilidad,
        ls.proyecto_nombre,
        ls.proyecto_necesidades,
        ls.lead_score,
        ls.asignado_id,
        ls.asignado_nombre,
        ls.propietario_id,
        ls.propietario_nombre,
        ls.conversacion_id,
        ls.ultimo_mensaje_en,
        ls.motivo_cierre,
        ls.tags,
        ls.metadata,
        ls.total_rows
    FROM public.panel_leads_list(
        p_tablero => v_lead.tablero_id,
        p_etapa => NULL,
        p_categoria => NULL,
        p_asignado => NULL,
        p_from => NULL,
        p_to => NULL,
        p_search => NULL,
        p_order_by => 'actualizado_en',
        p_order_dir => 'desc',
        p_limit => 1,
        p_offset => 0
    ) AS ls
    WHERE ls.tarjeta_id = p_tarjeta_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_update(
    uuid,
    jsonb,
    jsonb,
    boolean
) TO postgres, service_role, authenticated;

DROP FUNCTION IF EXISTS public.panel_lead_move(
    uuid,
    uuid,
    uuid,
    text,
    text,
    jsonb,
    uuid
) CASCADE;

CREATE FUNCTION public.panel_lead_move(
    p_tarjeta_id uuid,
    p_etapa_destino uuid,
    p_cambiado_por uuid DEFAULT NULL,
    p_fuente text DEFAULT 'humano',
    p_motivo text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_expected_etapa uuid DEFAULT NULL
) RETURNS TABLE(
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
    categoria public.lead_categoria,
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
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_lead public.lead_tarjetas%ROWTYPE;
    v_dest public.lead_etapas%ROWTYPE;
    v_origin public.lead_etapas%ROWTYPE;
    v_user uuid;
    v_now timestamptz := now();
    v_new_motivo text;
    v_new_cerrado timestamptz;
    v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
    IF p_fuente NOT IN ('humano', 'asistente', 'api') THEN
        RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
    END IF;

    SELECT lt.*
    INTO v_lead
    FROM public.lead_tarjetas lt
    WHERE lt.id = p_tarjeta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.puede_ver_lead(v_lead.id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    IF p_expected_etapa IS NOT NULL AND v_lead.etapa_id <> p_expected_etapa THEN
        RAISE EXCEPTION 'concurrency_conflict' USING ERRCODE = '40001';
    END IF;

    SELECT *
    INTO v_dest
    FROM public.lead_etapas
    WHERE id = p_etapa_destino;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'dest_stage_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.etapa_id = v_dest.id THEN
        RETURN QUERY
        SELECT
            ls.tarjeta_id,
            ls.contacto_id,
            ls.contacto_nombre,
            ls.contacto_correo,
            ls.contacto_telefono,
            ls.contacto_empresa,
            ls.contacto_notas,
            ls.contacto_necesidad,
            ls.contacto_estado,
            ls.canal,
            ls.etapa_id,
            ls.etapa_nombre,
            ls.etapa_codigo,
            ls.etapa_metadatos,
            ls.etapa_orden,
            ls.categoria,
            ls.creado_en,
            ls.actualizado_en,
            ls.cerrado_en,
            ls.monto_estimado,
            ls.moneda,
            ls.probabilidad,
            ls.proyecto_nombre,
            ls.proyecto_necesidades,
            ls.lead_score,
            ls.asignado_id,
            ls.asignado_nombre,
            ls.propietario_id,
            ls.propietario_nombre,
            ls.conversacion_id,
            ls.ultimo_mensaje_en,
            ls.motivo_cierre,
            ls.tags,
            ls.metadata,
            ls.total_rows
        FROM public.panel_leads_list(
            p_tablero => v_lead.tablero_id,
            p_etapa => NULL,
            p_categoria => NULL,
            p_asignado => NULL,
            p_from => NULL,
            p_to => NULL,
            p_search => NULL,
            p_order_by => 'actualizado_en',
            p_order_dir => 'desc',
            p_limit => 1,
            p_offset => 0
        ) AS ls
        WHERE ls.tarjeta_id = p_tarjeta_id;
        RETURN;
    END IF;

    SELECT *
    INTO v_origin
    FROM public.lead_etapas
    WHERE id = v_lead.etapa_id;

    v_user := COALESCE(auth.uid(), p_cambiado_por, v_lead.asignado_a_usuario_id, v_lead.propietario_usuario_id);

    IF v_dest.categoria = 'ganada' THEN
        v_new_cerrado := COALESCE(v_lead.cerrado_en, v_now);
        v_new_motivo := COALESCE(NULLIF(p_motivo, ''), v_lead.motivo_cierre);
    ELSIF v_dest.categoria = 'perdida' THEN
        v_new_cerrado := COALESCE(v_lead.cerrado_en, v_now);
        v_new_motivo := COALESCE(NULLIF(p_motivo, ''), v_lead.motivo_cierre);
    ELSE
        v_new_cerrado := NULL;
        v_new_motivo := NULLIF(p_motivo, '');
    END IF;

    UPDATE public.lead_tarjetas
    SET
        etapa_id = v_dest.id,
        actualizado_en = v_now,
        cerrado_en = v_new_cerrado,
        motivo_cierre = v_new_motivo
    WHERE id = p_tarjeta_id
    RETURNING * INTO v_lead;

    INSERT INTO public.lead_movimientos (
        tarjeta_id,
        etapa_origen_id,
        etapa_destino_id,
        cambiado_por,
        cambiado_en,
        motivo,
        fuente,
        metadata
    )
    VALUES (
        p_tarjeta_id,
        v_origin.id,
        v_dest.id,
        v_user,
        v_now,
        NULLIF(p_motivo, ''),
        p_fuente,
        v_metadata
    );

    RETURN QUERY
    SELECT
        ls.tarjeta_id,
        ls.contacto_id,
        ls.contacto_nombre,
        ls.contacto_correo,
        ls.contacto_telefono,
        ls.contacto_empresa,
        ls.contacto_notas,
        ls.contacto_necesidad,
        ls.contacto_estado,
        ls.canal,
        ls.etapa_id,
        ls.etapa_nombre,
        ls.etapa_codigo,
        ls.etapa_metadatos,
        ls.etapa_orden,
        ls.categoria,
        ls.creado_en,
        ls.actualizado_en,
        ls.cerrado_en,
        ls.monto_estimado,
        ls.moneda,
        ls.probabilidad,
        ls.proyecto_nombre,
        ls.proyecto_necesidades,
        ls.lead_score,
        ls.asignado_id,
        ls.asignado_nombre,
        ls.propietario_id,
        ls.propietario_nombre,
        ls.conversacion_id,
        ls.ultimo_mensaje_en,
        ls.motivo_cierre,
        ls.tags,
        ls.metadata,
        ls.total_rows
    FROM public.panel_leads_list(
        p_tablero => v_lead.tablero_id,
        p_etapa => NULL,
        p_categoria => NULL,
        p_asignado => NULL,
        p_from => NULL,
        p_to => NULL,
        p_search => NULL,
        p_order_by => 'actualizado_en',
        p_order_dir => 'desc',
        p_limit => 1,
        p_offset => 0
    ) AS ls
    WHERE ls.tarjeta_id = p_tarjeta_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.panel_lead_move(
    uuid,
    uuid,
    uuid,
    text,
    text,
    jsonb,
    uuid
) TO postgres, service_role, authenticated;

COMMIT;
