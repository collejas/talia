BEGIN;

-- ============================================================================
-- Backfill conservador de cuentas desde personas legacy tipo empresa
-- ============================================================================
--
-- Criterio:
-- - Crear una cuenta por cada persona legacy marcada como empresa.
-- - No fusionar duplicados todavía.
-- - Mantener trazabilidad completa en metadata.
-- - Relacionar la cuenta con la persona legacy mediante cuenta_personas.
-- - Si más adelante aparece una dirección real en metadata, también podrá
--   poblarse en direcciones / cuenta_direcciones sin perder este origen.

WITH src AS (
    SELECT
        p.id,
        p.organizacion_id,
        p.nombre,
        p.apellido_paterno,
        p.apellido_materno,
        p.nombre_completo,
        p.correo_principal,
        p.telefono_principal_e164,
        p.puesto,
        p.area,
        p.rol_decision,
        p.estado,
        p.origen,
        p.notas,
        p.metadata,
        p.propietario_usuario_id,
        p.creado_en,
        p.actualizado_en,
        COALESCE(
            NULLIF(btrim(p.metadata->>'legacy_company_name'), ''),
            NULLIF(btrim(p.metadata->>'legacy_razon_social'), ''),
            NULLIF(btrim(p.nombre_completo), ''),
            NULLIF(btrim(p.nombre), ''),
            'Cuenta sin nombre'
        ) AS cuenta_nombre,
        COALESCE(
            NULLIF(btrim(p.metadata->>'legacy_razon_social'), ''),
            NULLIF(btrim(p.metadata->>'legacy_company_name'), ''),
            NULLIF(btrim(p.nombre_completo), ''),
            NULLIF(btrim(p.nombre), '')
        ) AS cuenta_razon_social,
        COALESCE(
            NULLIF(lower(btrim(p.correo_principal)), ''),
            NULLIF(lower(btrim(p.metadata->>'legacy_email_facturacion')), ''),
            NULLIF(lower(btrim(p.metadata->>'legacy_correo')), ''),
            NULLIF(lower(btrim(p.metadata->>'legacy_email')), '')
        ) AS cuenta_correo,
        COALESCE(
            NULLIF(btrim(p.telefono_principal_e164), ''),
            NULLIF(btrim(p.metadata->>'legacy_telefono_e164'), ''),
            NULLIF(btrim(p.metadata->>'legacy_telefono'), '')
        ) AS cuenta_telefono,
        CASE
            WHEN lower(COALESCE(p.metadata->>'legacy_persona_fisica_moral', '')) = 'fisica'
                THEN 'persona_fisica_actividad_empresarial'
            ELSE 'empresa'
        END AS cuenta_tipo,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_tipo_industria'), ''), NULLIF(btrim(p.metadata->>'legacy_industria'), '')) AS cuenta_industria,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_tamano'), ''), NULLIF(btrim(p.metadata->>'legacy_segmento_tamano'), '')) AS cuenta_tamano,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_website'), ''), NULLIF(btrim(p.metadata->>'legacy_sitio_web'), '')) AS cuenta_website,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_rfc'), ''), NULLIF(btrim(p.metadata->>'legacy_rfc_fiscal'), '')) AS cuenta_rfc,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_uso_cfdi'), ''), NULLIF(btrim(p.metadata->>'legacy_metodo_pago'), '')) AS cuenta_uso_cfdi,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_metodo_pago'), ''), NULLIF(btrim(p.metadata->>'legacy_forma_pago'), '')) AS cuenta_metodo_pago,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_forma_pago'), ''), NULLIF(btrim(p.metadata->>'legacy_metodo_pago'), '')) AS cuenta_forma_pago,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_email_facturacion'), ''), NULLIF(lower(btrim(p.correo_principal)), '')) AS cuenta_email_facturacion,
        COALESCE(NULLIF(btrim(p.metadata->>'legacy_notas'), ''), NULLIF(btrim(p.notas), ''), NULLIF(btrim(p.metadata->>'legacy_necesidad_proposito'), '')) AS cuenta_notas,
        jsonb_strip_nulls(
            jsonb_build_object(
                'legacy_persona_id', p.id::text,
                'legacy_contacto_id', p.metadata->>'legacy_contacto_id',
                'legacy_contacto_codigo', p.metadata->>'legacy_contacto_codigo',
                'legacy_contacto_tipo', p.metadata->>'legacy_contacto_tipo',
                'legacy_persona_metadata', p.metadata,
                'legacy_origen', p.origen
            )
        ) AS cuenta_metadata,
    FROM public.personas p
    WHERE COALESCE(p.metadata->>'legacy_contacto_tipo', '') = 'empresa'
),
inserted_cuentas AS (
    INSERT INTO public.cuentas (
        id,
        organizacion_id,
        nombre,
        alias,
        tipo,
        industria,
        tamano,
        sitio_web,
        telefono,
        correo,
        direccion,
        propietario_usuario_id,
        metadata,
        creado_en,
        actualizado_en,
        codigo_cuenta,
        razon_social,
        rfc,
        uso_cfdi,
        metodo_pago,
        forma_pago,
        email_facturacion,
        tipo_industria,
        notas,
        necesidad_proposito,
        email,
        website,
        tipo_establecimiento,
        latitud,
        longitud
    )
    SELECT
        gen_random_uuid(),
        s.organizacion_id,
        s.cuenta_nombre,
        NULL,
        s.cuenta_tipo,
        s.cuenta_industria,
        s.cuenta_tamano,
        s.cuenta_website,
        s.cuenta_telefono,
        s.cuenta_correo,
        '{}'::jsonb,
        s.propietario_usuario_id,
        s.cuenta_metadata,
        COALESCE(s.creado_en, now()),
        COALESCE(s.actualizado_en, now()),
        public.gen_codigo_cuenta(s.organizacion_id),
        s.cuenta_razon_social,
        s.cuenta_rfc,
        s.cuenta_uso_cfdi,
        s.cuenta_metodo_pago,
        s.cuenta_forma_pago,
        s.cuenta_email_facturacion,
        s.cuenta_industria,
        s.cuenta_notas,
        NULL,
        s.cuenta_correo,
        s.cuenta_website,
        NULL,
        NULL,
        NULL
    FROM src s
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.cuentas c
        WHERE c.metadata->>'legacy_persona_id' = s.id::text
    )
      AND NOT EXISTS (
        SELECT 1
        FROM public.cuentas c
        WHERE c.organizacion_id = s.organizacion_id
          AND c.rfc IS NOT NULL
          AND btrim(c.rfc) <> ''
          AND s.cuenta_rfc IS NOT NULL
          AND btrim(s.cuenta_rfc) <> ''
          AND upper(c.rfc) = upper(s.cuenta_rfc)
    )
    RETURNING id, metadata
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
    s.organizacion_id,
    cu.id,
    s.id,
    CASE
        WHEN lower(COALESCE(s.metadata->>'legacy_persona_fisica_moral', '')) = 'fisica'
            THEN 'dueno'
        ELSE 'contacto_principal'
    END,
    NULLIF(btrim(s.puesto), ''),
    true,
    false,
    CASE
        WHEN lower(COALESCE(s.metadata->>'legacy_persona_fisica_moral', '')) = 'fisica' THEN true
        ELSE false
    END,
    true,
    COALESCE(s.creado_en::date, current_date),
    NULLIF(btrim(s.notas), ''),
    jsonb_strip_nulls(
        jsonb_build_object(
            'legacy_persona_id', s.id::text,
            'legacy_contacto_id', s.metadata->>'legacy_contacto_id',
            'legacy_contacto_codigo', s.metadata->>'legacy_contacto_codigo',
            'legacy_contacto_tipo', s.metadata->>'legacy_contacto_tipo'
        )
    ),
    now(),
    now()
FROM src s
JOIN inserted_cuentas cu
  ON cu.metadata->>'legacy_persona_id' = s.id::text
WHERE NOT EXISTS (
    SELECT 1
    FROM public.cuenta_personas cp
    WHERE cp.organizacion_id = s.organizacion_id
      AND cp.cuenta_id = cu.id
      AND cp.persona_id = s.id
);

COMMIT;
