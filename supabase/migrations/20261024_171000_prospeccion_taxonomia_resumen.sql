-- Devuelve la taxonomía de filtros en una sola lectura agregada.
-- Evita recorrer prospeccion_prospectos en páginas HTTP para construir
-- actividades, segmentos y tipos de negocio.
create or replace function public.prospeccion_taxonomia_resumen(
    p_fuente text default null,
    p_date_from timestamptz default null,
    p_date_to timestamptz default null
)
returns table(
    activity text,
    segmento text,
    tipo_negocio_display text,
    tipo_negocio text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $function$
select distinct
    nullif(trim(p.actividad), '') as activity,
    nullif(trim(p.segmento), '') as segmento,
    nullif(trim(p.google_primary_type_display_name), '') as tipo_negocio_display,
    nullif(trim(p.google_primary_type), '') as tipo_negocio
from public.prospeccion_prospectos p
where p.organizacion_id = public.usuario_organizacion_id(auth.uid())
  and (p_fuente is null or p_fuente = '' or p.fuente::text = p_fuente)
  and (p_date_from is null or p.creado_en >= p_date_from)
  and (p_date_to is null or p.creado_en < p_date_to)
  and (
      nullif(trim(p.actividad), '') is not null
      or nullif(trim(p.segmento), '') is not null
      or nullif(trim(p.google_primary_type_display_name), '') is not null
      or nullif(trim(p.google_primary_type), '') is not null
  );
$function$;

revoke all on function public.prospeccion_taxonomia_resumen(text, timestamptz, timestamptz)
    from public, anon;
grant execute on function public.prospeccion_taxonomia_resumen(text, timestamptz, timestamptz)
    to authenticated, service_role;
