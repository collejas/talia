BEGIN;

CREATE OR REPLACE FUNCTION public.puede_ver_contacto(p_contacto_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
contacto AS (
    SELECT
        c.id,
        c.propietario_usuario_id,
        c.organizacion_id
    FROM public.contactos c
    WHERE c.id = p_contacto_id
)
SELECT EXISTS (
    SELECT 1
    FROM contacto c
    CROSS JOIN scope s
    WHERE c.id IS NOT NULL
      AND (
            s.es_admin
        OR  c.propietario_usuario_id = s.uid
        OR (c.organizacion_id IS NOT NULL AND c.organizacion_id = s.organizacion_id)
      )
);
$$;

COMMIT;
