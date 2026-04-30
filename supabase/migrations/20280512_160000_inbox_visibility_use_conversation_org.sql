BEGIN;

CREATE OR REPLACE FUNCTION public.puede_ver_conversacion(p_conversacion_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.es_owner(auth.uid()) AS es_owner,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
conversation AS (
    SELECT
        c.id,
        c.asignado_a_usuario_id,
        c.organizacion_id AS conversation_organizacion_id,
        ct.propietario_usuario_id,
        ct.organizacion_id AS contacto_organizacion_id
    FROM public.conversaciones c
    LEFT JOIN public.contactos ct ON ct.id = c.contacto_id
    WHERE c.id = p_conversacion_id
)
SELECT EXISTS (
    SELECT 1
    FROM conversation c
    CROSS JOIN scope s
    WHERE c.id IS NOT NULL
      AND COALESCE(c.conversation_organizacion_id, c.contacto_organizacion_id) = s.organizacion_id
      AND (
            s.es_admin
        OR  s.es_owner
        OR  public.is_in_current_user_scope(c.asignado_a_usuario_id)
        OR  public.is_in_current_user_scope(c.propietario_usuario_id)
      )
);
$$;

COMMIT;
