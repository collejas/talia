BEGIN;

CREATE OR REPLACE VIEW public.panel_calendar_bookings
WITH (security_invoker = true) AS
SELECT
    cb.id,
    cb.resource_id,
    cb.hold_id,
    cb.tarjeta_id,
    cb.contact_id,
    cb.conversacion_id,
    cb.start_at,
    cb.end_at,
    cb.timezone,
    cb.status,
    cb.notes,
    cb.meeting_url,
    cb.external_join_url,
    cb.metadata,
    cb.created_at,
    cb.updated_at,
    lt.tablero_id,
    lt.etapa_id,
    le.codigo AS etapa_codigo,
    le.nombre AS etapa_nombre,
    lt.canal AS tarjeta_canal,
    lt.lead_score AS tarjeta_lead_score,
    lt.tags AS tarjeta_tags,
    lt.metadata AS tarjeta_metadata,
    lt.asignado_a_usuario_id,
    ua.nombre_completo AS asignado_nombre,
    lt.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre,
    c.nombre_completo AS contacto_nombre,
    c.correo AS contacto_correo,
    c.telefono_e164 AS contacto_telefono,
    c.company_name AS contacto_empresa,
    c.origen AS contacto_origen,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en AS conversacion_ultimo_mensaje_en,
    conv.canal AS conversacion_canal
FROM public.calendar_bookings cb
LEFT JOIN public.lead_tarjetas lt ON lt.id = cb.tarjeta_id
LEFT JOIN public.lead_etapas le ON le.id = lt.etapa_id
LEFT JOIN public.usuarios ua ON ua.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id
LEFT JOIN public.contactos c ON c.id = cb.contact_id
LEFT JOIN public.conversaciones conv ON conv.id = cb.conversacion_id;

COMMENT ON VIEW public.panel_calendar_bookings IS
    'Citas confirmadas del calendario con contexto de tarjeta, contacto y conversación para el panel.';

CREATE OR REPLACE VIEW public.v_configuracion_personal
WITH (security_invoker = true) AS
SELECT
    u.id AS usuario_id,
    u.correo,
    u.nombre_completo,
    u.estado,
    u.telefono_e164,
    u.ultimo_acceso_en,
    u.creado_en AS usuario_creado_en,
    e.es_gestor,
    e.creado_en AS empleado_creado_en,
    e.departamento_id,
    d.nombre AS departamento_nombre,
    e.puesto_id,
    p.nombre AS puesto_nombre,
    p.descripcion AS puesto_descripcion,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'rol_id', ur.rol_id,
                    'codigo', r.codigo,
                    'nombre', r.nombre
                )
                ORDER BY r.codigo
            )
            FROM public.usuarios_roles ur
            JOIN public.roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
        ),
        '[]'::jsonb
    ) AS roles,
    e.es_vendedor,
    e.ultimo_lead_asignado_en
FROM public.usuarios u
LEFT JOIN public.empleados e ON e.usuario_id = u.id
LEFT JOIN public.departamentos d ON d.id = e.departamento_id
LEFT JOIN public.puestos p ON p.id = e.puesto_id;

CREATE OR REPLACE VIEW public.embudo
WITH (security_invoker = true) AS
SELECT
    lt.id,
    lt.tablero_id,
    lt.etapa_id,
    lt.contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.estado AS contacto_estado,
    ct.telefono_e164 AS contacto_telefono,
    ct.correo AS contacto_correo,
    lt.conversacion_id,
    COALESCE(lt.canal, conv.canal) AS canal,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en,
    lt.monto_estimado,
    lt.moneda,
    lt.probabilidad_override,
    lt.lead_score,
    lt.tags,
    lt.metadata,
    lt.asignado_a_usuario_id,
    usr.nombre_completo AS asignado_nombre,
    lt.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre,
    lt.cerrado_en,
    lt.motivo_cierre,
    lt.creado_en,
    lt.actualizado_en,
    ci.resumen,
    ci.intencion,
    ci.sentimiento,
    ci.siguiente_accion
FROM public.lead_tarjetas lt
JOIN public.contactos ct ON ct.id = lt.contacto_id
LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
LEFT JOIN public.conversaciones_insights ci ON ci.conversacion_id = lt.conversacion_id
LEFT JOIN public.usuarios usr ON usr.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id;

CREATE OR REPLACE VIEW public.v_resultados_unificados
WITH (security_invoker = true) AS
SELECT
    r.id,
    r.busqueda_id,
    b.fuente AS fuente_busqueda,
    r.fuente AS fuente_resultado,
    r.external_id,
    r.clee,
    COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    r.phone,
    r.email,
    r.website,
    r.address,
    r.lat,
    r.lng,
    r.rating,
    r.reviews,
    r.maps_url,
    r.creado_en
FROM public.resultados r
JOIN public.busquedas b ON b.id = r.busqueda_id;

CREATE OR REPLACE VIEW public.v_resultados_mapa
WITH (security_invoker = true) AS
SELECT
    id,
    busqueda_id,
    fuente,
    external_id,
    COALESCE(NULLIF(name, ''::text), NULLIF(razon_social, ''::text)) AS display_name,
    actividad,
    rating,
    reviews,
    address,
    phone,
    website,
    geom
FROM public.resultados r
WHERE geom IS NOT NULL;

