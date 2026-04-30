BEGIN;

-- WhatsApp y tablas de inbox dejan de depender de public.contactos.
-- Las columnas siguen llamándose contacto_id por compatibilidad, pero ahora
-- almacenan public.personas.id y los FKs apuntan al modelo nuevo.

CREATE OR REPLACE FUNCTION public.tg_set_org_from_contacto_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    IF NEW.contacto_id IS NOT NULL THEN
        SELECT p.organizacion_id INTO v_org
        FROM public.personas p
        WHERE p.id = NEW.contacto_id;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

-- Primero se migran los valores legacy a persona_id para no romper el runtime.
WITH refs AS (
    SELECT contacto_id, organizacion_id, 'conversaciones'::text AS src, NULL::jsonb AS metadatos
      FROM public.conversaciones
     WHERE contacto_id IS NOT NULL
    UNION ALL
    SELECT contacto_id, organizacion_id, 'identidades_canal'::text AS src, metadatos
      FROM public.identidades_canal
     WHERE contacto_id IS NOT NULL
    UNION ALL
    SELECT contacto_id, organizacion_id, 'llamadas'::text AS src, NULL::jsonb AS metadatos
      FROM public.llamadas
     WHERE contacto_id IS NOT NULL
    UNION ALL
    SELECT contacto_id, organizacion_id, 'webchat_visitantes'::text AS src, NULL::jsonb AS metadatos
      FROM public.webchat_visitantes
     WHERE contacto_id IS NOT NULL
    UNION ALL
    SELECT contacto_id, organizacion_id, 'webchat_session_closures'::text AS src, NULL::jsonb AS metadatos
      FROM public.webchat_session_closures
     WHERE contacto_id IS NOT NULL
),
missing AS (
    SELECT
        r.contacto_id,
        (array_agg(r.organizacion_id ORDER BY r.src))[1] AS organizacion_id,
        bool_or(r.src IN ('conversaciones', 'identidades_canal')) AS is_whatsapp,
        bool_or(r.src IN ('webchat_visitantes', 'webchat_session_closures')) AS is_webchat,
        (array_agg(r.metadatos ORDER BY (r.metadatos IS NULL), r.src))[1] AS source_metadatos
    FROM refs r
    WHERE NOT EXISTS (
        SELECT 1
          FROM public.personas p
         WHERE p.id = r.contacto_id
    )
    GROUP BY r.contacto_id
),
contact_source AS (
    SELECT
        c.id,
        c.organizacion_id,
        c.nombre_completo,
        c.telefono_e164,
        c.correo,
        c.origen,
        c.contacto_datos
    FROM public.contactos c
    JOIN missing m ON m.contacto_id = c.id
)
INSERT INTO public.personas (
    id,
    organizacion_id,
    nombre,
    apellido_paterno,
    apellido_materno,
    correo_principal,
    telefono_principal_e164,
    origen,
    metadata,
    estado
)
SELECT
    m.contacto_id,
    COALESCE(cs.organizacion_id, m.organizacion_id),
    COALESCE(
        NULLIF(btrim(cs.nombre_completo), ''),
        NULLIF(btrim(m.source_metadatos->>'profile_name'), ''),
        CASE WHEN m.is_webchat THEN 'Visitante Webchat' ELSE 'Contacto' END
    ),
    NULL,
    NULL,
    NULLIF(btrim(COALESCE(cs.correo, m.source_metadatos->>'email')), ''),
    NULLIF(btrim(COALESCE(cs.telefono_e164, m.source_metadatos->>'telefono')), ''),
    COALESCE(
        NULLIF(btrim(cs.origen), ''),
        CASE WHEN m.is_webchat THEN 'webchat' ELSE 'whatsapp' END
    ),
    COALESCE(cs.contacto_datos, '{}'::jsonb)
        || jsonb_build_object(
            'legacy_contacto_id', m.contacto_id::text,
            'recovered_from', 'whatsapp_personas_runtime'
        ),
    'activo'
FROM missing m
LEFT JOIN contact_source cs ON cs.id = m.contacto_id
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.conversaciones DROP CONSTRAINT IF EXISTS conversaciones_contacto_org_fkey;
ALTER TABLE public.conversaciones DROP CONSTRAINT IF EXISTS conversations_contact_id_fkey;
ALTER TABLE public.identidades_canal DROP CONSTRAINT IF EXISTS identidades_canal_contacto_org_fkey;
ALTER TABLE public.identidades_canal DROP CONSTRAINT IF EXISTS channel_identities_contact_id_fkey;
ALTER TABLE public.llamadas DROP CONSTRAINT IF EXISTS llamadas_contacto_org_fkey;
ALTER TABLE public.llamadas DROP CONSTRAINT IF EXISTS calls_contact_id_fkey;
ALTER TABLE public.webchat_visitantes DROP CONSTRAINT IF EXISTS webchat_visitantes_contacto_org_fkey;
ALTER TABLE public.webchat_visitantes DROP CONSTRAINT IF EXISTS webchat_visitantes_contacto_fk;
ALTER TABLE public.webchat_session_closures DROP CONSTRAINT IF EXISTS webchat_session_closures_contacto_org_fkey;
ALTER TABLE public.webchat_session_closures DROP CONSTRAINT IF EXISTS webchat_session_closures_contacto_fk;

