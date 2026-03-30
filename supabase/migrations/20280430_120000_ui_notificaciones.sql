BEGIN;

CREATE TABLE IF NOT EXISTS public.ui_notificaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo text NOT NULL,
    categoria text,
    nivel text NOT NULL,
    titulo text,
    mensaje text NOT NULL,
    entity_kind text,
    entity_id text,
    action_label text,
    action_href text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key text,
    agrupacion_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    hidden_at timestamptz,
    expires_at timestamptz,
    toast_shown_at timestamptz,
    CONSTRAINT ui_notificaciones_nivel_check
        CHECK (nivel IN ('success', 'info', 'warning', 'error')),
    CONSTRAINT ui_notificaciones_tipo_nonempty_check
        CHECK (btrim(tipo) <> ''),
    CONSTRAINT ui_notificaciones_mensaje_nonempty_check
        CHECK (btrim(mensaje) <> ''),
    CONSTRAINT ui_notificaciones_action_pair_check
        CHECK (
            (action_label IS NULL AND action_href IS NULL)
            OR (NULLIF(btrim(action_label), '') IS NOT NULL AND NULLIF(btrim(action_href), '') IS NOT NULL)
        )
);

COMMENT ON TABLE public.ui_notificaciones IS 'Centro persistente de notificaciones de UI por usuario. Fuente de verdad para inbox, no leidas y toasts globales.';
COMMENT ON COLUMN public.ui_notificaciones.tipo IS 'Tipo canonico del evento, por ejemplo scraper.finished o lookup.finished.';
COMMENT ON COLUMN public.ui_notificaciones.categoria IS 'Categoria funcional para agrupar en el centro de notificaciones.';
COMMENT ON COLUMN public.ui_notificaciones.payload IS 'Metadata arbitraria serializada para render y navegacion contextual.';
COMMENT ON COLUMN public.ui_notificaciones.dedupe_key IS 'Clave opcional para evitar duplicados logicos por usuario.';
COMMENT ON COLUMN public.ui_notificaciones.agrupacion_key IS 'Clave opcional para resumir lotes o familias de eventos en frontend/backend.';
COMMENT ON COLUMN public.ui_notificaciones.toast_shown_at IS 'Momento en que el frontend mostro el toast asociado, si aplica.';

CREATE INDEX IF NOT EXISTS ui_notificaciones_usuario_created_idx
    ON public.ui_notificaciones (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ui_notificaciones_usuario_unread_idx
    ON public.ui_notificaciones (usuario_id, created_at DESC)
    WHERE read_at IS NULL AND hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS ui_notificaciones_usuario_tipo_created_idx
    ON public.ui_notificaciones (usuario_id, tipo, created_at DESC);

CREATE INDEX IF NOT EXISTS ui_notificaciones_org_created_idx
    ON public.ui_notificaciones (organizacion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ui_notificaciones_entity_idx
    ON public.ui_notificaciones (entity_kind, entity_id)
    WHERE entity_kind IS NOT NULL AND entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ui_notificaciones_expires_idx
    ON public.ui_notificaciones (expires_at)
    WHERE expires_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ui_notificaciones_usuario_dedupe_key_uidx
    ON public.ui_notificaciones (usuario_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

DROP TRIGGER IF EXISTS ui_notificaciones_set_org_trg ON public.ui_notificaciones;
CREATE TRIGGER ui_notificaciones_set_org_trg
BEFORE INSERT ON public.ui_notificaciones
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS ui_notificaciones_touch_updated_at ON public.ui_notificaciones;
CREATE TRIGGER ui_notificaciones_touch_updated_at
BEFORE UPDATE ON public.ui_notificaciones
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.ui_notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_notificaciones FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ui_notificaciones_service_all ON public.ui_notificaciones;
CREATE POLICY ui_notificaciones_service_all
    ON public.ui_notificaciones
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS ui_notificaciones_member_own_select ON public.ui_notificaciones;
CREATE POLICY ui_notificaciones_member_own_select
    ON public.ui_notificaciones
    FOR SELECT
    TO authenticated
    USING (
        usuario_id = auth.uid()
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

COMMENT ON POLICY ui_notificaciones_member_own_select ON public.ui_notificaciones IS
    'Permite lectura directa unicamente de notificaciones propias dentro del tenant actual.';

REVOKE ALL ON TABLE public.ui_notificaciones FROM anon;
GRANT SELECT ON TABLE public.ui_notificaciones TO authenticated;

COMMIT;
