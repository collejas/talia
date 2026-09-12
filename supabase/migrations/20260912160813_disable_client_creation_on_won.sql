BEGIN;

DROP TRIGGER IF EXISTS oportunidades_auto_crear_cliente_ganada
    ON public.oportunidades;

COMMENT ON TABLE public.clientes IS
    'Maestro de clientes; se crea o activa al registrar un pago confirmado.';

COMMIT;
