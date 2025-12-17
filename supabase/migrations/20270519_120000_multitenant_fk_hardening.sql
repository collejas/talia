BEGIN;

-- 1) eventos_auditoria: era la única tabla “de negocio” que seguía sin organizacion_id.
ALTER TABLE public.eventos_auditoria
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- Asegura que RLS aplique (sin esto, las policies no hacen nada).
ALTER TABLE public.eventos_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_auditoria FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='eventos_auditoria_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.eventos_auditoria
            ADD CONSTRAINT eventos_auditoria_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- Backfill: usa la organización del actor si existe.
UPDATE public.eventos_auditoria ea
SET organizacion_id = u.organizacion_id
FROM public.usuarios u
WHERE u.id = ea.actor_usuario_id
  AND ea.organizacion_id <> u.organizacion_id;

-- Trigger específico: prefiere la org del actor_usuario_id (evita que inserts con service role caigan en legacy org).
CREATE OR REPLACE FUNCTION public.tg_set_eventos_auditoria_organizacion_id()
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

    IF NEW.actor_usuario_id IS NOT NULL THEN
        SELECT u.organizacion_id INTO v_org
        FROM public.usuarios u
        WHERE u.id = NEW.actor_usuario_id;
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

DROP TRIGGER IF EXISTS t_eventos_auditoria_set_org ON public.eventos_auditoria;
CREATE TRIGGER t_eventos_auditoria_set_org
    BEFORE INSERT ON public.eventos_auditoria
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_eventos_auditoria_organizacion_id();

-- Endurece policy actor/admin para que sea por tenant.
DROP POLICY IF EXISTS eventos_auditoria_select ON public.eventos_auditoria;
DROP POLICY IF EXISTS eventos_auditoria_insert ON public.eventos_auditoria;
DROP POLICY IF EXISTS eventos_auditoria_update ON public.eventos_auditoria;
DROP POLICY IF EXISTS eventos_auditoria_delete ON public.eventos_auditoria;

CREATE POLICY eventos_auditoria_select
    ON public.eventos_auditoria
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        OR (
            actor_usuario_id = (SELECT auth.uid())
            AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
        )
    );

CREATE POLICY eventos_auditoria_insert
    ON public.eventos_auditoria
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            public.es_admin((SELECT auth.uid()))
            OR actor_usuario_id = (SELECT auth.uid())
        )
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

CREATE POLICY eventos_auditoria_update
    ON public.eventos_auditoria
    FOR UPDATE
    TO authenticated
    USING (
        (
            public.es_admin((SELECT auth.uid()))
            OR actor_usuario_id = (SELECT auth.uid())
        )
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        (
            public.es_admin((SELECT auth.uid()))
            OR actor_usuario_id = (SELECT auth.uid())
        )
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

CREATE POLICY eventos_auditoria_delete
    ON public.eventos_auditoria
    FOR DELETE
    TO authenticated
    USING (
        (
            public.es_admin((SELECT auth.uid()))
            OR actor_usuario_id = (SELECT auth.uid())
        )
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

-- 2) Hardening: FKs que aún apuntaban a (id) sin tenant, en tablas ya tenant-scoped.
-- Requiere índices únicos (organizacion_id, id) que ya se crearon en migraciones previas.

-- conversaciones: asignado_a_usuario_id y ultimo_mensaje_id
ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversations_assigned_to_user_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversaciones_asignado_usuario_org_fkey'
    ) THEN
        ALTER TABLE public.conversaciones
            ADD CONSTRAINT conversaciones_asignado_usuario_org_fkey
            FOREIGN KEY (organizacion_id, asignado_a_usuario_id)
            REFERENCES public.usuarios(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversaciones_ultimo_mensaje_fk;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversaciones_ultimo_mensaje_org_fkey'
    ) THEN
        ALTER TABLE public.conversaciones
            ADD CONSTRAINT conversaciones_ultimo_mensaje_org_fkey
            FOREIGN KEY (organizacion_id, ultimo_mensaje_id)
            REFERENCES public.mensajes(organizacion_id, id)
            ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END
$$;

-- conversation_summaries: contacto_id y creado_por_usuario_id
ALTER TABLE public.conversation_summaries
    DROP CONSTRAINT IF EXISTS conversation_summaries_contacto_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversation_summaries_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.conversation_summaries
            ADD CONSTRAINT conversation_summaries_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

ALTER TABLE public.conversation_summaries
    DROP CONSTRAINT IF EXISTS conversation_summaries_creado_por_usuario_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversation_summaries_creado_por_usuario_org_fkey'
    ) THEN
        ALTER TABLE public.conversation_summaries
            ADD CONSTRAINT conversation_summaries_creado_por_usuario_org_fkey
            FOREIGN KEY (organizacion_id, creado_por_usuario_id)
            REFERENCES public.usuarios(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- usuarios_roles: usuario_id y rol_id deben ser del mismo tenant
ALTER TABLE public.usuarios_roles
    DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.usuarios_roles
    DROP CONSTRAINT IF EXISTS user_roles_role_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='usuarios_roles_usuario_org_fkey'
    ) THEN
        ALTER TABLE public.usuarios_roles
            ADD CONSTRAINT usuarios_roles_usuario_org_fkey
            FOREIGN KEY (organizacion_id, usuario_id)
            REFERENCES public.usuarios(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='usuarios_roles_rol_org_fkey'
    ) THEN
        ALTER TABLE public.usuarios_roles
            ADD CONSTRAINT usuarios_roles_rol_org_fkey
            FOREIGN KEY (organizacion_id, rol_id)
            REFERENCES public.roles(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

COMMIT;
