-- Una orden aprobada representa un compromiso, no una existencia fisica.
-- El embarque se comunica con en_transito y la existencia nace en la recepcion.
ALTER TABLE public.ordenes_compra
    DROP CONSTRAINT IF EXISTS ordenes_compra_estado_check;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_estado_check CHECK (
        estado = ANY (ARRAY[
            'borrador',
            'enviada',
            'aprobada',
            'en_transito',
            'parcial',
            'recibida',
            'cerrada',
            'cancelada',
            'en_revision',
            'autorizada',
            'aceptada_por_proveedor',
            'parcialmente_embarcada',
            'embarcada'
        ])
    );

-- Solo puede existir un almacen de transito activo por organizacion.
CREATE UNIQUE INDEX IF NOT EXISTS almacenes_org_active_transit_unq
    ON public.almacenes (organizacion_id)
    WHERE tipo = 'transito' AND activo IS TRUE;

-- Backfill idempotente para tenants existentes. Si TRANSITO ya fue usado por
-- otro tipo de almacen, se conserva la integridad y se usa un codigo alterno;
-- el tipo transito sigue siendo la fuente de verdad para resolverlo.
DO $function$
DECLARE
    v_org record;
    v_codigo text;
BEGIN
    FOR v_org IN SELECT id FROM public.organizaciones LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.almacenes a
            WHERE a.organizacion_id = v_org.id
              AND a.tipo = 'transito'
              AND a.activo IS TRUE
        ) THEN
            v_codigo := 'TRANSITO';
            IF EXISTS (
                SELECT 1
                FROM public.almacenes a
                WHERE a.organizacion_id = v_org.id
                  AND a.codigo = v_codigo
            ) THEN
                v_codigo := 'TRANSITO-' || left(replace(v_org.id::text, '-', ''), 8);
            END IF;

            INSERT INTO public.almacenes (
                organizacion_id, codigo, nombre, tipo, activo, es_principal
            ) VALUES (
                v_org.id, v_codigo, 'ALMACEN EN TRANSITO', 'transito', true, false
            )
            ON CONFLICT (organizacion_id, codigo) DO NOTHING;
        END IF;
    END LOOP;
END;
$function$;

-- Todo tenant nuevo recibe el almacen desde el trigger central de bootstrap,
-- sin depender de la ruta de alta que haya creado la organizacion.
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

    INSERT INTO public.almacenes (
        organizacion_id, codigo, nombre, tipo, activo, es_principal
    ) VALUES (
        NEW.id, 'TRANSITO', 'ALMACEN EN TRANSITO', 'transito', true, false
    )
    ON CONFLICT (organizacion_id, codigo) DO NOTHING;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_new_tenant_defaults() FROM PUBLIC, anon, authenticated;
