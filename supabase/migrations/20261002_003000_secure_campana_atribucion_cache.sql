-- El caché de atribución es una tabla interna del backend.
-- El acceso se realiza mediante funciones con service_role; no debe quedar
-- consultable directamente desde PostgREST por usuarios autenticados.

alter table public.prospeccion_campana_atribucion_cache enable row level security;

revoke all on table public.prospeccion_campana_atribucion_cache from anon, authenticated;

revoke all on function public.prospeccion_campana_atribucion_cache_refresh(timestamptz, timestamptz, uuid)
    from public, anon, authenticated;
revoke all on function public.prospeccion_campana_atribucion_cache_rango(timestamptz, timestamptz, uuid, integer, integer)
    from public, anon, authenticated;

grant execute on function public.prospeccion_campana_atribucion_cache_refresh(timestamptz, timestamptz, uuid)
    to service_role;
grant execute on function public.prospeccion_campana_atribucion_cache_rango(timestamptz, timestamptz, uuid, integer, integer)
    to service_role;
