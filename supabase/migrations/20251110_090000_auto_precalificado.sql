BEGIN;

--
-- Helper to promote a lead card to the "precalificado" stage when contact data is complete.
--
CREATE OR REPLACE FUNCTION public._lead_tarjeta_auto_precalificar(p_tarjeta_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_tablero_id uuid;
    v_contacto_id uuid;
    v_etapa_actual uuid;
    v_contacto record;
    v_etapa_pre uuid;
    v_etapa_pre_orden smallint;
    v_etapa_actual_orden smallint;
BEGIN
    IF p_tarjeta_id IS NULL THEN
        RETURN;
    END IF;

    SELECT lt.tablero_id,
           lt.contacto_id,
           lt.etapa_id
      INTO v_tablero_id,
           v_contacto_id,
           v_etapa_actual
      FROM public.lead_tarjetas lt
     WHERE lt.id = p_tarjeta_id;

    IF v_tablero_id IS NULL OR v_contacto_id IS NULL OR v_etapa_actual IS NULL THEN
        RETURN;
    END IF;

    SELECT c.nombre_completo,
           c.correo,
           c.telefono_e164,
           c.company_name
      INTO v_contacto
      FROM public.contactos c
     WHERE c.id = v_contacto_id;

    IF v_contacto IS NULL THEN
        RETURN;
    END IF;

    IF NOT (
        COALESCE(NULLIF(btrim(v_contacto.nombre_completo), ''), NULL) IS NOT NULL
        AND COALESCE(NULLIF(btrim(v_contacto.correo), ''), NULL) IS NOT NULL
        AND COALESCE(NULLIF(btrim(v_contacto.telefono_e164), ''), NULL) IS NOT NULL
        AND COALESCE(NULLIF(btrim(v_contacto.company_name), ''), NULL) IS NOT NULL
    ) THEN
        RETURN;
    END IF;

    SELECT le.id, le.orden
      INTO v_etapa_pre, v_etapa_pre_orden
      FROM public.lead_etapas le
     WHERE le.tablero_id = v_tablero_id
       AND le.codigo = 'precalificado'
     LIMIT 1;

    IF v_etapa_pre IS NULL THEN
        RETURN;
    END IF;

    IF v_etapa_pre = v_etapa_actual THEN
        RETURN;
    END IF;

    SELECT le.orden
      INTO v_etapa_actual_orden
      FROM public.lead_etapas le
     WHERE le.id = v_etapa_actual;

    IF v_etapa_actual_orden IS NULL OR v_etapa_pre_orden IS NULL THEN
        RETURN;
    END IF;

    -- Solo promociona cuando la etapa actual está antes de "precalificado".
    IF v_etapa_actual_orden >= v_etapa_pre_orden THEN
        RETURN;
    END IF;

    UPDATE public.lead_tarjetas
       SET etapa_id = v_etapa_pre
     WHERE id = p_tarjeta_id
       AND etapa_id IS DISTINCT FROM v_etapa_pre;
END;
$$;

COMMENT ON FUNCTION public._lead_tarjeta_auto_precalificar(uuid)
    IS 'Promueve automáticamente la tarjeta a la etapa "precalificado" cuando el contacto tiene nombre, correo, teléfono y empresa.';

--
-- Trigger para ejecutar la promoción después de insertar o actualizar una tarjeta.
--
CREATE OR REPLACE FUNCTION public.tg_lead_tarjetas_auto_precalificado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public._lead_tarjeta_auto_precalificar(NEW.id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER lead_tarjetas_auto_precalificado
AFTER INSERT OR UPDATE OF contacto_id, etapa_id, tablero_id
ON public.lead_tarjetas
FOR EACH ROW
EXECUTE FUNCTION public.tg_lead_tarjetas_auto_precalificado();

--
-- Trigger para reaccionar a cambios en los datos del contacto asociados a tarjetas existentes.
--
CREATE OR REPLACE FUNCTION public.tg_contactos_auto_precalificado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tarjeta_id uuid;
BEGIN
    -- Evita trabajo innecesario si los campos relevantes no cambiaron.
    IF TG_OP = 'UPDATE' THEN
        IF COALESCE(NEW.nombre_completo, '') = COALESCE(OLD.nombre_completo, '')
           AND COALESCE(NEW.correo, '') = COALESCE(OLD.correo, '')
           AND COALESCE(NEW.telefono_e164, '') = COALESCE(OLD.telefono_e164, '')
           AND COALESCE(NEW.company_name, '') = COALESCE(OLD.company_name, '') THEN
            RETURN NEW;
        END IF;
    END IF;

    FOR v_tarjeta_id IN
        SELECT lt.id
          FROM public.lead_tarjetas lt
         WHERE lt.contacto_id = NEW.id
    LOOP
        PERFORM public._lead_tarjeta_auto_precalificar(v_tarjeta_id);
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER contactos_auto_precalificado
AFTER INSERT OR UPDATE OF nombre_completo, correo, telefono_e164, company_name
ON public.contactos
FOR EACH ROW
EXECUTE FUNCTION public.tg_contactos_auto_precalificado();

COMMIT;
