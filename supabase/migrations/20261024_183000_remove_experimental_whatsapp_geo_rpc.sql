-- The first canonical RPC prototype depended on the legacy two-digit LADA
-- catalog and is intentionally removed. The dashboard continues using the
-- existing resolver until the catalog is normalized into explicit 3-digit
-- records in a separate migration.
drop function if exists public.panel_visitantes_whatsapp_geo_v1(uuid, text, timestamptz, timestamptz, text);