CREATE OR REPLACE VIEW public.conversaciones_en_curso
WITH (security_invoker = true) AS
SELECT
    c.id AS conversacion_id,
    c.canal,
    c.estado,
    c.prioridad,
    c.iniciada_en,
    c.ultimo_mensaje_en,
    ct.id AS contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.telefono_e164 AS contacto_telefono,
    ct.correo AS contacto_correo,
    u.id AS asignado_usuario_id,
    u.nombre_completo AS asignado_usuario_nombre,
    u.correo AS asignado_usuario_correo
FROM public.conversaciones c
JOIN public.contactos ct ON ct.id = c.contacto_id
LEFT JOIN public.usuarios u ON u.id = c.asignado_a_usuario_id
WHERE c.estado = ANY (ARRAY['abierta'::text, 'pendiente'::text]);

CREATE OR REPLACE VIEW public.v_denue_contactables
WITH (security_invoker = true) AS
SELECT
    r.id AS resultado_id,
    r.busqueda_id,
    r.fuente AS fuente_resultado,
    b.fuente AS fuente_busqueda,
    r.external_id,
    COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    COALESCE(
        NULLIF(r.phone, ''::text),
        NULLIF((r.raw #>> '{Telefono}'::text[]), ''::text)
    ) AS phone,
    COALESCE(
        NULLIF(r.email, ''::text),
        NULLIF((r.raw #>> '{Correo_e}'::text[]), ''::text)
    ) AS email,
    COALESCE(
        NULLIF(r.website, ''::text),
        NULLIF((r.raw #>> '{Sitio_internet}'::text[]), ''::text)
    ) AS website,
    NULLIF(r.address, ''::text) AS address,
    r.lat,
    r.lng,
    r.geom,
    r.maps_url,
    r.creado_en AS resultado_creado_en,
    b.query AS busqueda_query,
    b.radio_m AS busqueda_radio_m,
    b.lat AS busqueda_lat,
    b.lng AS busqueda_lng,
    b.centro AS busqueda_centro,
    b.total_encontrados AS busqueda_total_encontrados,
    b.meta AS busqueda_meta,
    b.creado_en AS busqueda_creado_en,
    b.creado_por AS busqueda_creado_por,
    CASE
        WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL THEN public.st_distance(b.centro, r.geom)
        ELSE NULL::double precision
    END AS distancia_m
FROM public.resultados r
JOIN public.busquedas b ON b.id = r.busqueda_id
WHERE r.fuente = 'denue'::public.fuente_resultado;

COMMENT ON VIEW public.v_denue_contactables IS
    'Resultados de búsquedas DENUE listos para contactabilidad y mapa.';

CREATE OR REPLACE VIEW public.v_google_places_contactables
WITH (security_invoker = true) AS
SELECT
    r.id AS resultado_id,
    r.busqueda_id,
    r.fuente AS fuente_resultado,
    b.fuente AS fuente_busqueda,
    r.external_id,
    COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    (r.raw ->> 'primaryType') AS google_primary_type,
    (r.raw ->> 'primaryTypeDisplayName') AS google_primary_type_display_name,
    COALESCE(types.google_types, ARRAY[]::text[]) AS google_types,
    COALESCE(
        NULLIF(r.phone, ''::text),
        NULLIF((r.raw #>> '{internationalPhoneNumber}'::text[]), ''::text),
        NULLIF((r.raw #>> '{nationalPhoneNumber}'::text[]), ''::text)
    ) AS phone,
    COALESCE(
        NULLIF(r.email, ''::text),
        NULLIF((r.raw #>> '{email}'::text[]), ''::text)
    ) AS email,
    COALESCE(
        NULLIF(r.website, ''::text),
        NULLIF((r.raw #>> '{websiteUri}'::text[]), ''::text),
        NULLIF((r.raw #>> '{googleMapsUri}'::text[]), ''::text)
    ) AS website,
    NULLIF(r.address, ''::text) AS address,
    r.lat,
    r.lng,
    r.geom,
    r.rating,
    r.reviews,
    r.maps_url,
    r.creado_en AS resultado_creado_en,
    b.query AS busqueda_query,
    b.radio_m AS busqueda_radio_m,
    b.lat AS busqueda_lat,
    b.lng AS busqueda_lng,
    b.centro AS busqueda_centro,
    b.total_encontrados AS busqueda_total_encontrados,
    b.meta AS busqueda_meta,
    b.creado_en AS busqueda_creado_en,
    b.creado_por AS busqueda_creado_por,
    CASE
        WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL THEN public.st_distance(b.centro, r.geom)
        ELSE NULL::double precision
    END AS distancia_m
FROM public.resultados r
JOIN public.busquedas b ON b.id = r.busqueda_id
LEFT JOIN LATERAL (
    SELECT COALESCE(array_agg(value.value), ARRAY[]::text[]) AS google_types
    FROM jsonb_array_elements_text(COALESCE(r.raw -> 'types', '[]'::jsonb)) value(value)
) types ON TRUE
WHERE r.fuente = 'google_places'::public.fuente_resultado;

COMMENT ON VIEW public.v_google_places_contactables IS
    'Resultados de búsquedas Google Places listos para contactabilidad (teléfono, web, tipo, radio y distancia al centro).';

COMMIT;
