create or replace function public.denue_resultados_list(
  p_busqueda_id uuid,
  p_q text default null,
  p_phone_present boolean default null,
  p_email_present boolean default null,
  p_website_present boolean default null,
  p_estrato_group text default null,
  p_actividades text[] default null,
  p_contact_match text default 'all',
  p_geo_estado text default null,
  p_geo_municipio text default null,
  p_limit integer default 250,
  p_offset integer default 0,
  p_order text default 'recientes'
)
returns table(
  resultado_id uuid,
  busqueda_id uuid,
  display_name text,
  actividad text,
  estrato text,
  phone text,
  email text,
  website text,
  address text,
  lat double precision,
  lng double precision,
  distancia_m double precision,
  maps_url text,
  resultado_creado_en timestamp with time zone,
  total_count bigint
)
language sql
stable
as $$
  with base as (
    select
      r.id as resultado_id,
      r.busqueda_id,
      coalesce(nullif(r.name, ''), nullif(r.razon_social, '')) as display_name,
      nullif(r.actividad, '') as actividad,
      nullif(r.estrato, '') as estrato,
      coalesce(nullif(r.phone, ''), nullif(r.raw #>> '{Telefono}', '')) as phone,
      coalesce(nullif(r.email, ''), nullif(r.raw #>> '{Correo_e}', '')) as email,
      coalesce(nullif(r.website, ''), nullif(r.raw #>> '{Sitio_internet}', '')) as website,
      nullif(r.address, '') as address,
      r.lat,
      r.lng,
      r.maps_url,
      r.creado_en as resultado_creado_en,
      b.centro as busqueda_centro,
      r.geom,
      r.tsv,
      substring(nullif(r.raw #>> '{raw,AreaGeo}', '') from 1 for 2) as estado_code,
      substring(nullif(r.raw #>> '{raw,AreaGeo}', '') from 3 for 3) as municipio_code
    from public.resultados r
    join public.busquedas b on b.id = r.busqueda_id
    where r.fuente = 'denue'
      and r.busqueda_id = p_busqueda_id
  )
  select
    resultado_id,
    busqueda_id,
    display_name,
    actividad,
    estrato,
    phone,
    email,
    website,
    address,
    lat,
    lng,
    case
      when busqueda_centro is not null and geom is not null then st_distance(busqueda_centro, geom)
      else null
    end as distancia_m,
    maps_url,
    resultado_creado_en,
    count(*) over() as total_count
  from base
  where
    (
      p_q is null
      or btrim(p_q) = ''
      or (tsv is not null and tsv @@ websearch_to_tsquery('spanish', p_q))
    )
    and (
      case lower(coalesce(nullif(btrim(p_contact_match), ''), 'all'))
        when 'any' then (
          (p_phone_present is null and p_email_present is null and p_website_present is null)
          or (
            (p_phone_present is true and phone is not null)
            or (p_phone_present is false and phone is null)
            or (p_email_present is true and email is not null)
            or (p_email_present is false and email is null)
            or (p_website_present is true and website is not null)
            or (p_website_present is false and website is null)
          )
        )
        else (
          (p_phone_present is null or (p_phone_present is true and phone is not null) or (p_phone_present is false and phone is null))
          and (p_email_present is null or (p_email_present is true and email is not null) or (p_email_present is false and email is null))
          and (p_website_present is null or (p_website_present is true and website is not null) or (p_website_present is false and website is null))
        )
      end
    )
    and (
      p_actividades is null
      or array_length(p_actividades, 1) is null
      or actividad = any(p_actividades)
    )
    and (
      p_geo_estado is null
      or btrim(p_geo_estado) = ''
      or estado_code = lpad(regexp_replace(p_geo_estado, '\\D', '', 'g'), 2, '0')
    )
    and (
      p_geo_municipio is null
      or btrim(p_geo_municipio) = ''
      or municipio_code = lpad(regexp_replace(p_geo_municipio, '\\D', '', 'g'), 3, '0')
    )
    and (
      p_estrato_group is null
      or btrim(p_estrato_group) = ''
      or (
        case lower(btrim(p_estrato_group))
          when 'micro' then (estrato ilike '%micro%')
          when 'pequena' then (estrato ilike '%peque%')
          when 'mediana' then (estrato ilike '%mediana%')
          when 'grande' then (estrato ilike '%grande%')
          else (estrato ilike ('%' || p_estrato_group || '%'))
        end
      )
    )
  order by
    case when p_order = 'distancia' then (case when busqueda_centro is not null and geom is not null then st_distance(busqueda_centro, geom) end) end asc nulls last,
    resultado_creado_en desc
  limit least(greatest(p_limit, 1), 5000)
  offset greatest(p_offset, 0);
$$;
