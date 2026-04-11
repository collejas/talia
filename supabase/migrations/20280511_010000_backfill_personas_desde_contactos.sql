BEGIN;

-- ============================================================================
-- Backfill conservador desde contactos a personas
-- ============================================================================
--
-- Criterio:
-- - No fusionar contactos en esta primera pasada.
-- - Mantener una persona por contacto legacy para no perder trazabilidad.
-- - Guardar el origen completo en metadata para futuros merge/dedup.
-- - La relación cuenta_personas solo se poblará cuando exista cuenta_id.

WITH src AS (
    SELECT
        c.*,
        COALESCE(
            NULLIF(btrim(c.nombre_nombres), ''),
            NULLIF(btrim(c.nombre_completo), ''),
            NULLIF(btrim(c.company_name), ''),
            NULLIF(btrim(c.razon_social), ''),
            'Contacto'
        ) AS persona_nombre,
        NULLIF(btrim(c.apellido_paterno), '') AS persona_apellido_paterno,
        NULLIF(btrim(c.apellido_materno), '') AS persona_apellido_materno,
        COALESCE(
            NULLIF(lower(btrim(c.correo)), ''),
            NULLIF(lower(btrim(c.email)), '')
        ) AS persona_correo,
        COALESCE(
            NULLIF(btrim(c.telefono_e164), ''),
            NULLIF(btrim(c.telefono), '')
        ) AS persona_telefono,
        CASE
            WHEN lower(COALESCE(c.estado, '')) IN ('lead', 'activo', 'inactivo', 'bloqueado') THEN lower(c.estado)
            ELSE 'lead'
        END AS persona_estado,
        CASE
            WHEN COALESCE(
                NULLIF(btrim(c.company_name), ''),
                NULLIF(btrim(c.razon_social), ''),
                NULLIF(btrim(c.rfc), ''),
                NULLIF(btrim(c.email_facturacion), ''),
                NULLIF(btrim(c.website), '')
            ) IS NOT NULL THEN true
            ELSE false
        END AS parece_empresa,
        jsonb_strip_nulls(
            jsonb_build_object(
                'legacy_contacto_id', c.id::text,
                'legacy_contacto_codigo', c.codigo_contacto,
                'legacy_contacto_tipo', CASE
                    WHEN COALESCE(
                        NULLIF(btrim(c.company_name), ''),
                        NULLIF(btrim(c.razon_social), ''),
                        NULLIF(btrim(c.rfc), ''),
                        NULLIF(btrim(c.email_facturacion), ''),
                        NULLIF(btrim(c.website), '')
                    ) IS NOT NULL THEN 'empresa'
                    WHEN lower(COALESCE(c.persona_fisica_moral, '')) = 'fisica' THEN 'persona_fisica'
                    ELSE 'persona'
                END,
                'legacy_persona_fisica_moral', c.persona_fisica_moral,
                'legacy_company_name', c.company_name,
                'legacy_razon_social', c.razon_social,
                'legacy_rfc', c.rfc,
                'legacy_uso_cfdi', c.uso_cfdi,
                'legacy_metodo_pago', c.metodo_pago,
                'legacy_forma_pago', c.forma_pago,
                'legacy_email_facturacion', c.email_facturacion,
                'legacy_tipo_industria', c.tipo_industria,
                'legacy_tamano', c.tamano,
                'legacy_codigo_contacto', c.codigo_contacto,
                'legacy_cuenta_id', c.cuenta_id::text,
                'legacy_contacto_datos', c.contacto_datos,
                'legacy_necesidad_proposito', c.necesidad_proposito,
                'legacy_captura_estado', c.captura_estado,
                'legacy_direccion', jsonb_strip_nulls(jsonb_build_object(
                    'tipo_vialidad', c.tipo_vialidad,
                    'nombre_vialidad', c.nombre_vialidad,
                    'numero_exterior', c.numero_exterior,
                    'letra_exterior', c.letra_exterior,
                    'edificio', c.edificio,
                    'edificio_piso', c.edificio_piso,
                    'numero_interior', c.numero_interior,
                    'letra_interior', c.letra_interior,
                    'tipo_asentamiento', c.tipo_asentamiento,
                    'nombre_asentamiento', c.nombre_asentamiento,
                    'tipo_centro_comercial', c.tipo_centro_comercial,
                    'corredor_industrial', c.corredor_industrial,
                    'numero_local', c.numero_local,
                    'codigo_postal', c.codigo_postal,
                    'clave_entidad', c.clave_entidad,
                    'entidad', c.entidad,
                    'clave_municipio', c.clave_municipio,
                    'municipio', c.municipio,
                    'clave_localidad', c.clave_localidad,
                    'localidad', c.localidad,
                    'pais', c.pais,
                    'latitud', c.latitud,
                    'longitud', c.longitud
                ))
            )
        ) AS persona_metadata
    FROM public.contactos c
),
inserted_personas AS (
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
    )
    SELECT
        gen_random_uuid(),
        s.organizacion_id,
        s.persona_nombre,
        s.persona_apellido_paterno,
        s.persona_apellido_materno,
        s.persona_nombre,
        s.persona_correo,
        s.persona_telefono,
        NULLIF(btrim(s.puesto), ''),
        NULLIF(btrim(s.area), ''),
        NULLIF(btrim(s.rol_decision), ''),
        s.persona_estado,
        NULLIF(btrim(s.origen), ''),
        NULLIF(btrim(concat_ws(' | ', s.notas, s.notes, s.necesidad_proposito)), ''),
        s.persona_metadata,
        s.propietario_usuario_id,
        COALESCE(s.fecha_incorporacion, s.creado_en, now()),
        now()
    FROM src s
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.personas p
        WHERE p.metadata->>'legacy_contacto_id' = s.id::text
    )
    RETURNING id, metadata
)
SELECT count(*) AS personas_insertadas
FROM inserted_personas;

