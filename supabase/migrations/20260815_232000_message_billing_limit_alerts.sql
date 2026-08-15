-- Una alerta por tenant, periodo y métrica. La función actualiza la misma
-- alerta mientras el periodo siga abierto, evitando duplicados por ciclo.
CREATE UNIQUE INDEX IF NOT EXISTS cobro_alertas_org_period_type_uidx
  ON public.cobro_alertas (organizacion_id, periodo_id, tipo);

CREATE OR REPLACE FUNCTION public.evaluate_message_billing_limit_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg record;
  v_severity text;
  v_count integer := 0;
BEGIN
  FOR cfg IN
    SELECT c.organizacion_id, c.limite_mensajes_periodo,
           c.limite_costo_app_periodo, c.limite_costo_meta_periodo,
           c.porcentaje_alerta_consumo, c.suspension_automatica_por_limite,
           p.id AS periodo_id, p.mensajes_cantidad,
           p.costo_mensaje_periodo, p.costo_meta_periodo
    FROM public.cobro_configuracion_tenant c
    JOIN public.cobro_periodos p
      ON p.organizacion_id = c.organizacion_id
     AND p.estado = 'abierto'
  LOOP
    IF cfg.limite_mensajes_periodo IS NOT NULL THEN
      v_severity := CASE
        WHEN cfg.mensajes_cantidad >= cfg.limite_mensajes_periodo THEN 'critical'
        ELSE 'warning'
      END;
      IF cfg.mensajes_cantidad >= ceil(cfg.limite_mensajes_periodo * cfg.porcentaje_alerta_consumo / 100.0) THEN
        INSERT INTO public.cobro_alertas (
          organizacion_id, periodo_id, tipo, severidad, estado, umbral, valor_actual, mensaje
        ) VALUES (
          cfg.organizacion_id, cfg.periodo_id, 'limite_mensajes', v_severity, 'abierta',
          cfg.limite_mensajes_periodo, cfg.mensajes_cantidad,
          format('Consumo de mensajes: %s de %s.', cfg.mensajes_cantidad, cfg.limite_mensajes_periodo)
        )
        ON CONFLICT (organizacion_id, periodo_id, tipo) DO UPDATE SET
          severidad = EXCLUDED.severidad,
          estado = 'abierta',
          umbral = EXCLUDED.umbral,
          valor_actual = EXCLUDED.valor_actual,
          mensaje = EXCLUDED.mensaje,
          resuelto_en = NULL,
          resuelto_por_usuario_id = NULL;
        v_count := v_count + 1;
      ELSE
        UPDATE public.cobro_alertas SET estado = 'resuelta', resuelto_en = COALESCE(resuelto_en, now())
        WHERE organizacion_id = cfg.organizacion_id AND periodo_id = cfg.periodo_id
          AND tipo = 'limite_mensajes' AND estado IN ('abierta', 'acknowledged');
      END IF;
    END IF;

    IF cfg.limite_costo_app_periodo IS NOT NULL THEN
      v_severity := CASE WHEN cfg.costo_mensaje_periodo >= cfg.limite_costo_app_periodo THEN 'critical' ELSE 'warning' END;
      IF cfg.costo_mensaje_periodo >= cfg.limite_costo_app_periodo * cfg.porcentaje_alerta_consumo / 100.0 THEN
        INSERT INTO public.cobro_alertas (organizacion_id, periodo_id, tipo, severidad, estado, umbral, valor_actual, mensaje)
        VALUES (cfg.organizacion_id, cfg.periodo_id, 'limite_costo_app', v_severity, 'abierta', cfg.limite_costo_app_periodo, cfg.costo_mensaje_periodo,
                format('Cargo GEOACTIV: $%s de $%s MXN.', cfg.costo_mensaje_periodo, cfg.limite_costo_app_periodo))
        ON CONFLICT (organizacion_id, periodo_id, tipo) DO UPDATE SET severidad = EXCLUDED.severidad, estado = 'abierta', umbral = EXCLUDED.umbral, valor_actual = EXCLUDED.valor_actual, mensaje = EXCLUDED.mensaje, resuelto_en = NULL, resuelto_por_usuario_id = NULL;
        v_count := v_count + 1;
      ELSE
        UPDATE public.cobro_alertas SET estado = 'resuelta', resuelto_en = COALESCE(resuelto_en, now())
        WHERE organizacion_id = cfg.organizacion_id AND periodo_id = cfg.periodo_id AND tipo = 'limite_costo_app' AND estado IN ('abierta', 'acknowledged');
      END IF;
    END IF;

    IF cfg.limite_costo_meta_periodo IS NOT NULL THEN
      v_severity := CASE WHEN cfg.costo_meta_periodo >= cfg.limite_costo_meta_periodo THEN 'critical' ELSE 'warning' END;
      IF cfg.costo_meta_periodo >= cfg.limite_costo_meta_periodo * cfg.porcentaje_alerta_consumo / 100.0 THEN
        INSERT INTO public.cobro_alertas (organizacion_id, periodo_id, tipo, severidad, estado, umbral, valor_actual, mensaje)
        VALUES (cfg.organizacion_id, cfg.periodo_id, 'limite_costo_meta', v_severity, 'abierta', cfg.limite_costo_meta_periodo, cfg.costo_meta_periodo,
                format('Costo Meta: $%s de $%s MXN.', cfg.costo_meta_periodo, cfg.limite_costo_meta_periodo))
        ON CONFLICT (organizacion_id, periodo_id, tipo) DO UPDATE SET severidad = EXCLUDED.severidad, estado = 'abierta', umbral = EXCLUDED.umbral, valor_actual = EXCLUDED.valor_actual, mensaje = EXCLUDED.mensaje, resuelto_en = NULL, resuelto_por_usuario_id = NULL;
        v_count := v_count + 1;
      ELSE
        UPDATE public.cobro_alertas SET estado = 'resuelta', resuelto_en = COALESCE(resuelto_en, now())
        WHERE organizacion_id = cfg.organizacion_id AND periodo_id = cfg.periodo_id AND tipo = 'limite_costo_meta' AND estado IN ('abierta', 'acknowledged');
      END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_message_billing_limit_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_message_billing_limit_alerts() TO service_role;
