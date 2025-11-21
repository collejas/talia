BEGIN;

-- Evita crear tarjetas automáticas cuando la conversación no tiene mensajes entrantes.
CREATE OR REPLACE FUNCTION public.tg_conversaciones_auto_tarjeta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tablero uuid;
    v_etapa uuid;
BEGIN
    IF NEW.estado = 'cerrada' THEN
        RETURN NEW;
    END IF;

    IF NEW.ultimo_entrante_en IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.lead_tarjetas lt
         WHERE lt.conversacion_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_tablero
      FROM public.lead_tableros
     WHERE es_default = TRUE
     ORDER BY creado_en
     LIMIT 1;

    IF v_tablero IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_etapa
      FROM public.lead_etapas
     WHERE tablero_id = v_tablero
     ORDER BY orden
     LIMIT 1;

    IF v_etapa IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.lead_tarjetas (
        contacto_id,
        conversacion_id,
        tablero_id,
        etapa_id,
        canal,
        propietario_usuario_id,
        asignado_a_usuario_id,
        fuente,
        metadata
    )
    VALUES (
        NEW.contacto_id,
        NEW.id,
        v_tablero,
        v_etapa,
        NEW.canal,
        NEW.asignado_a_usuario_id,
        NEW.asignado_a_usuario_id,
        'asistente',
        jsonb_build_object('auto', true, 'motivo', 'conversacion_nueva')
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_conversaciones_auto_tarjeta() IS 'Crea una tarjeta de lead cuando inicia una conversación con interacción entrante.';

COMMIT;
