-- Preserve the deployed, date-scoped attribution query and its permissions.
-- Abort on unexpected definition drift instead of replacing an older function.
DO $migration$
DECLARE
    definition text;
    original text := 'lower(coalesce(e.estado, ''pendiente'')) as estado';
    replacement text := $replacement$CASE
        WHEN e.canal = 'correo' AND e.estado = 'enviado'
         AND e.proveedor_aceptado_en IS NULL
         AND (e.detalle->>'email_provider' = 'postmark'
              OR e.detalle->>'delivery_state' = 'queued')
        THEN 'en_cola'
        ELSE lower(coalesce(e.estado, 'pendiente'))
        END as estado$replacement$;
BEGIN
    definition := pg_get_functiondef(
        'public.prospeccion_campana_template_atribucion_rango(uuid,integer,timestamptz,timestamptz,integer)'::regprocedure);
    IF position(original in definition) = 0 THEN
        RAISE EXCEPTION 'attribution_definition_drift';
    END IF;
    EXECUTE replace(definition, original, replacement);
END;
$migration$;
