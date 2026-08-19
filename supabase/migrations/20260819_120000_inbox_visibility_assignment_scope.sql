BEGIN;

-- Central authorization predicate for persisted Inbox threads.
-- Sellers see only their own assignments; supervisors see their current
-- team scope through is_in_current_user_scope(); owners/admins keep tenant
-- visibility. Contact/person, account, opportunity and conversation
-- ownership are all considered because a thread may be grouped from more
-- than one conversation and may have been created before assignment data
-- was synchronized to every projection.
CREATE OR REPLACE FUNCTION public.puede_ver_inbox_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH scope AS (
    SELECT
        public.es_admin(auth.uid()) AS es_admin,
        public.es_owner(auth.uid()) AS es_owner,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
), thread AS (
    SELECT t.*
    FROM public.inbox_threads t
    WHERE t.id = p_thread_id
), canonical AS (
    SELECT
        t.id AS thread_id,
        t.organizacion_id,
        t.asignado_a_usuario_id AS thread_assignee_id,
        t.persona_id AS thread_persona_id,
        t.cuenta_id AS thread_cuenta_id,
        c.id AS conversacion_id,
        c.asignado_a_usuario_id AS conversation_assignee_id,
        c.persona_id AS conversation_persona_id,
        c.contacto_id AS conversation_contacto_id,
        ct.propietario_usuario_id AS contacto_owner_id
    FROM thread t
    LEFT JOIN public.conversaciones c
      ON c.id = t.conversacion_canonica_id
    LEFT JOIN public.contactos ct
      ON ct.id = c.contacto_id
), person_scope AS (
    SELECT DISTINCT
        x.thread_id,
        p.propietario_usuario_id
    FROM canonical x
    JOIN public.personas p
      ON p.organizacion_id = x.organizacion_id
     AND p.id = COALESCE(x.thread_persona_id, x.conversation_persona_id, x.conversation_contacto_id)
), account_scope AS (
    SELECT DISTINCT
        x.thread_id,
        a.propietario_usuario_id
    FROM canonical x
    JOIN public.cuentas a
      ON a.organizacion_id = x.organizacion_id
     AND a.id = x.thread_cuenta_id
), opportunity_scope AS (
    SELECT DISTINCT
        x.thread_id,
        o.asignado_a_usuario_id,
        o.propietario_usuario_id
    FROM canonical x
    JOIN public.oportunidades o
      ON o.organizacion_id = x.organizacion_id
     AND (
            o.persona_id = COALESCE(x.thread_persona_id, x.conversation_persona_id, x.conversation_contacto_id)
         OR o.contacto_principal_id = COALESCE(x.thread_persona_id, x.conversation_persona_id, x.conversation_contacto_id)
         OR o.cuenta_id = x.thread_cuenta_id
     )
)
SELECT EXISTS (
    SELECT 1
    FROM canonical x
    CROSS JOIN scope s
    WHERE x.thread_id IS NOT NULL
      AND x.organizacion_id = s.organizacion_id
      AND (
            s.es_admin
        OR  s.es_owner
        OR  public.is_in_current_user_scope(x.thread_assignee_id)
        OR  public.is_in_current_user_scope(x.conversation_assignee_id)
        OR  public.is_in_current_user_scope(x.contacto_owner_id)
        OR  EXISTS (
                SELECT 1
                FROM person_scope ps
                WHERE ps.thread_id = x.thread_id
                  AND public.is_in_current_user_scope(ps.propietario_usuario_id)
            )
        OR  EXISTS (
                SELECT 1
                FROM account_scope ac
                WHERE ac.thread_id = x.thread_id
                  AND public.is_in_current_user_scope(ac.propietario_usuario_id)
            )
        OR  EXISTS (
                SELECT 1
                FROM opportunity_scope os
                WHERE os.thread_id = x.thread_id
                  AND (
                        public.is_in_current_user_scope(os.asignado_a_usuario_id)
                     OR public.is_in_current_user_scope(os.propietario_usuario_id)
                  )
            )
      )
);
$$;

COMMENT ON FUNCTION public.puede_ver_inbox_thread(uuid)
IS 'Autoriza Inbox por tenant y alcance de asignación del usuario autenticado.';

-- Preserve the currently deployed RPC body and add the authorization gate
-- before filtering/pagination. The guard makes this migration compatible
-- with the later Inbox source/date/unread enhancements already deployed.
DO $$
DECLARE
    function_def text;
    replaced_def text;
BEGIN
    SELECT pg_get_functiondef(p.oid)
      INTO function_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'panel_inbox_threads_persisted'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_estado text, p_asignado uuid, p_limit integer, p_offset integer, p_message_limit integer, p_source text, p_channel text, p_batch_id uuid, p_campana_id uuid, p_from timestamp with time zone, p_to timestamp with time zone';

    IF function_def IS NULL THEN
        RAISE EXCEPTION 'No se encontró panel_inbox_threads_persisted';
    END IF;

    replaced_def := replace(
        function_def,
        'where t.organizacion_id = public.usuario_organizacion_id((select auth.uid()))',
        'where t.organizacion_id = public.usuario_organizacion_id((select auth.uid()))' || E'\n' ||
        '    and public.puede_ver_inbox_thread(t.id)'
    );

    IF replaced_def = function_def THEN
        RAISE EXCEPTION 'No se encontró el filtro base esperado en panel_inbox_threads_persisted';
    END IF;

    EXECUTE replaced_def;
