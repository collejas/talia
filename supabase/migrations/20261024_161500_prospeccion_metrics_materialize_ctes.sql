-- Evita que PostgreSQL vuelva a evaluar los conjuntos intermedios de la RPC
-- operativa de WhatsApp para cada agregado correlacionado.
-- La transformación conserva columnas, filtros y contrato de salida.

do $migration$
declare
    v_definition text;
begin
    select pg_get_functiondef(
        'public.prospeccion_campana_whatsapp_metricas_rango(uuid,timestamptz,timestamptz,integer,integer)'::regprocedure
    )
    into v_definition;

    v_definition := replace(v_definition, 'batches_semilla as (', 'batches_semilla as materialized (');
    v_definition := replace(v_definition, 'envios_base as (', 'envios_base as materialized (');
    v_definition := replace(v_definition, 'eventos_por_envio as (', 'eventos_por_envio as materialized (');
    v_definition := replace(v_definition, 'conversaciones_semilla as (', 'conversaciones_semilla as materialized (');
    v_definition := replace(v_definition, 'conversaciones_campana as (', 'conversaciones_campana as materialized (');
    v_definition := replace(v_definition, 'conversation_messages as (', 'conversation_messages as materialized (');

    execute v_definition;
end;
$migration$;
