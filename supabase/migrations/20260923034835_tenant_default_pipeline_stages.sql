BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_default_pipeline_stages (
    codigo text PRIMARY KEY,
    nombre text NOT NULL,
    orden smallint NOT NULL UNIQUE,
    probabilidad numeric(5,2) NOT NULL,
    categoria text NOT NULL,
    color text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_default_pipeline_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_default_pipeline_stages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_default_pipeline_stages TO service_role;
DROP POLICY IF EXISTS tenant_default_pipeline_stages_service_read ON public.tenant_default_pipeline_stages;
CREATE POLICY tenant_default_pipeline_stages_service_read ON public.tenant_default_pipeline_stages
    FOR SELECT TO service_role USING (true);

INSERT INTO public.tenant_default_pipeline_stages (codigo, nombre, orden, probabilidad, categoria, color)
VALUES
    ('captado', 'Captado', 10, 10, 'abierta', 'slate'),
    ('precalificado', 'Precalificado', 20, 25, 'abierta', 'sky'),
    ('demo', 'Cita agendada', 30, 45, 'abierta', 'violet'),
    ('propuesta', 'Propuesta', 40, 65, 'abierta', 'amber'),
    ('negociacion', 'Negociación', 50, 80, 'abierta', 'orange'),
    ('cerrado_ganado', 'Cerrado · Ganado', 60, 100, 'ganada', 'emerald'),
    ('cerrado_perdido', 'Cerrado · Perdido', 70, 0, 'perdida', 'rose')
ON CONFLICT (codigo) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    orden = EXCLUDED.orden,
    probabilidad = EXCLUDED.probabilidad,
    categoria = EXCLUDED.categoria,
    color = EXCLUDED.color,
    activo = true,
    actualizado_en = now();

INSERT INTO public.etapas_pipeline (
    organizacion_id, codigo, nombre, orden, probabilidad, categoria, metadata
)
SELECT o.id, s.codigo, s.nombre, s.orden, s.probabilidad, s.categoria,
       jsonb_build_object('seed', 'default_stage', 'color', s.color, 'legacy_codigo', s.codigo)
FROM public.organizaciones o
CROSS JOIN public.tenant_default_pipeline_stages s
WHERE s.activo
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.bootstrap_new_tenant_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
    SELECT NEW.id, p.codigo, p.descripcion
    FROM public.tenant_default_permissions p
    WHERE p.activo
    ON CONFLICT (organizacion_id, codigo) DO NOTHING;

    INSERT INTO public.roles (organizacion_id, nombre, descripcion)
    SELECT NEW.id, r.nombre, r.descripcion
    FROM public.tenant_default_roles r
    WHERE r.activo
    ON CONFLICT DO NOTHING;

    INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
    SELECT NEW.id, r.id, p.id
    FROM public.tenant_default_role_permissions rp
    JOIN public.tenant_default_roles dr ON dr.codigo = rp.rol_codigo AND dr.activo
    JOIN public.roles r
      ON r.organizacion_id = NEW.id
     AND lower(trim(r.nombre)) = lower(trim(dr.nombre))
    JOIN public.permisos p
      ON p.organizacion_id = NEW.id
     AND p.codigo = rp.permiso_codigo
    ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

    INSERT INTO public.departamentos (organizacion_id, nombre)
    SELECT NEW.id, c.nombre
    FROM public.tenant_bootstrap_catalog c
    WHERE c.tipo = 'departamento' AND c.activo
    ON CONFLICT (organizacion_id, nombre) DO NOTHING;

    INSERT INTO public.puestos (organizacion_id, nombre)
    SELECT NEW.id, c.nombre
    FROM public.tenant_bootstrap_catalog c
    WHERE c.tipo = 'puesto' AND c.activo
      AND NOT EXISTS (
          SELECT 1 FROM public.puestos p
          WHERE p.organizacion_id = NEW.id
            AND lower(trim(p.nombre)) = lower(trim(c.nombre))
      );

    INSERT INTO public.etapas_pipeline (
        organizacion_id, codigo, nombre, orden, probabilidad, categoria, metadata
    )
    SELECT NEW.id, s.codigo, s.nombre, s.orden, s.probabilidad, s.categoria,
           jsonb_build_object('seed', 'default_stage', 'color', s.color, 'legacy_codigo', s.codigo)
    FROM public.tenant_default_pipeline_stages s
    WHERE s.activo
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$function$;

COMMIT;
