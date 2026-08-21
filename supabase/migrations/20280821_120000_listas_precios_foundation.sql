BEGIN;

-- Catálogo tenant-aware de listas de precios.
CREATE TABLE IF NOT EXISTS public.listas_precios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_por_usuario_id uuid,
    actualizado_por_usuario_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT listas_precios_nombre_check CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS listas_precios_org_nombre_key
    ON public.listas_precios (organizacion_id, lower(btrim(nombre)));

CREATE INDEX IF NOT EXISTS listas_precios_org_activo_idx
    ON public.listas_precios (organizacion_id, activo, creado_en DESC);

-- Relaciones explícitas para controlar qué listas puede utilizar cada actor.
CREATE TABLE IF NOT EXISTS public.listas_precios_roles (
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    lista_precio_id uuid NOT NULL REFERENCES public.listas_precios(id) ON DELETE CASCADE,
    rol_id uuid NOT NULL,
    asignado_por_usuario_id uuid,
    asignado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organizacion_id, lista_precio_id, rol_id)
);

CREATE TABLE IF NOT EXISTS public.listas_precios_usuarios (
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    lista_precio_id uuid NOT NULL REFERENCES public.listas_precios(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL,
    asignado_por_usuario_id uuid,
    asignado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organizacion_id, lista_precio_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS public.listas_precios_empleados (
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    lista_precio_id uuid NOT NULL REFERENCES public.listas_precios(id) ON DELETE CASCADE,
    empleado_usuario_id uuid NOT NULL,
    asignado_por_usuario_id uuid,
    asignado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organizacion_id, lista_precio_id, empleado_usuario_id)
);

-- Asegura FKs compuestas que no permitan mezclar tenants.
CREATE UNIQUE INDEX IF NOT EXISTS roles_org_id_key
    ON public.roles (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_org_id_key
    ON public.usuarios (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS empleados_org_usuario_id_key
    ON public.empleados (organizacion_id, usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_org_id_key
    ON public.catalog_items (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS listas_precios_org_id_key
    ON public.listas_precios (organizacion_id, id);

ALTER TABLE public.listas_precios_roles
    ADD CONSTRAINT listas_precios_roles_lista_org_fkey
    FOREIGN KEY (organizacion_id, lista_precio_id)
    REFERENCES public.listas_precios (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.listas_precios_roles
    ADD CONSTRAINT listas_precios_roles_rol_org_fkey
    FOREIGN KEY (organizacion_id, rol_id)
    REFERENCES public.roles (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.listas_precios_usuarios
    ADD CONSTRAINT listas_precios_usuarios_lista_org_fkey
    FOREIGN KEY (organizacion_id, lista_precio_id)
    REFERENCES public.listas_precios (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.listas_precios_usuarios
    ADD CONSTRAINT listas_precios_usuarios_usuario_org_fkey
    FOREIGN KEY (organizacion_id, usuario_id)
    REFERENCES public.usuarios (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.listas_precios_empleados
    ADD CONSTRAINT listas_precios_empleados_lista_org_fkey
    FOREIGN KEY (organizacion_id, lista_precio_id)
    REFERENCES public.listas_precios (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.listas_precios_empleados
    ADD CONSTRAINT listas_precios_empleados_empleado_org_fkey
    FOREIGN KEY (organizacion_id, empleado_usuario_id)
    REFERENCES public.empleados (organizacion_id, usuario_id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS listas_precios_roles_rol_idx
    ON public.listas_precios_roles (organizacion_id, rol_id, lista_precio_id);
CREATE INDEX IF NOT EXISTS listas_precios_usuarios_usuario_idx
    ON public.listas_precios_usuarios (organizacion_id, usuario_id, lista_precio_id);
CREATE INDEX IF NOT EXISTS listas_precios_empleados_empleado_idx
    ON public.listas_precios_empleados (organizacion_id, empleado_usuario_id, lista_precio_id);

-- Precio vigente de un item para una lista. El historial se conserva aparte.
CREATE TABLE IF NOT EXISTS public.catalog_item_lista_precios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    catalog_item_id uuid NOT NULL,
    lista_precio_id uuid NOT NULL,
    precio numeric(14,2) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    activo boolean NOT NULL DEFAULT true,
    creado_por_usuario_id uuid,
    actualizado_por_usuario_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT catalog_item_lista_precios_precio_check CHECK (precio >= 0),
    CONSTRAINT catalog_item_lista_precios_moneda_check CHECK (char_length(moneda) = 3),
    UNIQUE (organizacion_id, catalog_item_id, lista_precio_id),
    CONSTRAINT catalog_item_lista_precios_item_org_fkey
        FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items (organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT catalog_item_lista_precios_lista_org_fkey
        FOREIGN KEY (organizacion_id, lista_precio_id)
        REFERENCES public.listas_precios (organizacion_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS catalog_item_lista_precios_item_idx
    ON public.catalog_item_lista_precios (organizacion_id, catalog_item_id, activo);
CREATE INDEX IF NOT EXISTS catalog_item_lista_precios_lista_idx
    ON public.catalog_item_lista_precios (organizacion_id, lista_precio_id, activo);

-- Bitácora inmutable de todos los cambios de precios.
CREATE TABLE IF NOT EXISTS public.catalog_price_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    catalog_item_id uuid,
    lista_precio_id uuid,
    tipo_precio text NOT NULL,
    producto_nombre text NOT NULL,
    lista_precio_nombre text,
    precio_anterior numeric(14,2),
    precio_nuevo numeric(14,2),
    moneda_anterior char(3),
    moneda_nueva char(3),
    accion text NOT NULL,
    origen_cambio text NOT NULL DEFAULT 'panel',
    cambiado_por_usuario_id uuid,
    cambiado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT catalog_price_history_tipo_check CHECK (tipo_precio IN ('base', 'lista')),
    CONSTRAINT catalog_price_history_accion_check CHECK (accion IN ('creado', 'actualizado', 'desactivado', 'eliminado', 'migracion_inicial')),
    CONSTRAINT catalog_price_history_origen_check CHECK (origen_cambio IN ('panel', 'importacion', 'api', 'sistema', 'migracion')),
    CONSTRAINT catalog_price_history_value_check CHECK (precio_anterior IS NOT NULL OR precio_nuevo IS NOT NULL),
    CONSTRAINT catalog_price_history_item_fkey
        FOREIGN KEY (catalog_item_id)
        REFERENCES public.catalog_items (id)
        ON DELETE SET NULL,
    CONSTRAINT catalog_price_history_lista_fkey
        FOREIGN KEY (lista_precio_id)
        REFERENCES public.listas_precios (id)
        ON DELETE SET NULL,
    CONSTRAINT catalog_price_history_usuario_fkey
        FOREIGN KEY (cambiado_por_usuario_id)
        REFERENCES public.usuarios (id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS catalog_price_history_item_date_idx
    ON public.catalog_price_history (organizacion_id, catalog_item_id, cambiado_en DESC);
CREATE INDEX IF NOT EXISTS catalog_price_history_lista_date_idx
    ON public.catalog_price_history (organizacion_id, lista_precio_id, cambiado_en DESC);
CREATE INDEX IF NOT EXISTS catalog_price_history_actor_date_idx
    ON public.catalog_price_history (organizacion_id, cambiado_por_usuario_id, cambiado_en DESC);

-- Permite validar en RLS si el usuario puede utilizar una lista concreta.
CREATE OR REPLACE FUNCTION public.puede_usar_lista_precio(p_lista_precio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.listas_precios lp
        JOIN public.usuarios u
          ON u.organizacion_id = lp.organizacion_id
         AND u.id = auth.uid()
        WHERE lp.id = p_lista_precio_id
          AND lp.activo
          AND (
              public.es_admin(auth.uid())
              OR public.es_owner(auth.uid())
              OR EXISTS (
                  SELECT 1
                  FROM public.listas_precios_usuarios lpu
                  WHERE lpu.organizacion_id = lp.organizacion_id
                    AND lpu.lista_precio_id = lp.id
                    AND lpu.usuario_id = u.id
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.listas_precios_empleados lpe
                  WHERE lpe.organizacion_id = lp.organizacion_id
                    AND lpe.lista_precio_id = lp.id
                    AND lpe.empleado_usuario_id = u.id
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.listas_precios_roles lpr
                  JOIN public.usuarios_roles ur
                    ON ur.organizacion_id = lpr.organizacion_id
                   AND ur.rol_id = lpr.rol_id
                   AND ur.usuario_id = u.id
                  WHERE lpr.organizacion_id = lp.organizacion_id
                    AND lpr.lista_precio_id = lp.id
              )
          )
    );
$$;

-- Registra el Precio base actual del catálogo.
CREATE OR REPLACE FUNCTION public.tg_catalog_items_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor_id uuid := COALESCE(NEW.updated_by, NEW.created_by, auth.uid());
BEGIN
    IF TG_OP = 'INSERT' AND NEW.precio_base IS NOT NULL THEN
        INSERT INTO public.catalog_price_history (
            organizacion_id, catalog_item_id, tipo_precio, producto_nombre,
            precio_nuevo, moneda_nueva, accion, origen_cambio, cambiado_por_usuario_id
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'base', NEW.nombre,
            NEW.precio_base, NEW.moneda, 'creado', 'panel', actor_id
        );
    ELSIF TG_OP = 'UPDATE'
      AND (NEW.precio_base IS DISTINCT FROM OLD.precio_base OR NEW.moneda IS DISTINCT FROM OLD.moneda) THEN
        INSERT INTO public.catalog_price_history (
            organizacion_id, catalog_item_id, tipo_precio, producto_nombre,
            precio_anterior, precio_nuevo, moneda_anterior, moneda_nueva,
            accion, origen_cambio, cambiado_por_usuario_id
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'base', NEW.nombre,
            OLD.precio_base, NEW.precio_base, OLD.moneda, NEW.moneda,
            CASE WHEN NEW.precio_base IS NULL THEN 'desactivado' ELSE 'actualizado' END,
            'panel', actor_id
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_items_price_history ON public.catalog_items;
CREATE TRIGGER catalog_items_price_history
    AFTER INSERT OR UPDATE OF precio_base, moneda ON public.catalog_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_catalog_items_price_history();

-- Registra cada creación, cambio o eliminación de un precio de lista.
CREATE OR REPLACE FUNCTION public.tg_catalog_item_lista_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor_id uuid;
    item_name text;
    list_name text;
BEGIN
    actor_id := COALESCE(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.actualizado_por_usuario_id ELSE NEW.actualizado_por_usuario_id END,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.creado_por_usuario_id ELSE NEW.creado_por_usuario_id END,
        auth.uid()
    );

    SELECT ci.nombre INTO item_name
    FROM public.catalog_items ci
    WHERE ci.organizacion_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.organizacion_id ELSE NEW.organizacion_id END
      AND ci.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_item_id ELSE NEW.catalog_item_id END;

    SELECT lp.nombre INTO list_name
    FROM public.listas_precios lp
    WHERE lp.organizacion_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.organizacion_id ELSE NEW.organizacion_id END
      AND lp.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.lista_precio_id ELSE NEW.lista_precio_id END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.catalog_price_history (
            organizacion_id, catalog_item_id, lista_precio_id, tipo_precio,
            producto_nombre, lista_precio_nombre, precio_nuevo, moneda_nueva,
            accion, origen_cambio, cambiado_por_usuario_id
        ) VALUES (
            NEW.organizacion_id, NEW.catalog_item_id, NEW.lista_precio_id, 'lista',
            COALESCE(item_name, 'Producto eliminado'), list_name, NEW.precio, NEW.moneda,
            'creado', 'panel', actor_id
        );
    ELSIF TG_OP = 'UPDATE'
      AND (NEW.precio IS DISTINCT FROM OLD.precio OR NEW.moneda IS DISTINCT FROM OLD.moneda OR NEW.activo IS DISTINCT FROM OLD.activo) THEN
        INSERT INTO public.catalog_price_history (
            organizacion_id, catalog_item_id, lista_precio_id, tipo_precio,
            producto_nombre, lista_precio_nombre, precio_anterior, precio_nuevo,
            moneda_anterior, moneda_nueva, accion, origen_cambio, cambiado_por_usuario_id
        ) VALUES (
            NEW.organizacion_id, NEW.catalog_item_id, NEW.lista_precio_id, 'lista',
            COALESCE(item_name, 'Producto eliminado'), list_name, OLD.precio, NEW.precio,
            OLD.moneda, NEW.moneda,
            CASE WHEN NEW.activo = false AND OLD.activo THEN 'desactivado' ELSE 'actualizado' END,
            'panel', actor_id
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.catalog_price_history (
            organizacion_id, catalog_item_id, lista_precio_id, tipo_precio,
            producto_nombre, lista_precio_nombre, precio_anterior, moneda_anterior,
            accion, origen_cambio, cambiado_por_usuario_id
        ) VALUES (
            OLD.organizacion_id, OLD.catalog_item_id, OLD.lista_precio_id, 'lista',
            COALESCE(item_name, 'Producto eliminado'), list_name, OLD.precio, OLD.moneda,
            'eliminado', 'panel', actor_id
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS catalog_item_lista_price_history ON public.catalog_item_lista_precios;
CREATE TRIGGER catalog_item_lista_price_history
    AFTER INSERT OR UPDATE OR DELETE ON public.catalog_item_lista_precios
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_catalog_item_lista_price_history();

-- Base de referencia: no recupera cambios anteriores a esta migración.
INSERT INTO public.catalog_price_history (
    organizacion_id, catalog_item_id, tipo_precio, producto_nombre,
    precio_nuevo, moneda_nueva, accion, origen_cambio
)
SELECT
    ci.organizacion_id, ci.id, 'base', ci.nombre,
    ci.precio_base, ci.moneda, 'migracion_inicial', 'migracion'
FROM public.catalog_items ci
WHERE ci.precio_base IS NOT NULL;

-- RLS: nombres visibles para miembros del tenant; administración restringida.
ALTER TABLE public.listas_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_precios_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_precios_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_precios_empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_lista_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY listas_precios_member_select
    ON public.listas_precios FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = auth.uid() AND u.organizacion_id = listas_precios.organizacion_id
    ));

CREATE POLICY listas_precios_admin_write
    ON public.listas_precios FOR ALL TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    )
    WITH CHECK (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

CREATE POLICY listas_precios_roles_admin_all
    ON public.listas_precios_roles FOR ALL TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    )
    WITH CHECK (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

CREATE POLICY listas_precios_usuarios_admin_all
    ON public.listas_precios_usuarios FOR ALL TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    )
    WITH CHECK (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

CREATE POLICY listas_precios_empleados_admin_all
    ON public.listas_precios_empleados FOR ALL TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    )
    WITH CHECK (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

CREATE POLICY catalog_item_lista_precios_member_select
    ON public.catalog_item_lista_precios FOR SELECT TO authenticated
    USING (public.puede_usar_lista_precio(lista_precio_id));

CREATE POLICY catalog_item_lista_precios_admin_write
    ON public.catalog_item_lista_precios FOR ALL TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    )
    WITH CHECK (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

CREATE POLICY catalog_price_history_admin_select
    ON public.catalog_price_history FOR SELECT TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

COMMIT;
