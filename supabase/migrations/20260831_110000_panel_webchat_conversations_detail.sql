BEGIN;

CREATE OR REPLACE FUNCTION public.panel_webchat_conversaciones_detalle(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_limit integer DEFAULT 500,
    p_offset integer DEFAULT 0
) RETURNS TABLE(
    id text,
    session_id text,
    persona_id text,
    contacto_id text,
    canal text,
    iniciada_en timestamptz,
    ultimo_mensaje_en timestamptz,
    ip text,
    device_type text,
    country_code text,
    country_name text,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text,
    referrer text,
    landing_url text,
    visit_count bigint,
    tuvo_chat boolean,
    mensajes_entrantes bigint,
    mensajes_salientes bigint,
    primer_mensaje_en timestamptz,
    ultimo_mensaje_conversacion timestamptz,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    contacto_origen text,
    contacto_estado text,
    contacto_captura text,
    contacto_creado_en timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH tenant AS (
    SELECT public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
conversation_rows AS (
    SELECT
        c.id,
        c.contacto_id,
        c.iniciada_en,
        c.ultimo_mensaje_en,
        c.contacto_id::text AS contacto_id_text,
        msg.session_id,
        msg.mensajes_entrantes,
        msg.mensajes_salientes,
        msg.primer_mensaje_en,
        msg.ultimo_mensaje_en AS ultimo_mensaje_conversacion,
        w.ip,
        w.device_type,
        w.geo,
        w.geo -> 'ip_lookup' ->> 'country' AS country_name,
        w.cve_ent,
        w.nom_ent,
        w.cve_mun,
        w.nom_mun,
        w.cvegeo,
        w.referrer,
        w.landing_url,
        COALESCE(w.visit_count, 1)::bigint AS visit_count
    FROM public.conversaciones c
    JOIN tenant t ON t.organizacion_id = c.organizacion_id
    LEFT JOIN LATERAL (
        SELECT
            MAX(NULLIF(m.datos ->> 'session_id', '')) AS session_id,
            COUNT(*) FILTER (WHERE m.direccion = 'entrante')::bigint AS mensajes_entrantes,
            COUNT(*) FILTER (WHERE m.direccion = 'saliente')::bigint AS mensajes_salientes,
            MIN(m.creado_en) AS primer_mensaje_en,
            MAX(m.creado_en) AS ultimo_mensaje_en
        FROM public.mensajes m
        WHERE m.organizacion_id = c.organizacion_id
          AND m.conversacion_id = c.id
    ) msg ON TRUE
    LEFT JOIN public.webchat_visitantes w
      ON w.organizacion_id = c.organizacion_id
     AND w.session_id = msg.session_id
    WHERE lower(COALESCE(c.canal, '')) = 'webchat'
      AND (p_from IS NULL OR COALESCE(c.iniciada_en, c.ultimo_mensaje_en) >= p_from)
      AND (p_to IS NULL OR COALESCE(c.iniciada_en, c.ultimo_mensaje_en) < p_to)
    ORDER BY COALESCE(c.iniciada_en, c.ultimo_mensaje_en) DESC, c.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000))
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
)
SELECT
    r.id::text,
    r.session_id,
    c.id::text AS persona_id,
    r.contacto_id_text AS contacto_id,
    'webchat'::text AS canal,
    r.iniciada_en,
    r.ultimo_mensaje_en,
    r.ip,
    r.device_type,
    NULLIF(r.geo -> 'ip_lookup' ->> 'country_code', '') AS country_code,
    COALESCE(NULLIF(r.country_name, ''), NULLIF(r.geo -> 'ip_lookup' ->> 'country', '')) AS country_name,
    r.cve_ent,
    r.nom_ent,
    r.cve_mun,
    r.nom_mun,
    r.cvegeo,
    r.referrer,
    r.landing_url,
    r.visit_count,
    TRUE,
    COALESCE(r.mensajes_entrantes, 0),
    COALESCE(r.mensajes_salientes, 0),
    r.primer_mensaje_en,
    r.ultimo_mensaje_conversacion,
    c.nombre_completo,
    c.correo,
    c.telefono_e164,
    c.origen,
    c.estado,
    c.captura_estado,
    c.creado_en
FROM conversation_rows r
LEFT JOIN public.contactos c ON c.id = r.contacto_id AND c.organizacion_id = (SELECT organizacion_id FROM tenant);
$function$;

REVOKE ALL ON FUNCTION public.panel_webchat_conversaciones_detalle(timestamptz, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.panel_webchat_conversaciones_detalle(timestamptz, timestamptz, integer, integer) TO authenticated;

COMMIT;
