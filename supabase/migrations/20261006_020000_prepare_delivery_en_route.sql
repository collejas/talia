BEGIN;

CREATE OR REPLACE FUNCTION public.crm_preparar_y_marcar_entrega_en_ruta(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_items jsonb,
    p_fecha_entrega date DEFAULT CURRENT_DATE,
    p_referencia text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (entrega_id uuid, entrega_estado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_entrega_id uuid;
BEGIN
    SELECT preparada.entrega_id
      INTO v_entrega_id
      FROM public.crm_preparar_entrega_pedido_venta(
          p_organizacion_id, p_pedido_venta_id, p_items, p_fecha_entrega,
          p_referencia, p_observaciones, p_usuario_id
      ) AS preparada;

    RETURN QUERY
    SELECT marcada.entrega_id, marcada.entrega_estado
      FROM public.crm_marcar_entrega_en_ruta(
          p_organizacion_id, v_entrega_id, p_usuario_id
      ) AS marcada;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_preparar_y_marcar_entrega_en_ruta(uuid, uuid, jsonb, date, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_preparar_y_marcar_entrega_en_ruta(uuid, uuid, jsonb, date, text, text, uuid)
    TO service_role;

COMMIT;
