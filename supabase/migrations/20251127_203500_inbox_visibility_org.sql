BEGIN;

CREATE OR REPLACE FUNCTION public.puede_ver_conversacion(p_conversacion_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
conversation AS (
    SELECT
        c.id,
        c.asignado_a_usuario_id,
        ct.propietario_usuario_id,
        ct.organizacion_id
    FROM public.conversaciones c
    LEFT JOIN public.contactos ct ON ct.id = c.contacto_id
    WHERE c.id = p_conversacion_id
)
SELECT EXISTS (
    SELECT 1
    FROM conversation c
    CROSS JOIN scope s
    WHERE c.id IS NOT NULL
      AND (
            s.es_admin
        OR  c.asignado_a_usuario_id = s.uid
        OR  c.propietario_usuario_id = s.uid
        OR (c.organizacion_id IS NOT NULL AND c.organizacion_id = s.organizacion_id)
      )
);
$$;

COMMIT;
