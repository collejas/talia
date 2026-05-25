-- Remove the contactos timeline RPC now that the UI no longer renders the chart.
DROP FUNCTION IF EXISTS public.panel_contactos_timeline(timestamptz, timestamptz, uuid, text);
