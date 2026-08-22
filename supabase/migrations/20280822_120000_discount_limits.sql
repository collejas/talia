BEGIN;

-- Límite porcentual por tipo de precio y sujeto autorizado.
CREATE TABLE IF NOT EXISTS public.listas_precios_limites_descuento (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    tipo_precio text NOT NULL,
    lista_precio_id uuid,
    rol_id uuid,
    usuario_id uuid,
    empleado_usuario_id uuid,
    descuento_maximo_porcentaje numeric(5,2) NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_por_usuario_id uuid,
    actualizado_por_usuario_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT listas_precios_limites_tipo_check
        CHECK (tipo_precio IN ('base', 'lista')),
    CONSTRAINT listas_precios_limites_porcentaje_check
        CHECK (descuento_maximo_porcentaje BETWEEN 0 AND 100),
    CONSTRAINT listas_precios_limites_lista_tipo_check
        CHECK (
            (tipo_precio = 'base' AND lista_precio_id IS NULL)
            OR (tipo_precio = 'lista' AND lista_precio_id IS NOT NULL)
        ),
    CONSTRAINT listas_precios_limites_un_sujeto_check
        CHECK (num_nonnulls(rol_id, usuario_id, empleado_usuario_id) = 1),
    CONSTRAINT listas_precios_limites_lista_org_fkey
        FOREIGN KEY (organizacion_id, lista_precio_id)
        REFERENCES public.listas_precios (organizacion_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT listas_precios_limites_rol_org_fkey
        FOREIGN KEY (organizacion_id, rol_id)
        REFERENCES public.roles (organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT listas_precios_limites_usuario_org_fkey
        FOREIGN KEY (organizacion_id, usuario_id)
        REFERENCES public.usuarios (organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT listas_precios_limites_empleado_org_fkey
        FOREIGN KEY (organizacion_id, empleado_usuario_id)
        REFERENCES public.empleados (organizacion_id, usuario_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS listas_precios_limites_rol_key
    ON public.listas_precios_limites_descuento (organizacion_id, tipo_precio, lista_precio_id, rol_id);
CREATE UNIQUE INDEX IF NOT EXISTS listas_precios_limites_usuario_key
    ON public.listas_precios_limites_descuento (organizacion_id, tipo_precio, lista_precio_id, usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS listas_precios_limites_empleado_key
    ON public.listas_precios_limites_descuento (organizacion_id, tipo_precio, lista_precio_id, empleado_usuario_id);
CREATE INDEX IF NOT EXISTS listas_precios_limites_lookup_idx
    ON public.listas_precios_limites_descuento
       (organizacion_id, tipo_precio, lista_precio_id, activo);

CREATE TABLE IF NOT EXISTS public.listas_precios_limites_descuento_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    limite_descuento_id uuid,
    tipo_precio text NOT NULL,
    lista_precio_id uuid,
    rol_id uuid,
    usuario_id uuid,
    empleado_usuario_id uuid,
    porcentaje_anterior numeric(5,2),
    porcentaje_nuevo numeric(5,2),
    accion text NOT NULL,
    cambiado_por_usuario_id uuid,
    cambiado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT listas_precios_limites_hist_accion_check
        CHECK (accion IN ('creado', 'actualizado', 'activado', 'desactivado', 'eliminado')),
    CONSTRAINT listas_precios_limites_hist_tipo_check
        CHECK (tipo_precio IN ('base', 'lista'))
);

CREATE INDEX IF NOT EXISTS listas_precios_limites_hist_lookup_idx
    ON public.listas_precios_limites_descuento_historial
       (organizacion_id, tipo_precio, lista_precio_id, cambiado_en DESC);

ALTER TABLE public.cotizacion_items
    ADD COLUMN IF NOT EXISTS precio_lista_unitario numeric(14,2),
    ADD COLUMN IF NOT EXISTS descuento_monto_aplicado numeric(14,2),
    ADD COLUMN IF NOT EXISTS limite_descuento_porcentaje numeric(5,2),
    ADD COLUMN IF NOT EXISTS precio_unitario_final numeric(14,2);

ALTER TABLE public.cotizacion_items
    DROP CONSTRAINT IF EXISTS cotizacion_items_discount_snapshot_check;
ALTER TABLE public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_discount_snapshot_check
    CHECK (
        (limite_descuento_porcentaje IS NULL OR limite_descuento_porcentaje BETWEEN 0 AND 100)
        AND (descuento_monto_aplicado IS NULL OR descuento_monto_aplicado >= 0)
        AND (precio_lista_unitario IS NULL OR precio_lista_unitario >= 0)
        AND (precio_unitario_final IS NULL OR precio_unitario_final >= 0)
    );

CREATE OR REPLACE FUNCTION public.tg_price_discount_limit_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor_id uuid := COALESCE(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.actualizado_por_usuario_id ELSE NEW.actualizado_por_usuario_id END,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.creado_por_usuario_id ELSE NEW.creado_por_usuario_id END,
        auth.uid()
    );
BEGIN
    INSERT INTO public.listas_precios_limites_descuento_historial (
        organizacion_id, limite_descuento_id, tipo_precio, lista_precio_id,
        rol_id, usuario_id, empleado_usuario_id, porcentaje_anterior,
        porcentaje_nuevo, accion, cambiado_por_usuario_id
    ) VALUES (
        COALESCE(NEW.organizacion_id, OLD.organizacion_id),
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.tipo_precio, OLD.tipo_precio),
        COALESCE(NEW.lista_precio_id, OLD.lista_precio_id),
        COALESCE(NEW.rol_id, OLD.rol_id),
        COALESCE(NEW.usuario_id, OLD.usuario_id),
        COALESCE(NEW.empleado_usuario_id, OLD.empleado_usuario_id),
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.descuento_maximo_porcentaje END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.descuento_maximo_porcentaje END,
        CASE
            WHEN TG_OP = 'INSERT' THEN 'creado'
            WHEN TG_OP = 'UPDATE' AND OLD.activo IS DISTINCT FROM NEW.activo AND NEW.activo THEN 'activado'
            WHEN TG_OP = 'UPDATE' AND OLD.activo IS DISTINCT FROM NEW.activo THEN 'desactivado'
            ELSE 'actualizado'
        END,
        actor_id
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS price_discount_limit_history
    ON public.listas_precios_limites_descuento;
CREATE TRIGGER price_discount_limit_history
    AFTER INSERT OR UPDATE OR DELETE ON public.listas_precios_limites_descuento
    FOR EACH ROW EXECUTE FUNCTION public.tg_price_discount_limit_history();

ALTER TABLE public.listas_precios_limites_descuento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_precios_limites_descuento_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY listas_precios_limites_admin_all
    ON public.listas_precios_limites_descuento FOR ALL TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    )
    WITH CHECK (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

CREATE POLICY listas_precios_limites_hist_admin_select
    ON public.listas_precios_limites_descuento_historial FOR SELECT TO authenticated
    USING (
        (public.es_admin(auth.uid()) OR public.es_owner(auth.uid()))
        AND organizacion_id = (SELECT u.organizacion_id FROM public.usuarios u WHERE u.id = auth.uid())
    );

COMMIT;
