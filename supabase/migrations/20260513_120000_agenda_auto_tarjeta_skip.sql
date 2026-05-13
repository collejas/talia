BEGIN;

CREATE OR REPLACE FUNCTION public.tg_conversaciones_auto_tarjeta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tablero uuid;
    v_etapa uuid;
    v_persona_id uuid;
    v_source text;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
    legacy_boards boolean := (to_regclass('public.lead_tableros') IS NOT NULL);
    legacy_stages boolean := (to_regclass('public.lead_etapas') IS NOT NULL);
BEGIN
    IF NEW.estado = 'cerrada' THEN
        RETURN NEW;
    END IF;

    IF NEW.ultimo_entrante_en IS NULL THEN
        RETURN NEW;
    END IF;

    v_source := lower(coalesce(NEW.inbox_context->>'source', ''));
    IF v_source IN ('agenda_panel_booking', 'agenda_manual', 'agenda') THEN
        RETURN NEW;
    END IF;

    IF NOT (legacy_cards AND legacy_boards AND legacy_stages) THEN
        RETURN NEW;
    END IF;

    v_persona_id := COALESCE(NEW.persona_id, NEW.contacto_id);

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
        v_persona_id,
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
$function$;

COMMENT ON FUNCTION public.tg_conversaciones_auto_tarjeta()
    IS 'Crea una tarjeta solo para conversaciones entrantes no originadas desde agenda.';

COMMIT;
