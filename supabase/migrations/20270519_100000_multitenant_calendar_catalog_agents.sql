BEGIN;

-- Todas estas tablas pasan a ser tenant-scoped vía organizacion_id.
-- Nota: usamos el org legacy '000...0001' como default para datos existentes.

-- ===============
-- Calendario
-- ===============

ALTER TABLE IF EXISTS public.calendar_resources
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_resources_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.calendar_resources
            ADD CONSTRAINT calendar_resources_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.calendar_availability_patterns
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_availability_patterns_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.calendar_availability_patterns
            ADD CONSTRAINT calendar_availability_patterns_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.calendar_exceptions
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_exceptions_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.calendar_exceptions
            ADD CONSTRAINT calendar_exceptions_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.calendar_slot_holds
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_slot_holds_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.calendar_slot_holds
            ADD CONSTRAINT calendar_slot_holds_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- Necesario para FKs compuestas (organizacion_id, id)
CREATE UNIQUE INDEX IF NOT EXISTS calendar_slot_holds_org_id_id_key
    ON public.calendar_slot_holds (organizacion_id, id);

ALTER TABLE IF EXISTS public.calendar_bookings
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_bookings_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.calendar_bookings
            ADD CONSTRAINT calendar_bookings_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- Uniques por tenant
ALTER TABLE IF EXISTS public.calendar_resources
    DROP CONSTRAINT IF EXISTS calendar_resources_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_resources_organizacion_slug_key
    ON public.calendar_resources (organizacion_id, slug);

-- Strong FKs (evita cruces entre tenants)
CREATE UNIQUE INDEX IF NOT EXISTS calendar_resources_org_id_id_key
    ON public.calendar_resources (organizacion_id, id);

