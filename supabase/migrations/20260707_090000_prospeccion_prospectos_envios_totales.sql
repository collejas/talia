BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS envios_correo_total bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS envios_whatsapp_total bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS envios_voz_total bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS envios_total bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.prospeccion_prospectos.envios_correo_total IS 'Total de envios por correo asociados al prospecto.';
COMMENT ON COLUMN public.prospeccion_prospectos.envios_whatsapp_total IS 'Total de envios por WhatsApp asociados al prospecto.';
COMMENT ON COLUMN public.prospeccion_prospectos.envios_voz_total IS 'Total de envios de voz o llamada asociados al prospecto.';
COMMENT ON COLUMN public.prospeccion_prospectos.envios_total IS 'Total acumulado de envios asociados al prospecto, sin importar canal.';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_envios_correo_total_idx
    ON public.prospeccion_prospectos (organizacion_id, envios_correo_total);

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_envios_whatsapp_total_idx
    ON public.prospeccion_prospectos (organizacion_id, envios_whatsapp_total);

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_envios_voz_total_idx
    ON public.prospeccion_prospectos (organizacion_id, envios_voz_total);

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_envios_total_idx
    ON public.prospeccion_prospectos (organizacion_id, envios_total);

CREATE OR REPLACE FUNCTION public.sync_prospeccion_prospectos_envio_totales(
    p_organizacion_id uuid,
    p_prospecto_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_prospecto_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.prospeccion_prospectos p
    SET envios_correo_total = COALESCE(s.correo_total, 0),
        envios_whatsapp_total = COALESCE(s.whatsapp_total, 0),
        envios_voz_total = COALESCE(s.voz_total, 0),
        envios_total = COALESCE(s.total_envios, 0)
    FROM (
        SELECT
            COUNT(*) FILTER (WHERE LOWER(COALESCE(e.canal, '')) = 'correo')::bigint AS correo_total,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(e.canal, '')) = 'whatsapp')::bigint AS whatsapp_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) IN ('llamada', 'voz', 'voice', 'call')
            )::bigint AS voz_total,
            COUNT(*)::bigint AS total_envios
        FROM public.prospeccion_contacto_envio e
        WHERE e.organizacion_id = p_organizacion_id
          AND e.prospecto_id = p_prospecto_id
    ) AS s
    WHERE p.organizacion_id = p_organizacion_id
      AND p.id = p_prospecto_id;
END;
$function$;

COMMENT ON FUNCTION public.sync_prospeccion_prospectos_envio_totales(uuid, uuid) IS
    'Recalcula los totales de envios por canal para un prospecto concreto.';

CREATE OR REPLACE FUNCTION public.tg_prospeccion_contacto_envio_sync_prospecto_totales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.sync_prospeccion_prospectos_envio_totales(OLD.organizacion_id, OLD.prospecto_id);
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM public.sync_prospeccion_prospectos_envio_totales(NEW.organizacion_id, NEW.prospecto_id);
        IF OLD.organizacion_id IS DISTINCT FROM NEW.organizacion_id
           OR OLD.prospecto_id IS DISTINCT FROM NEW.prospecto_id THEN
            PERFORM public.sync_prospeccion_prospectos_envio_totales(OLD.organizacion_id, OLD.prospecto_id);
        END IF;
    ELSE
        PERFORM public.sync_prospeccion_prospectos_envio_totales(NEW.organizacion_id, NEW.prospecto_id);
    END IF;

    RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.tg_prospeccion_contacto_envio_sync_prospecto_totales() IS
    'Mantiene sincronizados los contadores derivados de envios en prospeccion_prospectos.';

DROP TRIGGER IF EXISTS trg_prospeccion_contacto_envio_sync_prospecto_totales ON public.prospeccion_contacto_envio;
CREATE TRIGGER trg_prospeccion_contacto_envio_sync_prospecto_totales
AFTER INSERT OR UPDATE OR DELETE ON public.prospeccion_contacto_envio
FOR EACH ROW
EXECUTE FUNCTION public.tg_prospeccion_contacto_envio_sync_prospecto_totales();

UPDATE public.prospeccion_prospectos p
SET envios_correo_total = COALESCE(s.correo_total, 0),
    envios_whatsapp_total = COALESCE(s.whatsapp_total, 0),
    envios_voz_total = COALESCE(s.voz_total, 0),
    envios_total = COALESCE(s.total_envios, 0)
FROM (
    SELECT
        prospecto_id,
        organizacion_id,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(canal, '')) = 'correo')::bigint AS correo_total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(canal, '')) = 'whatsapp')::bigint AS whatsapp_total,
        COUNT(*) FILTER (
            WHERE LOWER(COALESCE(canal, '')) IN ('llamada', 'voz', 'voice', 'call')
        )::bigint AS voz_total,
        COUNT(*)::bigint AS total_envios
    FROM public.prospeccion_contacto_envio
    GROUP BY prospecto_id, organizacion_id
) AS s
WHERE p.organizacion_id = s.organizacion_id
  AND p.id = s.prospecto_id;

COMMIT;
