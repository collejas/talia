BEGIN;

DO $$
DECLARE
    v_org record;
    v_perm_code text;
BEGIN
    FOR v_org IN
        SELECT id
        FROM public.organizaciones
    LOOP
        FOREACH v_perm_code IN ARRAY ARRAY[
            'contacts.view_sensitive_unowned',
            'accounts.view_sensitive_unowned',
            'contacts.export_csv'
        ]
        LOOP
            INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
            SELECT v_org.id, v_perm_code, v_perm_code
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.permisos p
                WHERE p.organizacion_id = v_org.id
                  AND lower(p.codigo) = lower(v_perm_code)
            );
        END LOOP;
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.can_view_contact_sensitive_fields(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
WITH ctx AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.es_owner(auth.uid()) AS es_owner,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
persona AS (
    SELECT
        p.id,
        p.organizacion_id,
        p.propietario_usuario_id
    FROM public.personas p
    WHERE p.id = p_persona_id
)
SELECT EXISTS (
    SELECT 1
    FROM persona p
    CROSS JOIN ctx c
    WHERE p.organizacion_id = c.organizacion_id
      AND (
            c.es_admin
        OR  c.es_owner
        OR  (
                p.propietario_usuario_id IS NOT NULL
            AND auth.uid() IS NOT NULL
            AND p.propietario_usuario_id = auth.uid()
            )
        OR  public.current_user_has_perm('contacts.view_sensitive_unowned')
      )
);
$function$;

CREATE OR REPLACE FUNCTION public.can_view_account_sensitive_fields(p_cuenta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
WITH ctx AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.es_owner(auth.uid()) AS es_owner,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
cuenta AS (
    SELECT
        c.id,
        c.organizacion_id,
        c.propietario_usuario_id
    FROM public.cuentas c
    WHERE c.id = p_cuenta_id
)
SELECT EXISTS (
    SELECT 1
    FROM cuenta c
    CROSS JOIN ctx s
    WHERE c.organizacion_id = s.organizacion_id
      AND (
            s.es_admin
        OR  s.es_owner
        OR  (
                c.propietario_usuario_id IS NOT NULL
            AND auth.uid() IS NOT NULL
            AND c.propietario_usuario_id = auth.uid()
            )
        OR  public.current_user_has_perm('accounts.view_sensitive_unowned')
      )
);
$function$;

COMMIT;
