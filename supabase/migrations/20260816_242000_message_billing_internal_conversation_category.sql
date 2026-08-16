BEGIN;

-- Separa la categoría de pricing que Meta confirma de la clasificación
-- operativa que usamos para mensajes sin precio propio dentro de un hilo.
ALTER TABLE public.cobro_mensajes
    ADD COLUMN IF NOT EXISTS categoria_interna_cobro text NOT NULL DEFAULT 'sin_clasificar';

ALTER TABLE public.cobro_mensajes
    DROP CONSTRAINT IF EXISTS cobro_mensajes_internal_category_chk;

ALTER TABLE public.cobro_mensajes
    ADD CONSTRAINT cobro_mensajes_internal_category_chk
    CHECK (categoria_interna_cobro IN ('sin_clasificar', 'conversacion_sin_tarifa_meta'));

CREATE INDEX IF NOT EXISTS cobro_mensajes_org_internal_category_idx
    ON public.cobro_mensajes (organizacion_id, categoria_interna_cobro, creado_en DESC);

CREATE OR REPLACE FUNCTION public.classify_internal_message_billing_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NEW.proveedor = 'meta'
       AND NEW.categoria_meta = 'unknown'
       AND NEW.direccion = 'entrante' THEN
        NEW.categoria_interna_cobro := 'conversacion_sin_tarifa_meta';
    ELSE
        NEW.categoria_interna_cobro := 'sin_clasificar';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cobro_mensajes_classify_internal_category
    ON public.cobro_mensajes;
CREATE TRIGGER cobro_mensajes_classify_internal_category
BEFORE INSERT OR UPDATE OF proveedor, direccion, categoria_meta
ON public.cobro_mensajes
FOR EACH ROW
EXECUTE FUNCTION public.classify_internal_message_billing_category();

UPDATE public.cobro_mensajes
SET categoria_interna_cobro = CASE
    WHEN proveedor = 'meta'
     AND categoria_meta = 'unknown'
     AND direccion = 'entrante'
        THEN 'conversacion_sin_tarifa_meta'
    ELSE 'sin_clasificar'
END;

CREATE OR REPLACE FUNCTION public.obtener_cobro_resumen_filtrado(
    p_organizacion_id uuid DEFAULT NULL,
    p_categoria_meta text DEFAULT NULL,
    p_direccion text DEFAULT NULL
)
RETURNS TABLE(
    id uuid, organizacion_id uuid, fecha_inicio timestamptz, fecha_fin timestamptz,
    estado text, mensajes_cantidad bigint, mensajes_entrantes_cantidad bigint,
    mensajes_salientes_cantidad bigint, hilos_con_actividad_cantidad bigint,
    conversiones_cantidad bigint, subtotal_mensajes numeric,
    costo_meta_periodo numeric, costo_mensaje_periodo numeric, ajustes_total numeric,
    total numeric, moneda char(3), cerrado_en timestamptz, creado_en timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
WITH scope AS (
    SELECT auth.role() = 'service_role' AS is_service_role,
           (auth.uid() IS NOT NULL AND public.es_owner(auth.uid())
            AND public.usuario_organizacion_id(auth.uid()) = '00000000-0000-0000-0000-000000000001'::uuid) AS is_master_owner,
           public.usuario_organizacion_id(auth.uid()) AS user_organizacion_id
), filtered AS (
    SELECT cm.organizacion_id, cm.periodo_id, cm.conversacion_id, cm.direccion,
           cm.cargo_app_importe, cm.costo_meta_importe, h.conversion_atribuida
    FROM public.cobro_mensajes cm
    CROSS JOIN scope s
    LEFT JOIN public.cobro_hilos_resumen h
      ON h.organizacion_id = cm.organizacion_id AND h.periodo_id = cm.periodo_id
     AND h.conversacion_id = cm.conversacion_id
    WHERE (((s.is_service_role OR s.is_master_owner)
            AND (p_organizacion_id IS NULL OR cm.organizacion_id = p_organizacion_id))
       OR (NOT s.is_service_role AND NOT s.is_master_owner
           AND s.user_organizacion_id IS NOT NULL
           AND cm.organizacion_id = s.user_organizacion_id))
      AND (p_categoria_meta IS NULL
           OR (p_categoria_meta = 'conversacion_sin_tarifa_meta'
               AND cm.categoria_interna_cobro = p_categoria_meta)
           OR (p_categoria_meta <> 'conversacion_sin_tarifa_meta'
               AND cm.categoria_meta = p_categoria_meta))
      AND (p_direccion IS NULL OR cm.direccion = p_direccion)
)
SELECT cp.id, cp.organizacion_id, cp.fecha_inicio, cp.fecha_fin, cp.estado,
       COUNT(*), COUNT(*) FILTER (WHERE f.direccion = 'entrante'),
       COUNT(*) FILTER (WHERE f.direccion = 'saliente'), COUNT(DISTINCT f.conversacion_id),
       COUNT(DISTINCT f.conversacion_id) FILTER (WHERE f.conversion_atribuida),
       SUM(f.cargo_app_importe), SUM(f.costo_meta_importe), SUM(f.cargo_app_importe),
       MAX(cp.ajustes_total), SUM(f.cargo_app_importe + f.costo_meta_importe) + MAX(cp.ajustes_total),
       cp.moneda, cp.cerrado_en, cp.creado_en
FROM filtered f
JOIN public.cobro_periodos cp ON cp.organizacion_id = f.organizacion_id AND cp.id = f.periodo_id
GROUP BY cp.id, cp.organizacion_id, cp.fecha_inicio, cp.fecha_fin, cp.estado,
         cp.moneda, cp.cerrado_en, cp.creado_en
ORDER BY cp.fecha_inicio DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.obtener_cobro_resumen_filtrado(uuid, text, text)
    TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.obtener_cobro_resumen_filtrado(uuid, text, text)
    FROM PUBLIC, anon;

COMMENT ON COLUMN public.cobro_mensajes.categoria_interna_cobro IS
    'Clasificación operativa local. conversacion_sin_tarifa_meta indica que el mensaje no tiene pricing Meta propio.';

COMMIT;