ALTER TABLE IF EXISTS public.calendar_availability_patterns
    DROP CONSTRAINT IF EXISTS calendar_availability_patterns_resource_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_availability_patterns_resource_org_fkey'
    ) THEN
        ALTER TABLE public.calendar_availability_patterns
            ADD CONSTRAINT calendar_availability_patterns_resource_org_fkey
            FOREIGN KEY (organizacion_id, resource_id)
            REFERENCES public.calendar_resources(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.calendar_exceptions
    DROP CONSTRAINT IF EXISTS calendar_exceptions_resource_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_exceptions_resource_org_fkey'
    ) THEN
        ALTER TABLE public.calendar_exceptions
            ADD CONSTRAINT calendar_exceptions_resource_org_fkey
            FOREIGN KEY (organizacion_id, resource_id)
            REFERENCES public.calendar_resources(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.calendar_slot_holds
    DROP CONSTRAINT IF EXISTS calendar_slot_holds_resource_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_slot_holds_resource_org_fkey'
    ) THEN
        ALTER TABLE public.calendar_slot_holds
            ADD CONSTRAINT calendar_slot_holds_resource_org_fkey
            FOREIGN KEY (organizacion_id, resource_id)
            REFERENCES public.calendar_resources(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.calendar_bookings
    DROP CONSTRAINT IF EXISTS calendar_bookings_resource_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_bookings_resource_org_fkey'
    ) THEN
        ALTER TABLE public.calendar_bookings
            ADD CONSTRAINT calendar_bookings_resource_org_fkey
            FOREIGN KEY (organizacion_id, resource_id)
            REFERENCES public.calendar_resources(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- hold_id es opcional, pero si existe, debe ser del mismo tenant
ALTER TABLE IF EXISTS public.calendar_bookings
    DROP CONSTRAINT IF EXISTS calendar_bookings_hold_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'calendar_bookings_hold_org_fkey'
    ) THEN
        ALTER TABLE public.calendar_bookings
            ADD CONSTRAINT calendar_bookings_hold_org_fkey
            FOREIGN KEY (organizacion_id, hold_id)
            REFERENCES public.calendar_slot_holds(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- Índices típicos para RLS + queries por tenant
CREATE INDEX IF NOT EXISTS calendar_resources_org_idx
    ON public.calendar_resources (organizacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calendar_availability_patterns_org_resource_idx
    ON public.calendar_availability_patterns (organizacion_id, resource_id);
CREATE INDEX IF NOT EXISTS calendar_exceptions_org_resource_idx
    ON public.calendar_exceptions (organizacion_id, resource_id, start_at);
CREATE INDEX IF NOT EXISTS calendar_slot_holds_org_resource_idx
    ON public.calendar_slot_holds (organizacion_id, resource_id, start_at);
CREATE INDEX IF NOT EXISTS calendar_bookings_org_resource_idx
    ON public.calendar_bookings (organizacion_id, resource_id, start_at);

-- Triggers para poblar organizacion_id en INSERT
DO $$
DECLARE
    tables text[] := ARRAY[
        'calendar_resources',
        'calendar_availability_patterns',
        'calendar_exceptions',
        'calendar_slot_holds',
        'calendar_bookings'
    ];
    tbl text;
    trigger_name text;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        trigger_name := format('t_%s_set_org', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, tbl);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id()',
            trigger_name,
            tbl
        );
    END LOOP;
END;
$$;

-- RLS (tenant-scoped)
ALTER TABLE IF EXISTS public.calendar_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calendar_availability_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calendar_slot_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calendar_bookings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_resources FROM anon;
REVOKE ALL ON public.calendar_availability_patterns FROM anon;
REVOKE ALL ON public.calendar_exceptions FROM anon;
REVOKE ALL ON public.calendar_slot_holds FROM anon;
REVOKE ALL ON public.calendar_bookings FROM anon;

DROP POLICY IF EXISTS calendar_resources_select_authenticated ON public.calendar_resources;
DROP POLICY IF EXISTS calendar_availability_patterns_select_authenticated ON public.calendar_availability_patterns;
DROP POLICY IF EXISTS calendar_exceptions_select_authenticated ON public.calendar_exceptions;
DROP POLICY IF EXISTS calendar_slot_holds_select_authenticated ON public.calendar_slot_holds;
DROP POLICY IF EXISTS calendar_bookings_select_authenticated ON public.calendar_bookings;

DROP POLICY IF EXISTS calendar_resources_admin_all ON public.calendar_resources;
DROP POLICY IF EXISTS calendar_resources_member_org ON public.calendar_resources;
DROP POLICY IF EXISTS calendar_availability_patterns_admin_all ON public.calendar_availability_patterns;
DROP POLICY IF EXISTS calendar_availability_patterns_member_org ON public.calendar_availability_patterns;
DROP POLICY IF EXISTS calendar_exceptions_admin_all ON public.calendar_exceptions;
DROP POLICY IF EXISTS calendar_exceptions_member_org ON public.calendar_exceptions;
DROP POLICY IF EXISTS calendar_slot_holds_admin_all ON public.calendar_slot_holds;
DROP POLICY IF EXISTS calendar_slot_holds_member_org ON public.calendar_slot_holds;
DROP POLICY IF EXISTS calendar_bookings_admin_all ON public.calendar_bookings;
DROP POLICY IF EXISTS calendar_bookings_member_org ON public.calendar_bookings;

CREATE POLICY calendar_resources_admin_all
    ON public.calendar_resources
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY calendar_resources_member_org
    ON public.calendar_resources
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY calendar_availability_patterns_admin_all
    ON public.calendar_availability_patterns
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY calendar_availability_patterns_member_org
    ON public.calendar_availability_patterns
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY calendar_exceptions_admin_all
    ON public.calendar_exceptions
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY calendar_exceptions_member_org
    ON public.calendar_exceptions
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY calendar_slot_holds_admin_all
    ON public.calendar_slot_holds
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY calendar_slot_holds_member_org
    ON public.calendar_slot_holds
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY calendar_bookings_admin_all
    ON public.calendar_bookings
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY calendar_bookings_member_org
    ON public.calendar_bookings
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

-- ===============
-- Catálogo (catalog_*)
-- ===============

ALTER TABLE IF EXISTS public.catalog_items
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'catalog_items_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.catalog_items
            ADD CONSTRAINT catalog_items_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.catalog_tags
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'catalog_tags_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.catalog_tags
            ADD CONSTRAINT catalog_tags_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.catalog_item_prices
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'catalog_item_prices_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.catalog_item_prices
            ADD CONSTRAINT catalog_item_prices_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.catalog_item_tags
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'catalog_item_tags_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.catalog_item_tags
            ADD CONSTRAINT catalog_item_tags_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- Uniques por tenant
ALTER TABLE IF EXISTS public.catalog_items
    DROP CONSTRAINT IF EXISTS catalog_items_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_organizacion_slug_key
    ON public.catalog_items (organizacion_id, slug)
    WHERE slug IS NOT NULL;

ALTER TABLE IF EXISTS public.catalog_tags
    DROP CONSTRAINT IF EXISTS catalog_tags_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_tags_organizacion_slug_key
    ON public.catalog_tags (organizacion_id, slug);

-- Strong FKs
CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_org_id_id_key
    ON public.catalog_items (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_tags_org_id_id_key
    ON public.catalog_tags (organizacion_id, id);

ALTER TABLE IF EXISTS public.catalog_item_prices
    DROP CONSTRAINT IF EXISTS catalog_item_prices_item_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'catalog_item_prices_item_org_fkey'
    ) THEN
        ALTER TABLE public.catalog_item_prices
            ADD CONSTRAINT catalog_item_prices_item_org_fkey
            FOREIGN KEY (organizacion_id, item_id)
            REFERENCES public.catalog_items(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.catalog_item_tags
    DROP CONSTRAINT IF EXISTS catalog_item_tags_item_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'catalog_item_tags_item_org_fkey'
    ) THEN
        ALTER TABLE public.catalog_item_tags
            ADD CONSTRAINT catalog_item_tags_item_org_fkey
            FOREIGN KEY (organizacion_id, item_id)
            REFERENCES public.catalog_items(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.catalog_item_tags
    DROP CONSTRAINT IF EXISTS catalog_item_tags_tag_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'catalog_item_tags_tag_org_fkey'
    ) THEN
        ALTER TABLE public.catalog_item_tags
            ADD CONSTRAINT catalog_item_tags_tag_org_fkey
            FOREIGN KEY (organizacion_id, tag_id)
            REFERENCES public.catalog_tags(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- Ajuste del índice "principal" para que sea por tenant
DROP INDEX IF EXISTS public.catalog_item_prices_principal_idx;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_item_prices_principal_org_idx
    ON public.catalog_item_prices (organizacion_id, item_id, moneda)
    WHERE es_principal;

CREATE INDEX IF NOT EXISTS catalog_items_org_idx
    ON public.catalog_items (organizacion_id, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS catalog_tags_org_idx
    ON public.catalog_tags (organizacion_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS catalog_item_prices_org_item_idx
    ON public.catalog_item_prices (organizacion_id, item_id, creado_en DESC);

-- Triggers set_org
DO $$
DECLARE
    tables text[] := ARRAY[
        'catalog_items',
        'catalog_tags',
        'catalog_item_prices',
        'catalog_item_tags'
    ];
    tbl text;
    trigger_name text;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        trigger_name := format('t_%s_set_org', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, tbl);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id()',
            trigger_name,
            tbl
        );
    END LOOP;
END;
$$;

-- RLS (tenant-scoped)
ALTER TABLE IF EXISTS public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.catalog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.catalog_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.catalog_item_tags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catalog_items FROM anon;
REVOKE ALL ON public.catalog_tags FROM anon;
REVOKE ALL ON public.catalog_item_prices FROM anon;
REVOKE ALL ON public.catalog_item_tags FROM anon;

-- Políticas actuales usan USING(true); se reemplazan por tenant-scoped.
DROP POLICY IF EXISTS catalog_items_select ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_insert_admin ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_update_admin ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_delete_admin ON public.catalog_items;

DROP POLICY IF EXISTS catalog_item_prices_select ON public.catalog_item_prices;
DROP POLICY IF EXISTS catalog_item_prices_insert_admin ON public.catalog_item_prices;
DROP POLICY IF EXISTS catalog_item_prices_update_admin ON public.catalog_item_prices;
DROP POLICY IF EXISTS catalog_item_prices_delete_admin ON public.catalog_item_prices;

DROP POLICY IF EXISTS catalog_item_tags_select ON public.catalog_item_tags;
DROP POLICY IF EXISTS catalog_tags_select ON public.catalog_tags;

DROP POLICY IF EXISTS catalog_items_admin_all ON public.catalog_items;
DROP POLICY IF EXISTS catalog_items_member_org ON public.catalog_items;
DROP POLICY IF EXISTS catalog_item_prices_admin_all ON public.catalog_item_prices;
DROP POLICY IF EXISTS catalog_item_prices_member_org ON public.catalog_item_prices;
DROP POLICY IF EXISTS catalog_tags_admin_all ON public.catalog_tags;
DROP POLICY IF EXISTS catalog_tags_member_org ON public.catalog_tags;
DROP POLICY IF EXISTS catalog_item_tags_admin_all ON public.catalog_item_tags;
DROP POLICY IF EXISTS catalog_item_tags_member_org ON public.catalog_item_tags;

CREATE POLICY catalog_items_admin_all
    ON public.catalog_items
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_items_member_org
    ON public.catalog_items
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY catalog_tags_admin_all
    ON public.catalog_tags
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_tags_member_org
    ON public.catalog_tags
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY catalog_item_prices_admin_all
    ON public.catalog_item_prices
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_item_prices_member_org
    ON public.catalog_item_prices
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY catalog_item_tags_admin_all
    ON public.catalog_item_tags
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_item_tags_member_org
    ON public.catalog_item_tags
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

-- ===============
-- Agentes / Prompts / Custom fields
-- ===============

ALTER TABLE IF EXISTS public.agentes
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'agentes_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.agentes
            ADD CONSTRAINT agentes_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.prompts
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'prompts_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.prompts
            ADD CONSTRAINT prompts_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.prompt_versions
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'prompt_versions_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.prompt_versions
            ADD CONSTRAINT prompt_versions_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.prompt_bindings
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'prompt_bindings_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.prompt_bindings
            ADD CONSTRAINT prompt_bindings_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.custom_fields
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'custom_fields_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.custom_fields
            ADD CONSTRAINT custom_fields_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- Uniques por tenant (slug / etc.)
CREATE UNIQUE INDEX IF NOT EXISTS agentes_org_id_id_key
    ON public.agentes (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS prompts_org_id_id_key
    ON public.prompts (organizacion_id, id);

-- prompts "nombre" suele ser humano; si quieres unicidad por org, descomenta:
-- CREATE UNIQUE INDEX IF NOT EXISTS prompts_organizacion_nombre_key ON public.prompts (organizacion_id, lower(nombre));

-- Strong FKs
ALTER TABLE IF EXISTS public.prompt_versions
    DROP CONSTRAINT IF EXISTS prompt_versions_prompt_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'prompt_versions_prompt_org_fkey'
    ) THEN
        ALTER TABLE public.prompt_versions
            ADD CONSTRAINT prompt_versions_prompt_org_fkey
            FOREIGN KEY (organizacion_id, prompt_id)
            REFERENCES public.prompts(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.prompt_bindings
    DROP CONSTRAINT IF EXISTS prompt_bindings_agente_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'prompt_bindings_agente_org_fkey'
    ) THEN
        ALTER TABLE public.prompt_bindings
            ADD CONSTRAINT prompt_bindings_agente_org_fkey
            FOREIGN KEY (organizacion_id, agente_id)
            REFERENCES public.agentes(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.prompt_bindings
    DROP CONSTRAINT IF EXISTS prompt_bindings_prompt_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'prompt_bindings_prompt_org_fkey'
    ) THEN
        ALTER TABLE public.prompt_bindings
            ADD CONSTRAINT prompt_bindings_prompt_org_fkey
            FOREIGN KEY (organizacion_id, prompt_id)
            REFERENCES public.prompts(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE IF EXISTS public.custom_fields
    DROP CONSTRAINT IF EXISTS custom_fields_agente_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'custom_fields_agente_org_fkey'
    ) THEN
        ALTER TABLE public.custom_fields
            ADD CONSTRAINT custom_fields_agente_org_fkey
            FOREIGN KEY (organizacion_id, agente_id)
            REFERENCES public.agentes(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS agentes_org_idx
    ON public.agentes (organizacion_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS prompts_org_idx
    ON public.prompts (organizacion_id, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS prompt_versions_org_prompt_idx
    ON public.prompt_versions (organizacion_id, prompt_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS prompt_bindings_org_agente_idx
    ON public.prompt_bindings (organizacion_id, agente_id);
CREATE INDEX IF NOT EXISTS custom_fields_org_agente_idx
    ON public.custom_fields (organizacion_id, agente_id);

-- Triggers set_org
DO $$
DECLARE
    tables text[] := ARRAY[
        'agentes',
        'prompts',
        'prompt_versions',
        'prompt_bindings',
        'custom_fields'
    ];
    tbl text;
    trigger_name text;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        trigger_name := format('t_%s_set_org', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, tbl);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id()',
            trigger_name,
            tbl
        );
    END LOOP;
END;
$$;

-- RLS tenant-scoped (reemplaza USING(true))
ALTER TABLE IF EXISTS public.agentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prompt_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.custom_fields ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agentes FROM anon;
REVOKE ALL ON public.prompts FROM anon;
REVOKE ALL ON public.prompt_versions FROM anon;
REVOKE ALL ON public.prompt_bindings FROM anon;
REVOKE ALL ON public.custom_fields FROM anon;

DROP POLICY IF EXISTS agentes_select_authenticated ON public.agentes;
DROP POLICY IF EXISTS prompts_select_authenticated ON public.prompts;
DROP POLICY IF EXISTS prompt_versions_select_authenticated ON public.prompt_versions;
DROP POLICY IF EXISTS prompt_bindings_select_authenticated ON public.prompt_bindings;
DROP POLICY IF EXISTS custom_fields_select_authenticated ON public.custom_fields;

DROP POLICY IF EXISTS agentes_admin_all ON public.agentes;
DROP POLICY IF EXISTS agentes_member_org ON public.agentes;
DROP POLICY IF EXISTS prompts_admin_all ON public.prompts;
DROP POLICY IF EXISTS prompts_member_org ON public.prompts;
DROP POLICY IF EXISTS prompt_versions_admin_all ON public.prompt_versions;
DROP POLICY IF EXISTS prompt_versions_member_org ON public.prompt_versions;
DROP POLICY IF EXISTS prompt_bindings_admin_all ON public.prompt_bindings;
DROP POLICY IF EXISTS prompt_bindings_member_org ON public.prompt_bindings;
DROP POLICY IF EXISTS custom_fields_admin_all ON public.custom_fields;
DROP POLICY IF EXISTS custom_fields_member_org ON public.custom_fields;

CREATE POLICY agentes_admin_all
    ON public.agentes
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY agentes_member_org
    ON public.agentes
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY prompts_admin_all
    ON public.prompts
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY prompts_member_org
    ON public.prompts
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY prompt_versions_admin_all
    ON public.prompt_versions
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY prompt_versions_member_org
    ON public.prompt_versions
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY prompt_bindings_admin_all
    ON public.prompt_bindings
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY prompt_bindings_member_org
    ON public.prompt_bindings
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY custom_fields_admin_all
    ON public.custom_fields
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY custom_fields_member_org
    ON public.custom_fields
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

-- ===============
-- Fix: slugs globales que ya son tenant-scoped (evita colisiones entre tenants)
-- ===============

-- prospeccion_contacto_templates tiene organizacion_id pero UNIQUE(slug) global.
ALTER TABLE IF EXISTS public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_slug_key
    ON public.prospeccion_contacto_templates (organizacion_id, slug);

COMMIT;
