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
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
$$;

create or replace function public.denue_resultados_map(
  p_busqueda_id uuid,
  p_bbox_w double precision,
  p_bbox_s double precision,
  p_bbox_e double precision,
  p_bbox_n double precision,
  p_zoom integer default 12,
  p_q text default null,
  p_phone_present boolean default null,
  p_email_present boolean default null,
  p_website_present boolean default null,
  p_estrato_group text default null,
  p_actividades text[] default null,
  p_contact_match text default 'all',
  p_geo_estado text default null,
  p_geo_municipio text default null,
  p_limit integer default 5000
)
returns table(
  kind text,
  id text,
  lat double precision,
  lng double precision,
  count integer,
  resultado_id uuid,
  display_name text,
  actividad text,
  estrato text,
  phone text,
  email text,
  website text,
  address text
)
language sql
stable
as $$
  with env as (
    select st_makeenvelope(p_bbox_w, p_bbox_s, p_bbox_e, p_bbox_n, 4326)::geography as bbox_geog
  ), filtered as (
    select
      r.id as resultado_id,
      coalesce(nullif(r.name, ''), nullif(r.razon_social, '')) as display_name,
      nullif(r.actividad, '') as actividad,
      nullif(r.estrato, '') as estrato,
      coalesce(nullif(r.phone, ''), nullif(r.raw #>> '{Telefono}', '')) as phone,
      coalesce(nullif(r.email, ''), nullif(r.raw #>> '{Correo_e}', '')) as email,
      coalesce(nullif(r.website, ''), nullif(r.raw #>> '{Sitio_internet}', '')) as website,
      nullif(r.address, '') as address,
      r.lat,
      r.lng,
      coalesce(
        r.geom,
        case
          when r.lat is not null and r.lng is not null then st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography
          else null::geography
        end
      ) as geog,
      r.tsv,
      substring(nullif(r.raw #>> '{raw,AreaGeo}', '') from 1 for 2) as estado_code,
      substring(nullif(r.raw #>> '{raw,AreaGeo}', '') from 3 for 3) as municipio_code
    from public.resultados r
    where r.fuente = 'denue'
      and r.busqueda_id = p_busqueda_id
  ), kept as (
    select f.*
    from filtered f, env
    where f.geog is not null
      and st_intersects(f.geog, env.bbox_geog)
      and (
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
  ), mode as (
    select case when p_zoom >= 14 then 'points' else 'clusters' end as mode
  ), points as (
    select
      'point'::text as kind,
      resultado_id::text as id,
      lat,
      lng,
      null::int as count,
      resultado_id,
      display_name,
      actividad,
      estrato,
      phone,
      email,
      website,
      address
    from kept, mode
    where mode.mode = 'points'
      and lat is not null
      and lng is not null
    limit least(greatest(p_limit, 1), 10000)
  ), grid as (
    select
      k.*, 
      st_snaptogrid(
        st_transform(k.geog::geometry, 3857),
        (40075016.686 / (256 * power(2::double precision, greatest(0, least(p_zoom, 22))))) * 60
      ) as cell,
      st_x(st_transform(k.geog::geometry, 3857)) as x,
      st_y(st_transform(k.geog::geometry, 3857)) as y
    from kept k, mode
    where mode.mode = 'clusters'
  ), agg as (
    select
      cell,
      count(*)::int as cnt,
      avg(x) as ax,
      avg(y) as ay
    from grid
    group by cell
  ), clusters_raw as (
    select
      'cluster'::text as kind,
      md5(st_astext(a.cell)) as id,
      st_y(st_transform(st_setsrid(st_makepoint(a.ax, a.ay), 3857), 4326)) as lat,
      st_x(st_transform(st_setsrid(st_makepoint(a.ax, a.ay), 3857), 4326)) as lng,
      a.cnt as count,
      null::uuid as resultado_id,
      null::text as display_name,
      null::text as actividad,
      null::text as estrato,
      null::text as phone,
      null::text as email,
      null::text as website,
      null::text as address
    from agg a
    where a.cnt > 1
    order by a.cnt desc
  ), clusters as (
    select *
    from clusters_raw
    limit least(greatest(p_limit, 1), 5000)
  ), cluster_count as (
    select count(*)::int as n
    from clusters
  ), singles as (
    select
      'point'::text as kind,
      g.resultado_id::text as id,
      g.lat,
      g.lng,
      null::int as count,
      g.resultado_id,
      g.display_name,
      g.actividad,
      g.estrato,
      g.phone,
      g.email,
      g.website,
      g.address
    from grid g
    join agg a on a.cell = g.cell and a.cnt = 1
    limit greatest(
      0,
      least(greatest(p_limit, 1), 5000) - (select n from cluster_count)
    )
  )
  select * from points
  union all
  select * from clusters
  union all
  select * from singles;
$$;

create or replace function public.denue_resultados_bounds(
  p_busqueda_id uuid,
  p_q text default null,
  p_phone_present boolean default null,
  p_email_present boolean default null,
  p_website_present boolean default null,
  p_estrato_group text default null,
  p_actividades text[] default null,
  p_contact_match text default 'all',
  p_geo_estado text default null,
  p_geo_municipio text default null
)
returns table(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  total_count bigint
)
language sql
stable
as $$
  with filtered as (
    select
      coalesce(
        r.geom,
        case
          when r.lat is not null and r.lng is not null then st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography
          else null::geography
        end
      ) as geog,
      coalesce(nullif(r.phone, ''), nullif(r.raw #>> '{Telefono}', '')) as phone,
      coalesce(nullif(r.email, ''), nullif(r.raw #>> '{Correo_e}', '')) as email,
      coalesce(nullif(r.website, ''), nullif(r.raw #>> '{Sitio_internet}', '')) as website,
      nullif(r.actividad, '') as actividad,
      nullif(r.estrato, '') as estrato,
      r.tsv,
      substring(nullif(r.raw #>> '{raw,AreaGeo}', '') from 1 for 2) as estado_code,
      substring(nullif(r.raw #>> '{raw,AreaGeo}', '') from 3 for 3) as municipio_code
    from public.resultados r
    where r.fuente = 'denue'
      and r.busqueda_id = p_busqueda_id
  ), kept as (
    select *
    from filtered
    where
      geog is not null
      and (
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
  ), agg as (
    select
      st_extent(geog::geometry) as ext,
      count(*)::bigint as total_count
    from kept
  )
  select
    st_xmin(ext) as west,
    st_ymin(ext) as south,
    st_xmax(ext) as east,
    st_ymax(ext) as north,
    total_count
  from agg
  where ext is not null;
$$;
