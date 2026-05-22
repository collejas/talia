CREATE OR REPLACE FUNCTION public.google_resultados_bounds(
    p_busqueda_id uuid,
    p_q text DEFAULT NULL::text,
    p_phone_present boolean DEFAULT NULL::boolean,
    p_website_present boolean DEFAULT NULL::boolean,
    p_min_rating numeric DEFAULT NULL::numeric,
    p_actividades text[] DEFAULT NULL::text[]
) RETURNS TABLE(west double precision, south double precision, east double precision, north double precision, total_count bigint)
    LANGUAGE sql
    STABLE
    SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with filtered as (
    select
      coalesce(
        r.geom,
        case
          when r.lat is not null and r.lng is not null then st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography
          else null::geography
        end
      ) as geog,
      nullif(r.phone, '') as phone,
      nullif(r.phone_e164, '') as phone_e164,
      nullif(r.telefono_principal_e164, '') as telefono_principal_e164,
      nullif(r.telefono_movil_1_e164, '') as telefono_movil_1_e164,
      nullif(r.email, '') as email,
      nullif(r.correo_principal, '') as correo_principal,
      nullif(r.correo_secundario, '') as correo_secundario,
      nullif(r.website, '') as website,
      nullif(r.actividad, '') as actividad,
      r.rating,
      r.tsv
    from public.resultados r
    where r.fuente = 'google_places'
      and r.busqueda_id = p_busqueda_id
  ), kept as (
    select *
    from filtered
    where geog is not null
      and (
        p_q is null
        or btrim(p_q) = ''
        or (tsv is not null and tsv @@ websearch_to_tsquery('spanish', p_q))
        or phone ilike '%' || p_q || '%'
        or phone_e164 ilike '%' || p_q || '%'
        or telefono_principal_e164 ilike '%' || p_q || '%'
        or telefono_movil_1_e164 ilike '%' || p_q || '%'
        or email ilike '%' || p_q || '%'
        or correo_principal ilike '%' || p_q || '%'
        or correo_secundario ilike '%' || p_q || '%'
        or website ilike '%' || p_q || '%'
      )
      and (
        p_phone_present is null
        or (p_phone_present is true and (
          phone is not null
          or phone_e164 is not null
          or telefono_principal_e164 is not null
          or telefono_movil_1_e164 is not null
        ))
        or (p_phone_present is false and (
          phone is null
          and phone_e164 is null
          and telefono_principal_e164 is null
          and telefono_movil_1_e164 is null
        ))
      )
      and (
        p_website_present is null
        or (p_website_present is true and website is not null)
        or (p_website_present is false and website is null)
      )
      and (
        p_min_rating is null
        or (rating is not null and rating >= p_min_rating)
      )
      and (
        p_actividades is null
        or array_length(p_actividades, 1) is null
        or actividad = any(p_actividades)
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
$function$;


CREATE OR REPLACE FUNCTION public.google_resultados_map(
    p_busqueda_id uuid,
    p_bbox_w double precision,
    p_bbox_s double precision,
    p_bbox_e double precision,
    p_bbox_n double precision,
    p_zoom integer DEFAULT 12,
    p_q text DEFAULT NULL::text,
    p_phone_present boolean DEFAULT NULL::boolean,
    p_website_present boolean DEFAULT NULL::boolean,
    p_min_rating numeric DEFAULT NULL::numeric,
    p_actividades text[] DEFAULT NULL::text[],
    p_limit integer DEFAULT 5000
) RETURNS TABLE(kind text, id text, lat double precision, lng double precision, count integer, resultado_id uuid, display_name text, actividad text, phone text, email text, website text, address text, rating numeric, reviews integer, google_primary_type text, google_primary_type_display_name text, google_types text[])
    LANGUAGE sql
    STABLE
    SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with env as (
    select st_makeenvelope(p_bbox_w, p_bbox_s, p_bbox_e, p_bbox_n, 4326)::geography as bbox_geog
  ), filtered as (
    select
      r.id as resultado_id,
      coalesce(nullif(r.name, ''), nullif(r.razon_social, '')) as display_name,
      nullif(r.actividad, '') as actividad,
      nullif(r.phone, '') as phone,
      nullif(r.phone_e164, '') as phone_e164,
      nullif(r.telefono_principal_e164, '') as telefono_principal_e164,
      nullif(r.telefono_movil_1_e164, '') as telefono_movil_1_e164,
      nullif(r.email, '') as email,
      nullif(r.correo_principal, '') as correo_principal,
      nullif(r.correo_secundario, '') as correo_secundario,
      nullif(r.website, '') as website,
      nullif(r.address, '') as address,
      r.rating,
      r.reviews,
      r.raw ->> 'primaryType' as google_primary_type,
      r.raw ->> 'primaryTypeDisplayName' as google_primary_type_display_name,
      coalesce(
        (select array_agg(value.value)
         from jsonb_array_elements_text(coalesce(r.raw -> 'types', '[]'::jsonb)) value(value)
        ),
        array[]::text[]
      ) as google_types,
      r.lat,
      r.lng,
      coalesce(
        r.geom,
        case
          when r.lat is not null and r.lng is not null then st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography
          else null::geography
        end
      ) as geog,
      r.tsv
    from public.resultados r
    where r.fuente = 'google_places'
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
        or phone ilike '%' || p_q || '%'
        or phone_e164 ilike '%' || p_q || '%'
        or telefono_principal_e164 ilike '%' || p_q || '%'
        or telefono_movil_1_e164 ilike '%' || p_q || '%'
        or email ilike '%' || p_q || '%'
        or correo_principal ilike '%' || p_q || '%'
        or correo_secundario ilike '%' || p_q || '%'
        or website ilike '%' || p_q || '%'
      )
      and (
        p_phone_present is null
        or (p_phone_present is true and (
          phone is not null
          or phone_e164 is not null
          or telefono_principal_e164 is not null
          or telefono_movil_1_e164 is not null
        ))
        or (p_phone_present is false and (
          phone is null
          and phone_e164 is null
          and telefono_principal_e164 is null
          and telefono_movil_1_e164 is null
        ))
      )
      and (
        p_website_present is null
        or (p_website_present is true and website is not null)
        or (p_website_present is false and website is null)
      )
      and (
        p_min_rating is null
        or (rating is not null and rating >= p_min_rating)
      )
      and (
        p_actividades is null
        or array_length(p_actividades, 1) is null
        or actividad = any(p_actividades)
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
      phone,
      email,
      website,
      address,
      rating,
      reviews,
      google_primary_type,
      google_primary_type_display_name,
      google_types
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
      null::text as phone,
      null::text as email,
      null::text as website,
      null::text as address,
      null::numeric as rating,
      null::int as reviews,
      null::text as google_primary_type,
      null::text as google_primary_type_display_name,
      null::text[] as google_types
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
      g.phone,
      g.email,
      g.website,
      g.address,
      g.rating,
      g.reviews,
      g.google_primary_type,
      g.google_primary_type_display_name,
      g.google_types
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
$function$;
