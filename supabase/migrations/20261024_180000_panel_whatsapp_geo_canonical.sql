-- Canonical geolocation for WhatsApp conversation metrics.
-- The dashboard must classify one conversation once, using contact location
-- first and the phone/LADA catalog as fallback. This is intentionally a
-- service-role RPC: the backend supplies the already authorized tenant id.

create or replace function public.panel_visitantes_whatsapp_geo_v1(
    p_organizacion_id uuid,
    p_nivel text default 'pais',
    p_from timestamptz default null,
    p_to timestamptz default null,
    p_estado text default null
)
returns table(
    location_key text,
    location_name text,
    conversaciones_whatsapp bigint
)
language sql
stable
security definer
set search_path = public
as $function$
with normalized_level as (
    select case
        when lower(coalesce(p_nivel, 'pais')) = 'municipio' then 'municipio'
        when lower(coalesce(p_nivel, 'pais')) = 'estado' then 'estado'
        else 'pais'
    end as nivel
),
state_filter as (
    select nullif(lpad(regexp_replace(nullif(btrim(p_estado), ''), '\D', '', 'g'), 2, '0'), '') as estado
),
base as (
    select distinct on (c.id)
        c.id,
        nullif(upper(btrim(ct.pais)), '') as pais,
        nullif(lpad(regexp_replace(nullif(btrim(ct.clave_entidad), ''), '\D', '', 'g'), 2, '0'), '') as explicit_state,
        nullif(lpad(regexp_replace(nullif(btrim(ct.clave_municipio), ''), '\D', '', 'g'), 3, '0'), '') as explicit_municipality,
        regexp_replace(coalesce(
            ct.telefono_e164,
            ct.telefono,
            ''
        ), '\D', '', 'g') as phone_digits
    from public.conversaciones c
    join public.contactos ct
      on ct.id = c.contacto_id
     and ct.organizacion_id = c.organizacion_id
    where c.organizacion_id = p_organizacion_id
      and lower(coalesce(c.canal, '')) = 'whatsapp'
      and (p_from is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en, now()) >= p_from)
      and (p_to is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en, now()) <= p_to)
    order by c.id, coalesce(c.ultimo_mensaje_en, c.iniciada_en, now()) desc
),
phones as (
    select b.*,
        case
            when b.phone_digits like '521%' then substring(b.phone_digits from 4)
            when b.phone_digits like '52%' then substring(b.phone_digits from 3)
            else b.phone_digits
        end as national_phone,
        (b.pais in ('MX', 'MEX') or b.phone_digits like '52%') as is_mexico
    from base b
),
lada_rows as (
    select p.id, g.clave_entidad, g.entidad, g.localidad
    from phones p
    join public.geo_ladas_mexico g
      on g.activo = true
     and left(p.national_phone, length(g.lada)) = g.lada
),
state_counts as (
    select id, clave_entidad, count(*) as hits
    from lada_rows
    group by id, clave_entidad
),
state_rank as (
    select id, clave_entidad, hits,
        row_number() over (partition by id order by hits desc, clave_entidad) as rn
    from state_counts
),
lada_states as (
    select id,
        case
            when max(hits) filter (where rn = 1) > coalesce(max(hits) filter (where rn = 2), 0)
                then max(clave_entidad) filter (where rn = 1)
        end as state_code
    from state_rank
    group by id
),
municipality_rows as (
    select distinct lr.id, gm.cvegeo, gm.clave_entidad, gm.nombre
    from lada_rows lr
    join public.geo_municipios_mexico gm
      on gm.activo = true
     and gm.clave_entidad = lr.clave_entidad
     and lower(translate(btrim(gm.nombre), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) =
         lower(translate(btrim(lr.localidad), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))
),
municipalities as (
    select id,
        case when count(distinct cvegeo) = 1 then min(cvegeo) end as municipality_code
    from municipality_rows
    group by id
),
resolved as (
    select p.id,
        case when p.is_mexico then 'MX' else 'UNK' end as country_code,
        coalesce(p.explicit_state, ls.state_code) as state_code,
        coalesce(p.explicit_municipality, m.municipality_code) as municipality_code
    from phones p
    left join lada_states ls on ls.id = p.id
    left join municipalities m on m.id = p.id
),
scoped as (
    select r.id,
        case
            when nl.nivel = 'pais' then r.country_code
            when nl.nivel = 'estado' then coalesce(r.state_code, 'UNK')
            when nl.nivel = 'municipio' then
                case
                    when r.state_code is null then 'UNK'
                    when r.municipality_code is null then r.state_code || 'UNK'
                    else r.municipality_code
                end
        end as location_key
    from resolved r
    cross join normalized_level nl
    cross join state_filter sf
    where nl.nivel <> 'municipio'
       or sf.estado is null
       or r.state_code = sf.estado
),
named as (
    select distinct s.location_key,
        case
            when s.location_key = 'MX' then 'México'
            when s.location_key = 'UNK' and nl.nivel = 'pais' then 'País desconocido'
            when nl.nivel = 'estado' then coalesce(ge.nombre, 'Estado desconocido')
            when nl.nivel = 'municipio' and s.location_key like '%UNK' then 'Municipio desconocido'
            when nl.nivel = 'municipio' then coalesce(gm.nombre, 'Municipio desconocido')
            else 'País desconocido'
        end as location_name
    from scoped s
    cross join normalized_level nl
    left join public.geo_estados_mexico ge
      on nl.nivel = 'estado' and ge.activo = true and ge.clave_entidad = s.location_key
    left join public.geo_municipios_mexico gm
      on nl.nivel = 'municipio' and gm.activo = true and gm.cvegeo = s.location_key
)
select n.location_key, max(n.location_name), count(distinct n.location_key || ':' || s.id)::bigint
from named n
join scoped s on s.location_key = n.location_key
group by n.location_key
order by n.location_key;
$function$;

revoke all on function public.panel_visitantes_whatsapp_geo_v1(uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.panel_visitantes_whatsapp_geo_v1(uuid, text, timestamptz, timestamptz, text) to service_role;
