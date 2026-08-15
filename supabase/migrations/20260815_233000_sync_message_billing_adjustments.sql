-- Mantiene los totales del periodo al registrar un ajuste auditable.
CREATE OR REPLACE FUNCTION public.sync_message_billing_adjustment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cobro_periodos
  SET ajustes_total = ajustes_total + NEW.importe,
      total = costo_mensaje_periodo + costo_meta_periodo + ajustes_total + NEW.importe
  WHERE organizacion_id = NEW.organizacion_id
    AND id = NEW.periodo_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cobro_ajustes_sync_period_totals ON public.cobro_ajustes;
CREATE TRIGGER cobro_ajustes_sync_period_totals
AFTER INSERT ON public.cobro_ajustes
FOR EACH ROW
EXECUTE FUNCTION public.sync_message_billing_adjustment_totals();

REVOKE ALL ON FUNCTION public.sync_message_billing_adjustment_totals() FROM PUBLIC;
