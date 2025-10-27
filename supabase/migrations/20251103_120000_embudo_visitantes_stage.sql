BEGIN;

-- Inserta etapa de visitantes sin chat al inicio de cada tablero
WITH boards AS (
    SELECT id
    FROM public.lead_tableros
)
INSERT INTO public.lead_etapas (
    tablero_id,
    codigo,
    nombre,
    orden,
    categoria,
    probabilidad,
    sla_horas,
    metadatos
)
SELECT
    b.id,
    'visitantes_sin_chat',
    'Visitantes (sin chat)',
    0,
    'abierta',
    NULL,
    NULL,
    jsonb_build_object(
        'color', 'stone',
        'is_counter_only', true,
        'categoria_resumen', 'visitantes',
        'descripcion', 'Visitas al webchat sin interacción con el asistente'
    )
FROM boards AS b
ON CONFLICT (tablero_id, codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        orden = EXCLUDED.orden,
        categoria = EXCLUDED.categoria,
        probabilidad = EXCLUDED.probabilidad,
        sla_horas = EXCLUDED.sla_horas,
        metadatos = COALESCE(public.lead_etapas.metadatos, '{}'::jsonb)
            || jsonb_build_object(
                'color', 'stone',
                'is_counter_only', true,
                'categoria_resumen', 'visitantes',
                'descripcion', 'Visitas al webchat sin interacción con el asistente'
            ),
        actualizado_en = now();

-- Ajusta trigger para omitir etapas solo contador al seleccionar etapa por defecto
CREATE OR REPLACE FUNCTION public.tg_lead_tarjetas_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_default_tablero uuid;
    v_categoria public.lead_categoria;
    v_etapa_id uuid;
    v_conv_canal text;
    v_conv_asignado uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.actualizado_en := now();
    ELSE
        IF NEW.creado_en IS NULL THEN
            NEW.creado_en := now();
        END IF;
        NEW.actualizado_en := now();
    END IF;

    IF NEW.tablero_id IS NULL THEN
        SELECT id INTO v_default_tablero
          FROM public.lead_tableros
         WHERE es_default IS TRUE
         ORDER BY creado_en
         LIMIT 1;

        IF v_default_tablero IS NULL THEN
            RAISE EXCEPTION 'No se encontró tablero por defecto para leads';
        END IF;
        NEW.tablero_id := v_default_tablero;
    END IF;

    IF NEW.etapa_id IS NULL THEN
        SELECT id INTO v_etapa_id
          FROM public.lead_etapas
         WHERE tablero_id = NEW.tablero_id
           AND COALESCE(metadatos->>'is_counter_only', 'false') <> 'true'
         ORDER BY orden
         LIMIT 1;
        IF v_etapa_id IS NULL THEN
            RAISE EXCEPTION 'El tablero % no tiene etapas configuradas', NEW.tablero_id;
        END IF;
        NEW.etapa_id := v_etapa_id;
    END IF;

    IF NEW.propietario_usuario_id IS NULL THEN
        SELECT propietario_usuario_id INTO NEW.propietario_usuario_id
          FROM public.contactos
         WHERE id = NEW.contacto_id;
    END IF;

    IF NEW.metadata IS NULL THEN
        NEW.metadata := '{}'::jsonb;
    END IF;

    IF NEW.fuente IS NULL THEN
        NEW.fuente := 'api';
    END IF;

    IF NEW.conversacion_id IS NOT NULL THEN
        SELECT canal, asignado_a_usuario_id
          INTO v_conv_canal, v_conv_asignado
          FROM public.conversaciones
         WHERE id = NEW.conversacion_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La conversación % no existe', NEW.conversacion_id;
        END IF;
        IF NEW.canal IS NULL THEN
            NEW.canal := v_conv_canal;
        END IF;
        IF NEW.asignado_a_usuario_id IS NULL THEN
            NEW.asignado_a_usuario_id := v_conv_asignado;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_lead_tarjetas_before_write()
    IS 'Normaliza campos de tarjetas y asigna tablero/etapa por defecto cuando faltan datos.';

-- Ajusta trigger de creación automática para ignorar etapas solo contador
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
       AND COALESCE(metadatos->>'is_counter_only', 'false') <> 'true'
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

COMMENT ON FUNCTION public.tg_conversaciones_auto_tarjeta()
    IS 'Crea una tarjeta de lead cuando inicia una conversación con interacción entrante.';

CREATE OR REPLACE FUNCTION public.embudo_visitantes_contador(
    p_closed_after timestamptz DEFAULT (now() - interval '30 days'),
    p_closed_before timestamptz DEFAULT NULL
)
RETURNS TABLE(total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
    WITH base AS (
        SELECT sc.session_id
          FROM public.webchat_session_closures sc
         WHERE (p_closed_after IS NULL OR sc.closed_at >= p_closed_after)
           AND (p_closed_before IS NULL OR sc.closed_at <= p_closed_before)
    ),
    filtered AS (
        SELECT b.session_id
          FROM base b
          LEFT JOIN public.mensajes m
            ON m.datos ->> 'session_id' = b.session_id
           AND m.direccion = 'entrante'
        WHERE m.id IS NULL
    )
    SELECT COUNT(*)::bigint AS total
    FROM filtered;
$$;

GRANT EXECUTE ON FUNCTION public.embudo_visitantes_contador(timestamptz, timestamptz)
    TO postgres, service_role, authenticated;

COMMIT;
