BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_sales_rep_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    conversacion_id uuid NOT NULL REFERENCES public.conversaciones(id) ON DELETE CASCADE,
    oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
    seller_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    trigger text NOT NULL,
    estado text NOT NULL DEFAULT 'reservado'
        CHECK (estado IN ('reservado', 'enviado', 'fallido')),
    proveedor_mensaje_id text,
    ultimo_error text,
    reservado_en timestamptz NOT NULL DEFAULT now(),
    enviado_en timestamptz,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT whatsapp_sales_rep_notifications_unique_event
        UNIQUE (organizacion_id, conversacion_id, oportunidad_id, seller_id, trigger)
);

CREATE INDEX IF NOT EXISTS whatsapp_sales_rep_notifications_state_idx
    ON public.whatsapp_sales_rep_notifications (estado, actualizado_en DESC);

CREATE INDEX IF NOT EXISTS whatsapp_sales_rep_notifications_provider_idx
    ON public.whatsapp_sales_rep_notifications (proveedor_mensaje_id)
    WHERE proveedor_mensaje_id IS NOT NULL;

ALTER TABLE public.whatsapp_sales_rep_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_sales_rep_notifications_service_role
    ON public.whatsapp_sales_rep_notifications;
CREATE POLICY whatsapp_sales_rep_notifications_service_role
    ON public.whatsapp_sales_rep_notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.whatsapp_sales_rep_notifications IS
    'Reserva idempotente de avisos WhatsApp enviados a vendedores por evento de oportunidad.';

COMMIT;
