-- Cierra de forma acotada callbacks Meta que no pudieron vincularse a un
-- mensaje local. Nunca inserta ni modifica filas de cobro.
CREATE OR REPLACE FUNCTION public.reconcile_stale_meta_delivery_events(
  p_older_than_minutes integer DEFAULT 15,
  p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.eventos_entrega ee
  SET conciliacion_estado = 'no_conciliado',
      conciliacion_motivo = 'mensaje_local_no_encontrado',
      conciliado_en = now()
  WHERE ee.id IN (
    SELECT candidate.id
    FROM public.eventos_entrega candidate
    WHERE candidate.conciliacion_estado = 'pendiente'
      AND candidate.proveedor = 'meta'
      AND candidate.proveedor_mensaje_id LIKE 'wamid.%'
      AND candidate.mensaje_id IS NULL
      AND candidate.creado_en < now() - make_interval(mins => greatest(1, p_older_than_minutes))
      AND NOT EXISTS (
        SELECT 1
        FROM public.mensajes m
        WHERE m.organizacion_id = candidate.organizacion_id
          AND m.proveedor_mensaje_id = candidate.proveedor_mensaje_id
      )
    ORDER BY candidate.creado_en ASC
    LIMIT greatest(1, p_limit)
    FOR UPDATE SKIP LOCKED
  );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stale_meta_delivery_events(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_meta_delivery_events(integer, integer) TO service_role;
