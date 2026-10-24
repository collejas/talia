BEGIN;

-- Las referencias de prospección guardan el ID legacy de contactos en
-- metadata.crm_contacto_id. El runtime actual de WhatsApp/Inbox usa personas
-- y la FK conversaciones_contacto_org_fkey apunta a personas. Recuperamos
-- únicamente las personas que faltan para esas referencias, conservando el
-- mismo UUID para que no se rompan campañas ni trazabilidad histórica.
INSERT INTO public.personas (
    id,
    organizacion_id,
    nombre,
    correo_principal,
    telefono_principal_e164,
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
