BEGIN;

-- Todas las organizaciones deben tener una política explícita por canal.
-- La restricción única hace que este bootstrap sea idempotente.
CREATE OR REPLACE FUNCTION public.bootstrap_close_lead_policies_for_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.close_lead_policies (organizacion_id, canal)
    VALUES
        (NEW.id, 'whatsapp'),
        (NEW.id, 'webchat')
    ON CONFLICT (organizacion_id, canal) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_close_lead_policies_for_organization() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bootstrap_close_lead_policies ON public.organizaciones;
CREATE TRIGGER trg_bootstrap_close_lead_policies
    AFTER INSERT ON public.organizaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.bootstrap_close_lead_policies_for_organization();

-- Repara organizaciones creadas antes de este bootstrap o durante una
-- ventana en la que la política todavía no existía.
INSERT INTO public.close_lead_policies (organizacion_id, canal)
SELECT o.id, channels.canal
FROM public.organizaciones AS o
CROSS JOIN (VALUES ('whatsapp'::text), ('webchat'::text)) AS channels(canal)
ON CONFLICT (organizacion_id, canal) DO NOTHING;

COMMIT;
