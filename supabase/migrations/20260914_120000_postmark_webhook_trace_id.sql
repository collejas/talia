BEGIN;

-- Postmark conserva este identificador durante los reintentos del mismo evento.
-- MessageID identifica el mensaje, pero no distingue por sí solo Delivery,
-- Bounce, Open, Click y los demás eventos que puede generar.
ALTER TABLE public.tenant_email_webhook_receipts
    ADD COLUMN IF NOT EXISTS webhook_trace_id text;

CREATE INDEX IF NOT EXISTS tenant_email_webhook_receipts_trace_idx
    ON public.tenant_email_webhook_receipts (organizacion_id, server_id, event_type, webhook_trace_id)
    WHERE webhook_trace_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_webhook_receipts_trace_uq
    ON public.tenant_email_webhook_receipts (organizacion_id, server_id, event_type, webhook_trace_id)
    WHERE webhook_trace_id IS NOT NULL;

COMMENT ON COLUMN public.tenant_email_webhook_receipts.webhook_trace_id IS
    'X-PM-Webhook-Trace-Id de Postmark; estable durante los reintentos del mismo evento.';

COMMIT;
