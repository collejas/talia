-- El inventario en transito puede existir al registrar una recepcion, pero no
-- puede reservarse ni usarse como disponibilidad comercial.
CREATE OR REPLACE FUNCTION public.trg_validar_reserva_almacen_comercial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_almacen public.almacenes%ROWTYPE;
BEGIN
    SELECT *
      INTO v_almacen
      FROM public.almacenes
     WHERE id = NEW.almacen_id
       AND organizacion_id = NEW.organizacion_id
       AND activo IS TRUE
     FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El almacen de la reserva no pertenece a la organizacion o esta inactivo';
    END IF;

    IF v_almacen.tipo = 'transito' THEN
        RAISE EXCEPTION 'El almacen en transito no puede reservar inventario';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_validar_reserva_almacen_comercial() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validar_reserva_almacen_comercial ON public.inventario_reservas;
CREATE TRIGGER trg_validar_reserva_almacen_comercial
BEFORE INSERT OR UPDATE OF almacen_id, organizacion_id ON public.inventario_reservas
FOR EACH ROW EXECUTE FUNCTION public.trg_validar_reserva_almacen_comercial();
