BEGIN;

DO $$
BEGIN
    IF to_regclass('public.pedimentos_importacion_items_v') IS NOT NULL THEN
        EXECUTE 'ALTER VIEW public.pedimentos_importacion_items_v SET (security_invoker = true)';
    END IF;

    IF to_regclass('public.pedimentos_importacion_gastos_ordenes_v') IS NOT NULL THEN
        EXECUTE 'ALTER VIEW public.pedimentos_importacion_gastos_ordenes_v SET (security_invoker = true)';
    END IF;

    IF to_regclass('public.v_asignaciones_vendedores') IS NOT NULL THEN
        EXECUTE 'ALTER VIEW public.v_asignaciones_vendedores SET (security_invoker = true)';
    END IF;
END $$;

COMMIT;
