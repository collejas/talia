-- Corrige el resumen de KPI para que los periodos predefinidos y manuales
-- filtren el ledger por la misma ventana temporal que el detalle.

CREATE OR REPLACE FUNCTION public.obtener_cobro_resumen_filtrado(
    p_organizacion_id uuid DEFAULT NULL,
    p_categoria_meta text DEFAULT NULL,
    p_direccion text DEFAULT NULL,
    p_desde timestamptz DEFAULT NULL,
    p_hasta timestamptz DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    organizacion_id uuid,
    fecha_inicio timestamptz,
    fecha_fin timestamptz,
    estado text,
    mensajes_cantidad bigint,
    mensajes_entrantes_cantidad bigint,
    mensajes_salientes_cantidad bigint,
    hilos_con_actividad_cantidad bigint,
    conversiones_cantidad bigint,
    subtotal_mensajes numeric,
    costo_meta_periodo numeric,
    costo_mensaje_periodo numeric,
    ajustes_total numeric,
    total numeric,
    moneda char(3),
    cerrado_en timestamptz,
    creado_en timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
WITH scope AS (
    SELECT
        auth.role() = 'service_role' AS is_service_role,
        (
            auth.uid() IS NOT NULL
            AND public.es_owner(auth.uid())
            AND public.usuario_organizacion_id(auth.uid()) = '00000000-0000-0000-0000-000000000001'::uuid
        ) AS is_master_owner,
        public.usuario_organizacion_id(auth.uid()) AS user_organizacion_id
), filtered AS (
    SELECT
        cm.organizacion_id,
        cm.periodo_id,
        cm.conversacion_id,
        cm.direccion,
        cm.cargo_app_importe,
        cm.costo_meta_importe,
        h.conversion_atribuida
    FROM public.cobro_mensajes AS cm
    CROSS JOIN scope AS s
    LEFT JOIN public.cobro_hilos_resumen AS h
      ON h.organizacion_id = cm.organizacion_id
     AND h.periodo_id = cm.periodo_id
     AND h.conversacion_id = cm.conversacion_id
    WHERE ((
        (s.is_service_role OR s.is_master_owner)
        AND (p_organizacion_id IS NULL OR cm.organizacion_id = p_organizacion_id)
    ) OR (
        NOT s.is_service_role
        AND NOT s.is_master_owner
        AND s.user_organizacion_id IS NOT NULL
        AND cm.organizacion_id = s.user_organizacion_id
    ))
      AND (p_categoria_meta IS NULL OR cm.categoria_meta = p_categoria_meta)
      AND (p_direccion IS NULL OR cm.direccion = p_direccion)
      AND (p_desde IS NULL OR cm.creado_en >= p_desde)
      AND (p_hasta IS NULL OR cm.creado_en < p_hasta)
)
SELECT
    cp.id,
    cp.organizacion_id,
    cp.fecha_inicio,
    cp.fecha_fin,
    cp.estado,
    COUNT(*) AS mensajes_cantidad,
    COUNT(*) FILTER (WHERE f.direccion = 'entrante') AS mensajes_entrantes_cantidad,
    COUNT(*) FILTER (WHERE f.direccion = 'saliente') AS mensajes_salientes_cantidad,
    COUNT(DISTINCT f.conversacion_id) AS hilos_con_actividad_cantidad,
    COUNT(DISTINCT f.conversacion_id) FILTER (WHERE f.conversion_atribuida) AS conversiones_cantidad,
    SUM(f.cargo_app_importe) AS subtotal_mensajes,
    SUM(f.costo_meta_importe) AS costo_meta_periodo,
    SUM(f.cargo_app_importe + f.costo_meta_importe) AS costo_mensaje_periodo,
    MAX(cp.ajustes_total) AS ajustes_total,
    SUM(f.cargo_app_importe + f.costo_meta_importe) + MAX(cp.ajustes_total) AS total,
    cp.moneda,
    cp.cerrado_en,
    cp.creado_en
FROM filtered AS f
JOIN public.cobro_periodos AS cp
  ON cp.organizacion_id = f.organizacion_id
 AND cp.id = f.periodo_id
GROUP BY
    cp.id,
    cp.organizacion_id,
    cp.fecha_inicio,
    cp.fecha_fin,
    cp.estado,
    cp.moneda,
    cp.cerrado_en,
    cp.creado_en
ORDER BY cp.fecha_inicio DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.obtener_cobro_resumen_filtrado(uuid, text, text, timestamptz, timestamptz)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.obtener_cobro_resumen_filtrado(uuid, text, text, timestamptz, timestamptz)
FROM PUBLIC, anon;
