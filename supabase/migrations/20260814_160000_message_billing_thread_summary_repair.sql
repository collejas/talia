-- Repara el resumen operativo de hilos. La migración de snapshot de categoría
-- reemplazó registrar_cobro_mensaje y dejó de mantener cobro_hilos_resumen.

CREATE OR REPLACE FUNCTION public.sync_cobro_hilo_resumen_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
BEGIN
    INSERT INTO public.cobro_hilos_resumen (
        organizacion_id,
        periodo_id,
        conversacion_id,
        canal,
        iniciador_hilo,
        fecha_inicio_hilo,
        fecha_primer_mensaje_saliente,
        mensaje_saliente_inicial_id,
        mensajes_entrantes_cantidad,
        mensajes_salientes_cantidad,
        ultimo_mensaje_en
    )
    SELECT
        NEW.organizacion_id,
        NEW.periodo_id,
        NEW.conversacion_id,
        NEW.canal,
        NEW.origen_mensaje,
        COALESCE(c.iniciada_en, NEW.creado_en),
        CASE WHEN NEW.direccion = 'saliente' THEN NEW.creado_en ELSE NULL END,
        CASE WHEN NEW.direccion = 'saliente' THEN NEW.mensaje_id ELSE NULL END,
        CASE WHEN NEW.direccion = 'entrante' THEN 1 ELSE 0 END,
        CASE WHEN NEW.direccion = 'saliente' THEN 1 ELSE 0 END,
        NEW.creado_en
    FROM public.conversaciones AS c
    WHERE c.organizacion_id = NEW.organizacion_id
      AND c.id = NEW.conversacion_id
    ON CONFLICT (organizacion_id, periodo_id, conversacion_id) DO UPDATE SET
        mensajes_entrantes_cantidad = public.cobro_hilos_resumen.mensajes_entrantes_cantidad
            + EXCLUDED.mensajes_entrantes_cantidad,
        mensajes_salientes_cantidad = public.cobro_hilos_resumen.mensajes_salientes_cantidad
            + EXCLUDED.mensajes_salientes_cantidad,
        fecha_primer_mensaje_saliente = COALESCE(
            public.cobro_hilos_resumen.fecha_primer_mensaje_saliente,
            EXCLUDED.fecha_primer_mensaje_saliente
        ),
        mensaje_saliente_inicial_id = COALESCE(
            public.cobro_hilos_resumen.mensaje_saliente_inicial_id,
            EXCLUDED.mensaje_saliente_inicial_id
        ),
        ultimo_mensaje_en = GREATEST(
            public.cobro_hilos_resumen.ultimo_mensaje_en,
            EXCLUDED.ultimo_mensaje_en
        );

    UPDATE public.cobro_periodos AS cp
    SET hilos_con_actividad_cantidad = (
        SELECT COUNT(*)::integer
        FROM public.cobro_hilos_resumen AS h
        WHERE h.organizacion_id = NEW.organizacion_id
          AND h.periodo_id = NEW.periodo_id
    )
    WHERE cp.organizacion_id = NEW.organizacion_id
      AND cp.id = NEW.periodo_id;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cobro_mensajes_sync_hilo_after_insert
    ON public.cobro_mensajes;

CREATE TRIGGER cobro_mensajes_sync_hilo_after_insert
AFTER INSERT ON public.cobro_mensajes
FOR EACH ROW
EXECUTE FUNCTION public.sync_cobro_hilo_resumen_after_insert();

-- Reconstrucción idempotente para los cargos existentes que fueron creados
-- mientras la función reemplazada no mantenía el resumen de hilos.
INSERT INTO public.cobro_hilos_resumen (
    organizacion_id,
    periodo_id,
    conversacion_id,
    canal,
    iniciador_hilo,
    fecha_inicio_hilo,
    fecha_primer_mensaje_saliente,
    mensaje_saliente_inicial_id,
    mensajes_entrantes_cantidad,
    mensajes_salientes_cantidad,
    ultimo_mensaje_en
)
SELECT
    cm.organizacion_id,
    cm.periodo_id,
    cm.conversacion_id,
    (ARRAY_AGG(cm.canal ORDER BY cm.creado_en, cm.id))[1],
    CASE WHEN (ARRAY_AGG(cm.direccion ORDER BY cm.creado_en, cm.id))[1] = 'saliente'
        THEN 'empresa' ELSE 'cliente' END,
    COALESCE(c.iniciada_en, MIN(m.creado_en)),
    MIN(m.creado_en) FILTER (WHERE cm.direccion = 'saliente'),
    (ARRAY_AGG(m.id ORDER BY m.creado_en, m.id)
        FILTER (WHERE cm.direccion = 'saliente'))[1],
    COUNT(*) FILTER (WHERE cm.direccion = 'entrante')::integer,
    COUNT(*) FILTER (WHERE cm.direccion = 'saliente')::integer,
    MAX(m.creado_en)
FROM public.cobro_mensajes AS cm
JOIN public.mensajes AS m
    ON m.organizacion_id = cm.organizacion_id
   AND m.id = cm.mensaje_id
LEFT JOIN public.conversaciones AS c
    ON c.organizacion_id = cm.organizacion_id
   AND c.id = cm.conversacion_id
GROUP BY
    cm.organizacion_id,
    cm.periodo_id,
    cm.conversacion_id,
    c.iniciada_en
ON CONFLICT (organizacion_id, periodo_id, conversacion_id) DO UPDATE SET
    canal = EXCLUDED.canal,
    iniciador_hilo = EXCLUDED.iniciador_hilo,
    fecha_inicio_hilo = EXCLUDED.fecha_inicio_hilo,
    fecha_primer_mensaje_saliente = EXCLUDED.fecha_primer_mensaje_saliente,
    mensaje_saliente_inicial_id = EXCLUDED.mensaje_saliente_inicial_id,
    mensajes_entrantes_cantidad = EXCLUDED.mensajes_entrantes_cantidad,
    mensajes_salientes_cantidad = EXCLUDED.mensajes_salientes_cantidad,
    ultimo_mensaje_en = EXCLUDED.ultimo_mensaje_en;

UPDATE public.cobro_periodos AS cp
SET hilos_con_actividad_cantidad = (
    SELECT COUNT(*)::integer
    FROM public.cobro_hilos_resumen AS h
    WHERE h.organizacion_id = cp.organizacion_id
      AND h.periodo_id = cp.id
);

COMMENT ON FUNCTION public.sync_cobro_hilo_resumen_after_insert()
IS 'Mantiene el resumen y el contador de hilos al insertar un cargo de mensaje.';

REVOKE ALL ON FUNCTION public.sync_cobro_hilo_resumen_after_insert()
FROM PUBLIC, anon, authenticated;
