BEGIN;

CREATE INDEX IF NOT EXISTS roles_permisos_org_rol_idx
    ON public.roles_permisos (organizacion_id, rol_id);

CREATE INDEX IF NOT EXISTS roles_permisos_org_permiso_idx
    ON public.roles_permisos (organizacion_id, permiso_id);

CREATE INDEX IF NOT EXISTS permisos_org_codigo_lower_idx
    ON public.permisos (organizacion_id, lower(codigo));

CREATE OR REPLACE FUNCTION public.current_user_has_perm(perm_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ctx AS (
    SELECT
      auth.uid() AS usuario_id,
      COALESCE(
        public.usuario_organizacion_id(auth.uid()),
        (SELECT ur.organizacion_id FROM public.usuarios_roles ur WHERE ur.usuario_id = auth.uid() LIMIT 1)
      ) AS organizacion_id,
      lower(btrim(coalesce(perm_code, ''))) AS perm_code
  )
  SELECT
    public.es_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_roles ur
      JOIN public.roles_permisos rp
        ON rp.rol_id = ur.rol_id
       AND rp.organizacion_id = ur.organizacion_id
      JOIN public.permisos p
        ON p.id = rp.permiso_id
       AND p.organizacion_id = ur.organizacion_id
      CROSS JOIN ctx
      WHERE ur.usuario_id = ctx.usuario_id
        AND ur.organizacion_id = ctx.organizacion_id
        AND p.codigo = ctx.perm_code
    );
$$;

COMMENT ON FUNCTION public.current_user_has_perm(text) IS 'Evalúa permisos del usuario actual usando el código normalizado en minúsculas.';

GRANT EXECUTE ON FUNCTION public.current_user_has_perm(text) TO authenticated;

COMMIT;
