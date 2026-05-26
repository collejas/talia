BEGIN;

ALTER TABLE public.ordenes_compra_pagos_programados
    ADD COLUMN IF NOT EXISTS fecha_evento_real date,
    ADD COLUMN IF NOT EXISTS fecha_pago_real date,
    ADD COLUMN IF NOT EXISTS referencia_pago text;

COMMENT ON COLUMN public.ordenes_compra_pagos_programados.fecha_evento_real IS 'Fecha real del hito que inicia el cómputo del pago.';
COMMENT ON COLUMN public.ordenes_compra_pagos_programados.fecha_pago_real IS 'Fecha real en que se ejecutó el pago.';
COMMENT ON COLUMN public.ordenes_compra_pagos_programados.referencia_pago IS 'Referencia bancaria, folio o nota asociada al pago.';

COMMIT;
