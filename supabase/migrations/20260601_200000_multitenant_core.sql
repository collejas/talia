BEGIN;

-- ============================================================================
-- Tabla de organizaciones (tenants)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    razon_social text,
    rfc text,
    pais text,
    estado text,
    ciudad text,
    dominio_principal text,
    telefono text,
    sitio_web text,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    estado_onboarding text NOT NULL DEFAULT 'pendiente'::text,
    activo boolean NOT NULL DEFAULT true,
    fecha_alta timestamptz NOT NULL DEFAULT now(),
    fecha_pausa timestamptz,
    fecha_cancelacion timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizaciones IS 'Tenants del SaaS; agrupan datos y config multi-tenant.';
COMMENT ON COLUMN public.organizaciones.config IS 'JSONB con banderas/ajustes (pipelines, features, etc.).';
COMMENT ON COLUMN public.organizaciones.estado_onboarding IS 'pendiente|en_progreso|completado|pausado|cancelado';

INSERT INTO public.organizaciones (id, nombre, razon_social, dominio_principal, estado_onboarding, activo)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Tenant único',
    'Tenant único',
    'default.local',
    'completado',
    true
)
ON CONFLICT (id) DO NOTHING;

-- Helper constante para asignaciones masivas
DO $$
BEGIN
    PERFORM 1
    FROM public.organizaciones
    WHERE id = '00000000-0000-0000-0000-000000000001';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo crear la organizacion por defecto (UUID 00000000-0000-0000-0000-000000000001)';
    END IF;
END;
$$;

-- ============================================================================
-- Usuarios
-- ============================================================================

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.usuarios
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.usuarios
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS usuarios_organizacion_id_idx
    ON public.usuarios (organizacion_id);

-- ============================================================================
-- Roles
-- ============================================================================

ALTER TABLE public.roles
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.roles
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.roles
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.roles
    ADD CONSTRAINT roles_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS roles_organizacion_id_idx
    ON public.roles (organizacion_id);

-- ============================================================================
-- Usuarios <-> Roles
-- ============================================================================

ALTER TABLE public.usuarios_roles
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_prevent_remove_last_admin'
          AND tgrelid = 'public.usuarios_roles'::regclass
    ) THEN
        EXECUTE 'ALTER TABLE public.usuarios_roles DISABLE TRIGGER trg_prevent_remove_last_admin';
    END IF;
END;
$$;

UPDATE public.usuarios_roles ur
SET organizacion_id = COALESCE(ur.organizacion_id, u.organizacion_id, '00000000-0000-0000-0000-000000000001')
FROM public.usuarios u
WHERE u.id = ur.usuario_id
  AND ur.organizacion_id IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_prevent_remove_last_admin'
          AND tgrelid = 'public.usuarios_roles'::regclass
    ) THEN
        EXECUTE 'ALTER TABLE public.usuarios_roles ENABLE TRIGGER trg_prevent_remove_last_admin';
    END IF;
END;
$$;

ALTER TABLE public.usuarios_roles
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS usuarios_roles_organizacion_idx
    ON public.usuarios_roles (organizacion_id, usuario_id);

-- ============================================================================
-- Contactos
-- ============================================================================

ALTER TABLE public.contactos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.contactos
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.contactos
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.contactos
    ADD CONSTRAINT contactos_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS contactos_organizacion_id_idx
    ON public.contactos (organizacion_id);

-- ============================================================================
-- Lead tableros
-- ============================================================================

ALTER TABLE public.lead_tableros
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.lead_tableros
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.lead_tableros
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.lead_tableros
    ADD CONSTRAINT lead_tableros_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_tableros_organizacion_id_idx
    ON public.lead_tableros (organizacion_id);

-- ============================================================================
-- Lead etapas
-- ============================================================================

ALTER TABLE public.lead_etapas
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.lead_etapas le
SET organizacion_id = COALESCE(tab.organizacion_id, '00000000-0000-0000-0000-000000000001')
FROM public.lead_tableros tab
WHERE tab.id = le.tablero_id
  AND le.organizacion_id IS NULL;

ALTER TABLE public.lead_etapas
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.lead_etapas
    ADD CONSTRAINT lead_etapas_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_etapas_organizacion_id_idx
    ON public.lead_etapas (organizacion_id, tablero_id);

-- ============================================================================
-- Lead tarjetas
-- ============================================================================

ALTER TABLE public.lead_tarjetas
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.lead_tarjetas lt
SET organizacion_id = tab.organizacion_id
FROM public.lead_tableros tab
WHERE tab.id = lt.tablero_id
  AND lt.organizacion_id IS NULL
  AND tab.organizacion_id IS NOT NULL;

UPDATE public.lead_tarjetas lt
SET organizacion_id = ct.organizacion_id
FROM public.contactos ct
WHERE ct.id = lt.contacto_id
  AND lt.organizacion_id IS NULL
  AND ct.organizacion_id IS NOT NULL;

ALTER TABLE public.lead_tarjetas
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_tarjetas_organizacion_id_idx
    ON public.lead_tarjetas (organizacion_id, tablero_id, etapa_id);

-- ============================================================================
-- Clientes
-- ============================================================================

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.clientes c
SET organizacion_id = lt.organizacion_id
FROM public.lead_tarjetas lt
WHERE lt.id = c.lead_tarjeta_id
  AND c.organizacion_id IS NULL
  AND lt.organizacion_id IS NOT NULL;

UPDATE public.clientes c
SET organizacion_id = ct.organizacion_id
FROM public.contactos ct
WHERE ct.id = c.contacto_id
  AND c.organizacion_id IS NULL
  AND ct.organizacion_id IS NOT NULL;

UPDATE public.clientes
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.clientes
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS clientes_organizacion_id_idx
    ON public.clientes (organizacion_id);

COMMIT;
