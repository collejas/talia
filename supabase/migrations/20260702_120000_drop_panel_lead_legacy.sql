BEGIN;

--
-- Desactiva triggers legacy sobre lead_tarjetas
--

DROP TRIGGER IF EXISTS lead_tarjetas_after_write ON public.lead_tarjetas;
DROP TRIGGER IF EXISTS lead_tarjetas_auto_precalificado ON public.lead_tarjetas;
DROP TRIGGER IF EXISTS lead_tarjetas_before_write ON public.lead_tarjetas;
DROP TRIGGER IF EXISTS lead_tarjetas_sync_cliente ON public.lead_tarjetas;
DROP TRIGGER IF EXISTS lead_tarjetas_sync_from_insights ON public.conversaciones_insights;

DROP FUNCTION IF EXISTS public.tg_lead_tarjetas_after_write();
DROP FUNCTION IF EXISTS public.tg_lead_tarjetas_auto_precalificado();
DROP FUNCTION IF EXISTS public.tg_lead_tarjetas_before_write();
DROP FUNCTION IF EXISTS public.tg_lead_tarjeta_sync_cliente();
DROP FUNCTION IF EXISTS public.tg_sync_lead_score_from_insights();

--
-- Elimina RPCs/funciones panel_lead_* ya reemplazadas por /crm
--

DROP FUNCTION IF EXISTS public.panel_lead_add_nota(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.panel_lead_delete(uuid, text);
DROP FUNCTION IF EXISTS public.panel_lead_move(uuid, uuid, uuid, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.panel_lead_movimientos(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.panel_lead_quote_create(uuid, jsonb);
DROP FUNCTION IF EXISTS public.panel_lead_quote_mark(uuid, public.lead_cotizacion_estado, text, jsonb);
DROP FUNCTION IF EXISTS public.panel_lead_update(uuid, jsonb, jsonb, boolean);

COMMIT;
