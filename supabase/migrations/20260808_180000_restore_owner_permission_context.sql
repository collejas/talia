BEGIN;

-- Keep the permission contract consumed by the panel and the API complete.
-- The previous version omitted es_owner, causing owner-only routes to deny
-- every authenticated user even when public.es_owner(uid) was true.
DROP FUNCTION IF EXISTS public.mi_contexto_permisos();

CREATE FUNCTION public.mi_contexto_permisos()
RETURNS TABLE(
  usuario_id uuid,
  organizacion_id uuid,
  roles text[],
  permisos text[],
  es_admin boolean,
  es_owner boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT
      auth.uid() AS usuario_id,
      public.usuario_organizacion_id(auth.uid()) AS organizacion_id
  ),
  sales_fallback AS (
    SELECT
      ctx.usuario_id,
      ctx.organizacion_id,
      public.usuario_es_ejecutivo_ventas(ctx.usuario_id, ctx.organizacion_id)
        AS es_ejecutivo_ventas
    FROM ctx
  )
  SELECT
    ctx.usuario_id,
    ctx.organizacion_id,
    (
      COALESCE(
        (
          SELECT array_agg(DISTINCT r.codigo)
          FROM public.usuarios_roles ur
          JOIN public.roles r
            ON r.id = ur.rol_id
           AND r.organizacion_id = ur.organizacion_id
          WHERE ur.usuario_id = ctx.usuario_id
            AND ur.organizacion_id = ctx.organizacion_id
        ),
        '{}'::text[]
      )
      || CASE
        WHEN sales_fallback.es_ejecutivo_ventas THEN ARRAY['agente']::text[]
        ELSE '{}'::text[]
      END
    ) AS roles,
    (
      COALESCE(
        (
          SELECT array_agg(DISTINCT p.codigo)
          FROM public.usuarios_roles ur
          JOIN public.roles_permisos rp
            ON rp.rol_id = ur.rol_id
           AND rp.organizacion_id = ur.organizacion_id
          JOIN public.permisos p
            ON p.id = rp.permiso_id
           AND p.organizacion_id = ur.organizacion_id
          WHERE ur.usuario_id = ctx.usuario_id
            AND ur.organizacion_id = ctx.organizacion_id
        ),
        '{}'::text[]
      )
      || CASE
        WHEN sales_fallback.es_ejecutivo_ventas
          THEN ARRAY['propuesta.view', 'propuesta.create']::text[]
        ELSE '{}'::text[]
      END
    ) AS permisos,
    public.es_admin(ctx.usuario_id) AS es_admin,
    public.es_owner(ctx.usuario_id) AS es_owner
  FROM ctx
  CROSS JOIN sales_fallback;
$$;

GRANT EXECUTE ON FUNCTION public.mi_contexto_permisos() TO authenticated;

COMMIT;
