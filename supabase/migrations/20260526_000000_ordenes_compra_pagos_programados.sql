BEGIN;

CREATE TABLE IF NOT EXISTS public.ordenes_compra_pagos_programados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    tipo_pago text NOT NULL,
    evento_base text NOT NULL,
    porcentaje numeric(5,2),
    monto numeric(14,4),
    moneda_codigo text NOT NULL,
    dias_credito integer,
    fecha_vencimiento_calculada date,
    estado text NOT NULL DEFAULT 'programado',
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ordenes_compra_pagos_programados_porcentaje_ck CHECK (porcentaje IS NULL OR (porcentaje >= 0 AND porcentaje <= 100)),
    CONSTRAINT ordenes_compra_pagos_programados_dias_credito_ck CHECK (dias_credito IS NULL OR dias_credito >= 0),
    CONSTRAINT ordenes_compra_pagos_programados_tipo_pago_ck CHECK (tipo_pago IN ('anticipo', 'saldo', 'parcial')),
    CONSTRAINT ordenes_compra_pagos_programados_estado_ck CHECK (estado IN ('programado', 'pendiente', 'parcial', 'pagado', 'vencido', 'cancelado'))
);

COMMENT ON TABLE public.ordenes_compra_pagos_programados IS 'Detalle operativo de pagos programados por orden de compra.';

CREATE INDEX IF NOT EXISTS ordenes_compra_pagos_programados_orden_idx
    ON public.ordenes_compra_pagos_programados (orden_compra_id, estado, creado_en);

ALTER TABLE public.ordenes_compra_pagos_programados
    ADD CONSTRAINT ordenes_compra_pagos_programados_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_pagos_programados
    ADD CONSTRAINT ordenes_compra_pagos_programados_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_pagos_programados
    ADD CONSTRAINT ordenes_compra_pagos_programados_moneda_codigo_fkey
    FOREIGN KEY (moneda_codigo) REFERENCES public.monedas(codigo) ON DELETE RESTRICT;

ALTER TABLE public.ordenes_compra_pagos_programados ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_ordenes_compra_pagos_programados_set_org ON public.ordenes_compra_pagos_programados;
CREATE TRIGGER t_ordenes_compra_pagos_programados_set_org
    BEFORE INSERT ON public.ordenes_compra_pagos_programados
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_pagos_programados_touch_updated_at ON public.ordenes_compra_pagos_programados;
CREATE TRIGGER t_ordenes_compra_pagos_programados_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra_pagos_programados
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY ordenes_compra_pagos_programados_select_org
    ON public.ordenes_compra_pagos_programados
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_pagos_programados_write_org
    ON public.ordenes_compra_pagos_programados
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
