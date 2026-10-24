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
with contexto_org as (
    select coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) as organizacion_id
)
select distinct
    nullif(trim(p.actividad), '') as activity,
    nullif(trim(p.segmento), '') as segmento,
    nullif(trim(p.google_primary_type_display_name), '') as tipo_negocio_display,
    nullif(trim(p.google_primary_type), '') as tipo_negocio
from public.prospeccion_prospectos p
cross join contexto_org co
where p.organizacion_id = co.organizacion_id
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