WITH contacto_persona AS (
    SELECT
        c.id AS contacto_id,
        p.id AS persona_id
    FROM public.contactos c
    JOIN public.personas p
      ON p.organizacion_id = c.organizacion_id
     AND p.metadata->>'legacy_contacto_id' = c.id::text
)
UPDATE public.conversaciones conv
SET contacto_id = cp.persona_id
FROM contacto_persona cp
WHERE conv.contacto_id = cp.contacto_id
  AND conv.contacto_id <> cp.persona_id;

WITH contacto_persona AS (
    SELECT
        c.id AS contacto_id,
        p.id AS persona_id
    FROM public.contactos c
    JOIN public.personas p
      ON p.organizacion_id = c.organizacion_id
     AND p.metadata->>'legacy_contacto_id' = c.id::text
)
UPDATE public.identidades_canal ic
SET contacto_id = cp.persona_id
FROM contacto_persona cp
WHERE ic.contacto_id = cp.contacto_id
  AND ic.contacto_id <> cp.persona_id;

WITH contacto_persona AS (
    SELECT
        c.id AS contacto_id,
        p.id AS persona_id
    FROM public.contactos c
    JOIN public.personas p
      ON p.organizacion_id = c.organizacion_id
     AND p.metadata->>'legacy_contacto_id' = c.id::text
)
UPDATE public.llamadas lla
SET contacto_id = cp.persona_id
FROM contacto_persona cp
WHERE lla.contacto_id = cp.contacto_id
  AND lla.contacto_id <> cp.persona_id;

WITH contacto_persona AS (
    SELECT
        c.id AS contacto_id,
        p.id AS persona_id
    FROM public.contactos c
    JOIN public.personas p
      ON p.organizacion_id = c.organizacion_id
     AND p.metadata->>'legacy_contacto_id' = c.id::text
)
UPDATE public.webchat_visitantes wv
SET contacto_id = cp.persona_id
FROM contacto_persona cp
WHERE wv.contacto_id = cp.contacto_id
  AND wv.contacto_id <> cp.persona_id;

WITH contacto_persona AS (
    SELECT
        c.id AS contacto_id,
        p.id AS persona_id
    FROM public.contactos c
    JOIN public.personas p
      ON p.organizacion_id = c.organizacion_id
     AND p.metadata->>'legacy_contacto_id' = c.id::text
)
UPDATE public.webchat_session_closures wc
SET contacto_id = cp.persona_id
FROM contacto_persona cp
WHERE wc.contacto_id = cp.contacto_id
  AND wc.contacto_id <> cp.persona_id;

UPDATE public.conversaciones conv
SET organizacion_id = p.organizacion_id
FROM public.personas p
WHERE conv.contacto_id = p.id
  AND conv.organizacion_id <> p.organizacion_id;

UPDATE public.identidades_canal ic
SET organizacion_id = p.organizacion_id
FROM public.personas p
WHERE ic.contacto_id = p.id
  AND ic.organizacion_id <> p.organizacion_id;

UPDATE public.llamadas lla
SET organizacion_id = p.organizacion_id
FROM public.personas p
WHERE lla.contacto_id = p.id
  AND lla.organizacion_id <> p.organizacion_id;

UPDATE public.webchat_visitantes wv
SET organizacion_id = p.organizacion_id
FROM public.personas p
WHERE wv.contacto_id = p.id
  AND wv.organizacion_id <> p.organizacion_id;

UPDATE public.webchat_session_closures wc
SET organizacion_id = p.organizacion_id
FROM public.personas p
WHERE wc.contacto_id = p.id
  AND wc.organizacion_id <> p.organizacion_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'conversaciones_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.conversaciones
            ADD CONSTRAINT conversaciones_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'identidades_canal_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.identidades_canal
            ADD CONSTRAINT identidades_canal_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'llamadas_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.llamadas
            ADD CONSTRAINT llamadas_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'webchat_visitantes_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.webchat_visitantes
            ADD CONSTRAINT webchat_visitantes_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'webchat_session_closures_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.webchat_session_closures
            ADD CONSTRAINT webchat_session_closures_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

COMMIT;
