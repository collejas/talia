BEGIN;

-- ============================================================================
-- Backfill de personas faltantes referenciadas por oportunidades
-- ============================================================================
--
-- Algunas oportunidades históricas siguen apuntando a ids que existen en
-- public.contactos pero no aún en public.personas. Antes de mover la FK,
-- sembramos esas personas con el mismo id para conservar trazabilidad.

WITH src AS (
    SELECT
        c.id,
        c.organizacion_id,
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
        NULLIF(btrim(c.origen), '') AS persona_origen,
        NULLIF(btrim(concat_ws(' | ', c.notas, c.notes, c.necesidad_proposito)), '') AS persona_notas,
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
                'legacy_cuenta_id', c.cuenta_id::text,
                'legacy_contacto_datos', c.contacto_datos,
                'legacy_persona_datos', c.persona_datos,
                'legacy_necesidad_proposito', c.necesidad_proposito,
                'legacy_captura_estado', c.captura_estado
            )
        ) AS persona_metadata
    FROM public.oportunidades o
    JOIN public.contactos c
      ON c.organizacion_id = o.organizacion_id
     AND c.id = o.contacto_principal_id
    WHERE o.contacto_principal_id IS NOT NULL
      AND o.organizacion_id = '00000000-0000-0000-0000-000000000001'
      AND NOT EXISTS (
          SELECT 1
          FROM public.personas p
          WHERE p.organizacion_id = c.organizacion_id
            AND p.id = c.id
      )
)
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
    s.id,
    s.organizacion_id,
    s.persona_nombre,
    s.persona_apellido_paterno,
    s.persona_apellido_materno,
    s.persona_nombre,
    s.persona_correo,
    s.persona_telefono,
    NULL,
    NULL,
    NULL,
    s.persona_estado,
    s.persona_origen,
    s.persona_notas,
    s.persona_metadata,
    NULL,
    now(),
    now()
FROM src s;

-- ============================================================================
-- Cambiar la FK de oportunidades para apuntar a personas
-- ============================================================================

ALTER TABLE public.oportunidades
    DROP CONSTRAINT IF EXISTS oportunidades_contacto_principal_org_fkey;

ALTER TABLE public.oportunidades
    ADD CONSTRAINT oportunidades_contacto_principal_org_fkey
    FOREIGN KEY (organizacion_id, contacto_principal_id)
    REFERENCES public.personas (organizacion_id, id)
    ON DELETE SET NULL;

COMMENT ON CONSTRAINT oportunidades_contacto_principal_org_fkey ON public.oportunidades
    IS 'El contacto principal de una oportunidad apunta a public.personas.';

COMMIT;