-- ============================================================================
-- Relacion cuenta-persona para registros legacy que ya tengan cuenta_id
-- ============================================================================
--
-- En la base actual este bloque queda en cero filas, porque contactos.cuenta_id
-- todavía no tiene datos. Se deja la lógica lista para el siguiente ciclo.

WITH contacto_persona AS (
    SELECT
        c.id AS contacto_id,
        c.organizacion_id,
        c.cuenta_id,
        p.id AS persona_id,
        COALESCE(NULLIF(lower(btrim(c.rol_decision)), ''), 'contacto_principal') AS rol_en_cuenta,
        NULLIF(btrim(c.puesto), '') AS puesto,
        NULLIF(btrim(c.notas), '') AS notas,
        COALESCE(c.fecha_incorporacion::date, c.creado_en::date, current_date) AS fecha_inicio,
        jsonb_strip_nulls(
            jsonb_build_object(
                'legacy_contacto_id', c.id::text,
                'legacy_contacto_codigo', c.codigo_contacto
            )
        ) AS metadata
    FROM public.contactos c
    JOIN public.personas p
      ON p.metadata->>'legacy_contacto_id' = c.id::text
    WHERE c.cuenta_id IS NOT NULL
)
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
)
SELECT
    gen_random_uuid(),
    cp.organizacion_id,
    cp.cuenta_id,
    cp.persona_id,
    cp.rol_en_cuenta,
    cp.puesto,
    true,
    false,
    false,
    true,
    cp.fecha_inicio,
    cp.notas,
    cp.metadata,
    now(),
    now()
FROM contacto_persona cp
WHERE NOT EXISTS (
    SELECT 1
    FROM public.cuenta_personas x
    WHERE x.organizacion_id = cp.organizacion_id
      AND x.cuenta_id = cp.cuenta_id
      AND x.persona_id = cp.persona_id
      AND x.rol_en_cuenta = cp.rol_en_cuenta
);

COMMIT;
