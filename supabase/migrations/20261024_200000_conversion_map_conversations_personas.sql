-- Fuente canónica exclusiva para la pestaña Conversaciones del mapa.
-- No mezcla sesiones/visitantes webchat con conversaciones de inbox.
create or replace function public.panel_conversion_conversation_geo_resumen_v1(
    p_nivel text default 'estado',
    p_from timestamptz default null,
    p_to timestamptz default null,
    p_estado text default null
)
returns table (
    location_level text,
    location_key text,
    location_name text,
    conversaciones_total bigint,
    conversaciones_webchat bigint,
    conversaciones_whatsapp bigint,
    conversaciones_voz bigint,
    conversaciones_correo bigint,
    conversaciones_otros bigint
)
language sql
stable
security definer
set search_path = public
as $function$
with params as (
    select
        case
            when lower(coalesce(p_nivel, 'estado')) = 'pais' then 'pais'
            when lower(coalesce(p_nivel, 'estado')) = 'municipio' then 'municipio'
            else 'estado'
        end as nivel,
        case
            when p_estado is null or btrim(p_estado) = '' then null::text
            else lpad(regexp_replace(btrim(p_estado), '\\D', '', 'g'), 2, '0')
        end as estado
),
tenant as (
    select public.usuario_organizacion_id(auth.uid()) as organizacion_id
),
base as (
    select
        c.id,
        lower(btrim(coalesce(c.canal, ''))) as canal,
        p.pais,
        p.clave_entidad,
        p.entidad,
        p.clave_municipio,
        p.municipio
    from public.conversaciones c
    join tenant t on t.organizacion_id = c.organizacion_id
    join public.personas p
      on p.id = coalesce(c.persona_id, c.contacto_id)
     and p.organizacion_id = t.organizacion_id
    where (p_from is null or c.iniciada_en >= p_from)
      and (p_to is null or c.iniciada_en < p_to)
      and public.puede_ver_persona(p.id)
),
normalized as (
    select
        b.*,
        case
            when upper(btrim(coalesce(b.pais, ''))) in ('MX', 'MEX')
              or lower(btrim(coalesce(b.pais, ''))) in ('mexico', 'méxico') then 'MX'
            when nullif(btrim(coalesce(b.pais, '')), '') is null then 'UNK'
            else upper(btrim(b.pais))
        end as country_key,
        case
            when nullif(btrim(coalesce(b.clave_entidad, '')), '') is not null
                then lpad(regexp_replace(btrim(b.clave_entidad), '\\D', '', 'g'), 2, '0')
            else null
        end as state_key,
        case
            when nullif(btrim(coalesce(b.clave_entidad, '')), '') is not null
             and nullif(btrim(coalesce(b.clave_municipio, '')), '') is not null
                then lpad(regexp_replace(btrim(b.clave_entidad), '\\D', '', 'g'), 2, '0')
                  || lpad(regexp_replace(btrim(b.clave_municipio), '\\D', '', 'g'), 3, '0')
            else null
        end as municipality_key
    from base b
),
scoped as (
    select
        n.*,
        p.nivel,
        p.estado,
        case
            when p.nivel = 'pais' then n.country_key
            when p.nivel = 'municipio' then coalesce(n.municipality_key, 'UNK')
            else coalesce(n.state_key, 'UNK')
        end as resolved_key,
        case
            when p.nivel = 'pais' then
                case when n.country_key = 'MX' then 'México' else coalesce(nullif(btrim(n.pais), ''), 'País desconocido') end
            when p.nivel = 'municipio' then coalesce(nullif(btrim(n.municipio), ''), 'Municipio desconocido')
            else coalesce(nullif(btrim(n.entidad), ''), 'Estado desconocido')
        end as resolved_name
    from normalized n
    cross join params p
    where p.nivel <> 'municipio'
       or p.estado is null
       or n.state_key = p.estado
),
grouped as (
    select
        s.nivel as location_level,
        s.resolved_key as location_key,
        s.resolved_name as location_name,
        count(*)::bigint as conversaciones_total,
        count(*) filter (where s.canal = 'webchat')::bigint as conversaciones_webchat,
        count(*) filter (where s.canal = 'whatsapp')::bigint as conversaciones_whatsapp,
        count(*) filter (where s.canal in ('voz', 'voice', 'llamada'))::bigint as conversaciones_voz,
        count(*) filter (where s.canal in ('correo', 'email', 'mail'))::bigint as conversaciones_correo,
        count(*) filter (
            where s.canal not in ('webchat', 'whatsapp', 'voz', 'voice', 'llamada', 'correo', 'email', 'mail')
        )::bigint as conversaciones_otros
    from scoped s
    group by s.nivel, s.resolved_key, s.resolved_name
)
select
    g.location_level,
    g.location_key,
    g.location_name,
    g.conversaciones_total,
    g.conversaciones_webchat,
    g.conversaciones_whatsapp,
    g.conversaciones_voz,
    g.conversaciones_correo,
    g.conversaciones_otros
from grouped g
order by g.location_level, g.location_name;
$function$;

revoke all on function public.panel_conversion_conversation_geo_resumen_v1(text, timestamptz, timestamptz, text) from public;
grant execute on function public.panel_conversion_conversation_geo_resumen_v1(text, timestamptz, timestamptz, text) to authenticated, service_role;
