BEGIN;

ALTER TABLE public.ordenes_compra_pagos_programados
    ADD COLUMN IF NOT EXISTS fecha_evento_real date;

ALTER TABLE public.ordenes_compra_pagos_programados
    ADD COLUMN IF NOT EXISTS fecha_pago_real date;

COMMENT ON COLUMN public.ordenes_compra_pagos_programados.fecha_evento_real IS
    'Fecha real del hito que activa el cálculo del pago o saldo.';

COMMENT ON COLUMN public.ordenes_compra_pagos_programados.fecha_pago_real IS
    'Fecha real en la que se efectuó el pago o gasto asociado.';

COMMIT;
