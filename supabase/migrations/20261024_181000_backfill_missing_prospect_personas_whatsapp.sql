BEGIN;

-- Solo se recuperan referencias que tienen teléfono móvil. Las referencias
-- de correo sin teléfono no son válidas para el runtime de WhatsApp y no deben
-- recibir datos sintéticos para satisfacer la restricción de personas.
INSERT INTO public.personas (
    id,
    organizacion_id,
    nombre,
    correo_principal,
    telefono_principal_e164,
    telefono_movil_1_e164,
    origen,
    metadata,
    estado
)
SELECT
    c.id,
    c.organizacion_id,
    COALESCE(NULLIF(btrim(c.nombre_completo), ''), 'Contacto'),
    NULLIF(btrim(c.correo), ''),
    NULLIF(btrim(c.telefono_e164), ''),
    NULLIF(btrim(c.telefono_e164), ''),
    COALESCE(NULLIF(btrim(c.origen), ''), 'prospeccion'),
    COALESCE(c.contacto_datos, '{}'::jsonb)
        || jsonb_build_object(
            'legacy_contacto_id', c.id::text,
            'recovered_from', 'prospeccion_crm_contacto_id'
        ),
    'activo'
FROM public.contactos c
JOIN (
    SELECT DISTINCT NULLIF(metadata->>'crm_contacto_id', '')::uuid AS contacto_id
    FROM public.prospeccion_prospectos
    WHERE NULLIF(metadata->>'crm_contacto_id', '') ~* '^[0-9a-f-]{36}$'
) refs ON refs.contacto_id = c.id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.personas p
    WHERE p.id = c.id
)
  AND NULLIF(btrim(c.telefono_e164), '') IS NOT NULL;

COMMIT;
