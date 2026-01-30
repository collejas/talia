BEGIN;

-- ============================================================================
-- Platform admins (global, cross-tenant)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id uuid PRIMARY KEY,
    creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS 'Lista de usuarios (auth.uid) con permisos globales sobre todos los tenants.';

-- ============================================================================
-- Channel routing keys (cross-tenant routing)
-- - canal: 'webchat' | 'whatsapp' | 'messenger' | ...
-- - clave: alias / phone / page_id / etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizacion_rutas_canal (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    canal text NOT NULL,
    clave text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizacion_rutas_canal IS 'Mapa de claves externas (alias, números, page_id) hacia organizacion_id.';

ALTER TABLE public.organizacion_rutas_canal
    DROP CONSTRAINT IF EXISTS organizacion_rutas_canal_organizacion_id_fkey;
ALTER TABLE public.organizacion_rutas_canal
    ADD CONSTRAINT organizacion_rutas_canal_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS organizacion_rutas_canal_org_idx
    ON public.organizacion_rutas_canal (organizacion_id);

CREATE UNIQUE INDEX IF NOT EXISTS organizacion_rutas_canal_unique_key
    ON public.organizacion_rutas_canal (canal, lower(clave));

DROP TRIGGER IF EXISTS organizacion_rutas_canal_touch_updated_at ON public.organizacion_rutas_canal;
CREATE TRIGGER organizacion_rutas_canal_touch_updated_at
    BEFORE UPDATE ON public.organizacion_rutas_canal
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Tenant-scoped inserts can infer organizacion_id from app.organizacion_id when used.
DROP TRIGGER IF EXISTS organizacion_rutas_canal_set_org ON public.organizacion_rutas_canal;
CREATE TRIGGER organizacion_rutas_canal_set_org
    BEFORE INSERT ON public.organizacion_rutas_canal
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

COMMIT;

