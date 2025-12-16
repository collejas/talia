BEGIN;

-- 1) Roles por organización (evita que 'admin' sea global por constraint)
ALTER TABLE public.roles
    DROP CONSTRAINT IF EXISTS roles_code_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'roles_organizacion_id_codigo_key'
    ) THEN
        ALTER TABLE public.roles
            ADD CONSTRAINT roles_organizacion_id_codigo_key UNIQUE (organizacion_id, codigo);
    END IF;
END
$$;

-- 2) Admin tenant-aware: exige que el rol 'admin' esté asignado dentro de la misma organizacion_id del usuario
CREATE OR REPLACE FUNCTION public.es_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH org AS (
    SELECT public.usuario_organizacion_id(uid) AS org_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_roles ur
    JOIN public.roles r ON r.id = ur.rol_id
    CROSS JOIN org
    WHERE ur.usuario_id = uid
      AND org.org_id IS NOT NULL
      AND ur.organizacion_id = org.org_id
      AND r.organizacion_id = org.org_id
      AND r.codigo = 'admin'
  );
$$;

-- 3) conversation_summaries: hoy no tiene RLS habilitado en el dump, pero contiene datos por organización.
ALTER TABLE IF EXISTS public.conversation_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_summaries_select ON public.conversation_summaries;
DROP POLICY IF EXISTS conversation_summaries_insert ON public.conversation_summaries;
DROP POLICY IF EXISTS conversation_summaries_update ON public.conversation_summaries;
DROP POLICY IF EXISTS conversation_summaries_delete ON public.conversation_summaries;

CREATE POLICY conversation_summaries_select
    ON public.conversation_summaries
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_conversacion(conversacion_id)
    );

CREATE POLICY conversation_summaries_insert
    ON public.conversation_summaries
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_conversacion(conversacion_id)
    );

CREATE POLICY conversation_summaries_update
    ON public.conversation_summaries
    FOR UPDATE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_conversacion(conversacion_id)
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_conversacion(conversacion_id)
    );

CREATE POLICY conversation_summaries_delete
    ON public.conversation_summaries
    FOR DELETE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_conversacion(conversacion_id)
    );

COMMIT;

