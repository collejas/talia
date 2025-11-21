BEGIN;

ALTER FUNCTION public._contacto_captura_estado(text, text, text, text, text)
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_contactos_auto_asignacion()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.upsert_resultados_lote(uuid, public.fuente_resultado, jsonb)
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.trg_resultados_set_geom()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.trg_resultados_set_tsv()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_lead_tarjeta_sync_cliente()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.fn_calendar_sync_tarjeta_stage(uuid, text, uuid)
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_lead_tarjetas_after_write()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_contactos_auto_precalificado()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.t_set_actualizado_en()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public._lead_tarjeta_auto_precalificar(uuid)
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_touch_updated_at()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_lead_tarjetas_before_write()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_contactos_captura_estado()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_sync_lead_score_from_insights()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_lead_tarjetas_auto_precalificado()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_conversaciones_auto_tarjeta()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.prevent_remove_last_admin()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.crear_busqueda(public.fuente_resultado, text, integer, double precision, double precision, integer, jsonb)
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.tg_calendar_bookings_sync_stage()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.touch_conversaciones_controles_updated_at()
    SET search_path = 'public, pg_temp';

ALTER FUNCTION public.trg_busquedas_set_centro()
    SET search_path = 'public, pg_temp';

COMMIT;
