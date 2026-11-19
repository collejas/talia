BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS ultimo_envio_correo_en timestamptz,
    ADD COLUMN IF NOT EXISTS ultimo_envio_whatsapp_en timestamptz,
    ADD COLUMN IF NOT EXISTS ultimo_envio_voz_en timestamptz;

COMMENT ON COLUMN public.prospeccion_prospectos.ultimo_envio_correo_en IS 'Fecha más reciente de aceptación del correo por el proveedor.';
COMMENT ON COLUMN public.prospeccion_prospectos.ultimo_envio_whatsapp_en IS 'Fecha más reciente de aceptación o registro de mensaje WhatsApp.';
COMMENT ON COLUMN public.prospeccion_prospectos.ultimo_envio_voz_en IS 'Fecha más reciente de llamada completada.';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_ultimo_correo_idx ON public.prospeccion_prospectos (organizacion_id, ultimo_envio_correo_en DESC, id);
CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_ultimo_whatsapp_idx ON public.prospeccion_prospectos (organizacion_id, ultimo_envio_whatsapp_en DESC, id);
CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_ultimo_voz_idx ON public.prospeccion_prospectos (organizacion_id, ultimo_envio_voz_en DESC, id);

CREATE OR REPLACE FUNCTION public.sync_prospeccion_prospectos_ultimo_envio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_prospecto uuid;
BEGIN
    v_org := COALESCE(NEW.organizacion_id, OLD.organizacion_id);
    v_prospecto := COALESCE(NEW.prospecto_id, OLD.prospecto_id);
    UPDATE public.prospeccion_prospectos p SET
      ultimo_envio_correo_en=(SELECT max(proveedor_aceptado_en) FROM public.prospeccion_contacto_envio e WHERE e.organizacion_id=v_org AND e.prospecto_id=v_prospecto AND e.canal='correo'),
      ultimo_envio_whatsapp_en=(SELECT max(coalesce(proveedor_aceptado_en,procesado_en,creado_en)) FROM public.prospeccion_contacto_envio e WHERE e.organizacion_id=v_org AND e.prospecto_id=v_prospecto AND e.canal='whatsapp' AND (e.proveedor_aceptado_en IS NOT NULL OR nullif(trim(e.mensaje_id),'') IS NOT NULL)),
      ultimo_envio_voz_en=(SELECT max(coalesce(procesado_en,creado_en)) FROM public.prospeccion_contacto_envio e WHERE e.organizacion_id=v_org AND e.prospecto_id=v_prospecto AND e.canal IN ('llamada','voz','voice','call') AND e.estado IN ('enviado','entregado','completado','respondido','answered','completed','completed-with-recording'))
    WHERE p.organizacion_id=v_org AND p.id=v_prospecto;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_prospeccion_ultimo_envio ON public.prospeccion_contacto_envio;
CREATE TRIGGER trg_prospeccion_ultimo_envio AFTER INSERT OR UPDATE OR DELETE ON public.prospeccion_contacto_envio FOR EACH ROW EXECUTE FUNCTION public.sync_prospeccion_prospectos_ultimo_envio();

COMMIT;
