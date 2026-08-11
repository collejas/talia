BEGIN;

-- Acelera las agregaciones de atribución filtradas por tenant y envío.
-- La RPC prospeccion_campana_template_atribucion_rango usa envio_id para
-- resumir respuestas y eventos de Brevo por organización.
CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_org_envio_idx
    ON public.prospeccion_contactos_log (organizacion_id, envio_id)
    WHERE envio_id IS NOT NULL;

COMMIT;
