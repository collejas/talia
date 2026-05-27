BEGIN;

ALTER TABLE public.pedimentos_importacion_gastos
    ADD COLUMN IF NOT EXISTS agente_aduanal_id uuid;

ALTER TABLE public.pedimentos_importacion_gastos
    DROP CONSTRAINT IF EXISTS pedimentos_importacion_gastos_agente_aduanal_id_fkey;

ALTER TABLE public.pedimentos_importacion_gastos
    ADD CONSTRAINT pedimentos_importacion_gastos_agente_aduanal_id_fkey
    FOREIGN KEY (agente_aduanal_id) REFERENCES public.agentes_aduanales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pedimentos_importacion_gastos_org_agente_idx
    ON public.pedimentos_importacion_gastos (organizacion_id, agente_aduanal_id, estado);

COMMENT ON COLUMN public.pedimentos_importacion_gastos.agente_aduanal_id IS 'Agente aduanal asociado al gasto del pedimento.';

CREATE OR REPLACE FUNCTION public.tg_validate_pedimentos_importacion_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_org uuid;
    v_item_org uuid;
    v_item_orden_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'pedimentos_importacion' THEN
        IF NEW.agente_aduanal_id IS NOT NULL THEN
            SELECT organizacion_id
            INTO v_org
            FROM public.agentes_aduanales
            WHERE id = NEW.agente_aduanal_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Agente aduanal no encontrado';
            END IF;

            IF v_org <> NEW.organizacion_id THEN
                RAISE EXCEPTION 'El agente aduanal debe pertenecer a la misma organizacion';
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'pedimentos_importacion_ordenes_compra' THEN
        SELECT organizacion_id
        INTO v_org
        FROM public.pedimentos_importacion
        WHERE id = NEW.pedimento_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Pedimento no encontrado';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El pedimento debe pertenecer a la misma organizacion';
        END IF;

        SELECT organizacion_id
        INTO v_org
        FROM public.ordenes_compra
        WHERE id = NEW.orden_compra_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Orden de compra no encontrada';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'La orden de compra debe pertenecer a la misma organizacion';
        END IF;
    ELSIF TG_TABLE_NAME = 'pedimentos_importacion_gastos' THEN
        SELECT organizacion_id
        INTO v_org
        FROM public.pedimentos_importacion
        WHERE id = NEW.pedimento_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Pedimento no encontrado';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El gasto debe pertenecer a la misma organizacion que el pedimento';
        END IF;

        IF NEW.agente_aduanal_id IS NOT NULL THEN
            SELECT organizacion_id
            INTO v_org
            FROM public.agentes_aduanales
            WHERE id = NEW.agente_aduanal_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Agente aduanal no encontrado';
            END IF;

            IF v_org <> NEW.organizacion_id THEN
                RAISE EXCEPTION 'El agente aduanal debe pertenecer a la misma organizacion que el gasto';
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'pedimentos_importacion_prorrateos' THEN
        SELECT organizacion_id
        INTO v_org
        FROM public.pedimentos_importacion
        WHERE id = NEW.pedimento_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Pedimento no encontrado';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El prorrateo debe pertenecer a la misma organizacion que el pedimento';
        END IF;

        SELECT organizacion_id, orden_compra_id
        INTO v_item_org, v_item_orden_id
        FROM public.ordenes_compra_items
        WHERE id = NEW.orden_compra_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item de orden de compra no encontrado';
        END IF;

        IF v_item_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El item debe pertenecer a la misma organizacion';
        END IF;

        IF v_item_orden_id <> NEW.orden_compra_id THEN
            RAISE EXCEPTION 'El item no corresponde a la orden de compra indicada';
        END IF;

        SELECT organizacion_id
        INTO v_org
        FROM public.ordenes_compra
        WHERE id = NEW.orden_compra_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Orden de compra no encontrada';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'La orden de compra debe pertenecer a la misma organizacion';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_pedimentos_importacion_gastos_validate_org ON public.pedimentos_importacion_gastos;
CREATE TRIGGER t_pedimentos_importacion_gastos_validate_org
    BEFORE INSERT OR UPDATE ON public.pedimentos_importacion_gastos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_validate_pedimentos_importacion_org_integrity();

COMMIT;