END;
$$;

-- The summary must reflect the same authorized set; otherwise badges and
-- totals still disclose other sellers' Inbox activity.
DO $$
DECLARE
    function_def text;
    replaced_def text;
BEGIN
    SELECT pg_get_functiondef(p.oid)
      INTO function_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'panel_inbox_resumen_persisted'
      AND pg_get_function_identity_arguments(p.oid) = '';

    IF function_def IS NULL THEN
        RAISE EXCEPTION 'No se encontró panel_inbox_resumen_persisted';
    END IF;

    replaced_def := replace(
        function_def,
        'WHERE organizacion_id=public.usuario_organizacion_id((SELECT auth.uid()))',
        'WHERE organizacion_id=public.usuario_organizacion_id((SELECT auth.uid()))' || E'\n' ||
        '   AND public.puede_ver_inbox_thread(id)'
    );

    IF replaced_def = function_def THEN
        RAISE EXCEPTION 'No se encontró el filtro base esperado en panel_inbox_resumen_persisted';
    END IF;

    EXECUTE replaced_def;
END;
$$;

-- Filter options can reveal campaign/batch context from conversations the
-- seller is not allowed to see, so apply the same predicate there too.
DO $$
DECLARE
    function_def text;
    replaced_def text;
BEGIN
    SELECT pg_get_functiondef(p.oid)
      INTO function_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'panel_inbox_filter_options_persisted'
      AND pg_get_function_identity_arguments(p.oid) = 'p_source text, p_channel text';

    IF function_def IS NULL THEN
        RAISE EXCEPTION 'No se encontró panel_inbox_filter_options_persisted';
    END IF;

    replaced_def := replace(
        function_def,
        'where t.organizacion_id=public.usuario_organizacion_id((select auth.uid()))',
        'where t.organizacion_id=public.usuario_organizacion_id((select auth.uid()))' || E'\n' ||
        '    and public.puede_ver_inbox_thread(t.id)'
    );

    IF replaced_def = function_def THEN
        RAISE EXCEPTION 'No se encontró el filtro base esperado en panel_inbox_filter_options_persisted';
    END IF;

    EXECUTE replaced_def;
END;
$$;

-- Direct message reads already call puede_ver_conversacion. Extend that
-- predicate to cover the same ownership dimensions when conversation
-- assignment is stale or absent.
CREATE OR REPLACE FUNCTION public.puede_ver_conversacion(p_conversacion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH scope AS (
    SELECT
        public.es_admin(auth.uid()) AS es_admin,
        public.es_owner(auth.uid()) AS es_owner,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
), conversation AS (
    SELECT
        c.id,
        c.organizacion_id,
        c.asignado_a_usuario_id,
        c.persona_id,
        c.contacto_id,
        ct.propietario_usuario_id AS contacto_owner_id,
        ct.cuenta_id AS contacto_cuenta_id
    FROM public.conversaciones c
    LEFT JOIN public.contactos ct ON ct.id = c.contacto_id
    WHERE c.id = p_conversacion_id
), candidate AS (
    SELECT
        c.*,
        COALESCE(c.persona_id, c.contacto_id) AS candidate_persona_id
    FROM conversation c
), opportunities AS (
    SELECT o.asignado_a_usuario_id, o.propietario_usuario_id
    FROM candidate c
    JOIN public.oportunidades o
      ON o.organizacion_id = c.organizacion_id
     AND (
            o.persona_id = c.candidate_persona_id
         OR o.contacto_principal_id = c.candidate_persona_id
         OR o.cuenta_id = c.contacto_cuenta_id
     )
)
SELECT EXISTS (
    SELECT 1
    FROM candidate c
    CROSS JOIN scope s
    WHERE c.id IS NOT NULL
      AND c.organizacion_id = s.organizacion_id
      AND (
            s.es_admin
        OR  s.es_owner
        OR  public.is_in_current_user_scope(c.asignado_a_usuario_id)
        OR  public.is_in_current_user_scope(c.contacto_owner_id)
        OR  EXISTS (
                SELECT 1
                FROM public.personas p
                WHERE p.id = c.candidate_persona_id
                  AND p.organizacion_id = c.organizacion_id
                  AND public.is_in_current_user_scope(p.propietario_usuario_id)
            )
        OR  EXISTS (
                SELECT 1
                FROM public.cuentas a
                WHERE a.id = c.contacto_cuenta_id
                  AND a.organizacion_id = c.organizacion_id
                  AND public.is_in_current_user_scope(a.propietario_usuario_id)
            )
        OR  EXISTS (
                SELECT 1
                FROM opportunities o
                WHERE public.is_in_current_user_scope(o.asignado_a_usuario_id)
                   OR public.is_in_current_user_scope(o.propietario_usuario_id)
            )
      )
);
$$;

REVOKE ALL ON FUNCTION public.puede_ver_inbox_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_inbox_thread(uuid) TO authenticated, service_role;

COMMIT;
