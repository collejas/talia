-- Persist Google business taxonomy in typed columns and keep Prospectos filters fast.
-- The raw payload remains available for provider evidence; it is not used as the
-- operational source for the business-type filter.

alter table public.resultados
  add column if not exists google_primary_type text,
  add column if not exists google_primary_type_display_name text,
  add column if not exists google_types text[];

alter table public.prospeccion_prospectos
  add column if not exists google_primary_type text,
  add column if not exists google_primary_type_display_name text,
  add column if not exists google_types text[];

create index if not exists resultados_org_google_primary_type_display_name_idx
  on public.resultados (organizacion_id, google_primary_type_display_name)
  where google_primary_type_display_name is not null;

create index if not exists prospeccion_prospectos_org_google_primary_type_display_name_idx
  on public.prospeccion_prospectos (organizacion_id, google_primary_type_display_name)
  where google_primary_type_display_name is not null;

-- Recover existing Google taxonomy from the provider snapshot. The current
-- payload shape nests the Places response under raw.raw.
update public.resultados as r
set
  google_primary_type = coalesce(
    nullif(r.google_primary_type, ''),
    nullif(r.raw ->> 'google_primary_type', ''),
    nullif(r.raw #>> '{raw,primaryType}', ''),
    nullif(r.raw ->> 'primaryType', '')
  ),
  google_primary_type_display_name = coalesce(
    nullif(r.google_primary_type_display_name, ''),
    nullif(r.raw ->> 'google_primary_type_display_name', ''),
    nullif(r.raw #>> '{raw,primaryTypeDisplayName,text}', ''),
    nullif(r.raw #>> '{raw,primaryTypeDisplayName}', ''),
    nullif(r.raw ->> 'primaryTypeDisplayName', '')
  ),
  google_types = coalesce(
    case when cardinality(r.google_types) > 0 then r.google_types end,
    case when jsonb_typeof(r.raw -> 'google_types') = 'array'
      then array(select jsonb_array_elements_text(r.raw -> 'google_types')) end,
    case when jsonb_typeof(r.raw #> '{raw,types}') = 'array'
      then array(select jsonb_array_elements_text(r.raw #> '{raw,types}')) end,
    case when jsonb_typeof(r.raw -> 'types') = 'array'
      then array(select jsonb_array_elements_text(r.raw -> 'types')) end
  ),
  columnarized_at = now()
where r.fuente = 'google_places'
  and (
    r.google_primary_type is null
    or r.google_primary_type_display_name is null
    or r.google_types is null
    or cardinality(r.google_types) = 0
  );

-- Keep the current Prospectos projection aligned with its source results.
update public.prospeccion_prospectos as p
set
  google_primary_type = coalesce(p.google_primary_type, r.google_primary_type),
  google_primary_type_display_name = coalesce(
    p.google_primary_type_display_name,
    r.google_primary_type_display_name
  ),
  google_types = coalesce(
    case when cardinality(p.google_types) > 0 then p.google_types end,
    r.google_types
  ),
  columnarized_at = now()
from public.resultados as r
where p.resultado_id = r.id
  and p.fuente = 'google_places'
  and r.fuente = 'google_places'
  and (
    p.google_primary_type is null
    or p.google_primary_type_display_name is null
    or p.google_types is null
    or cardinality(p.google_types) = 0
  );

create or replace function public.upsert_resultados_lote(
  p_busqueda_id uuid,
  p_fuente public.fuente_resultado,
  p_items jsonb,
  p_organizacion_id uuid default null
)
returns integer
language plpgsql
set search_path to ''
as $function$
declare
  v_count integer := 0;
  v_organizacion uuid := p_organizacion_id;
  v_header text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  if v_organizacion is null then
    begin
      v_header := nullif(current_setting('request.headers.x-organizacion-id', true), '');
      if v_header is not null then
        v_organizacion := v_header::uuid;
      end if;
    exception when others then
      v_organizacion := null;
    end;
  end if;

  if v_organizacion is null then
    raise exception using errcode = 'P0001', message = 'organizacion_id_required';
  end if;

  if not exists (
    select 1
    from public.busquedas as busqueda
    where busqueda.id = p_busqueda_id
      and busqueda.organizacion_id = v_organizacion
      and busqueda.fuente = p_fuente
  ) then
    raise exception using errcode = 'P0001', message = 'busqueda_tenant_mismatch';
  end if;

  with raw_items as (
    select item, ord,
           nullif(btrim(coalesce(item ->> 'external_id', item ->> 'id')), '') as external_id
    from jsonb_array_elements(p_items) with ordinality as source(item, ord)
  ),
  deduplicated as (
    select item, external_id
    from (
      select raw_items.*,
             row_number() over (
               partition by coalesce(external_id, '__row__' || ord::text)
               order by ord desc
             ) as row_rank
      from raw_items
    ) as ranked
    where row_rank = 1
  )
  insert into public.resultados (
    busqueda_id, fuente, external_id, clee, name, razon_social, actividad, estrato,
    phone, phone_e164, correo_principal, correo_secundario,
    telefono_principal_e164, telefono_principal_tipo_linea, telefono_principal_extension,
    telefono_movil_1_e164, telefono_movil_1_tipo_linea,
    email, website, address, lat, lng, rating, reviews, maps_url,
    organizacion_id, raw, google_primary_type, google_primary_type_display_name, google_types
  )
  select
    p_busqueda_id, p_fuente, source.external_id,
    source.item ->> 'clee', source.item ->> 'name', source.item ->> 'razon_social',
    source.item ->> 'actividad', source.item ->> 'estrato', source.item ->> 'phone',
    coalesce(source.item ->> 'phone_e164', source.item ->> 'telefono_principal_e164', source.item ->> 'telefono_movil_1_e164'),
    coalesce(source.item ->> 'correo_principal', source.item ->> 'email'),
    source.item ->> 'correo_secundario',
    coalesce(source.item ->> 'telefono_principal_e164', source.item ->> 'phone_e164', source.item ->> 'phone', source.item ->> 'telefono_movil_1_e164'),
    source.item ->> 'telefono_principal_tipo_linea', source.item ->> 'telefono_principal_extension',
    coalesce(source.item ->> 'telefono_movil_1_e164', source.item ->> 'phone_e164', source.item ->> 'phone', source.item ->> 'telefono_principal_e164'),
    source.item ->> 'telefono_movil_1_tipo_linea',
    coalesce(source.item ->> 'email', source.item ->> 'correo_principal'),
    source.item ->> 'website', source.item ->> 'address',
    nullif(source.item ->> 'lat', '')::double precision,
    nullif(source.item ->> 'lng', '')::double precision,
    nullif(source.item ->> 'rating', '')::numeric,
    nullif(source.item ->> 'reviews', '')::integer,
    coalesce(source.item ->> 'maps_url', source.item ->> 'maps'),
    v_organizacion,
    source.item,
    nullif(source.item ->> 'google_primary_type', ''),
    nullif(source.item ->> 'google_primary_type_display_name', ''),
    case when jsonb_typeof(source.item -> 'google_types') = 'array'
      then array(select jsonb_array_elements_text(source.item -> 'google_types')) end
  from deduplicated as source
  on conflict (busqueda_id, fuente, external_id)
  do update set
    clee = excluded.clee,
    name = excluded.name,
    razon_social = excluded.razon_social,
    actividad = excluded.actividad,
    estrato = excluded.estrato,
    phone = excluded.phone,
    phone_e164 = excluded.phone_e164,
    correo_principal = excluded.correo_principal,
    correo_secundario = excluded.correo_secundario,
    telefono_principal_e164 = excluded.telefono_principal_e164,
    telefono_principal_tipo_linea = excluded.telefono_principal_tipo_linea,
    telefono_principal_extension = excluded.telefono_principal_extension,
    telefono_movil_1_e164 = excluded.telefono_movil_1_e164,
    telefono_movil_1_tipo_linea = excluded.telefono_movil_1_tipo_linea,
    email = excluded.email,
    website = excluded.website,
    address = excluded.address,
    lat = excluded.lat,
    lng = excluded.lng,
    rating = excluded.rating,
    reviews = excluded.reviews,
    maps_url = excluded.maps_url,
    raw = excluded.raw,
    google_primary_type = excluded.google_primary_type,
    google_primary_type_display_name = excluded.google_primary_type_display_name,
    google_types = excluded.google_types,
    columnarized_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace view public.v_google_places_contactables as
select
  r.id as resultado_id,
  r.busqueda_id,
  r.fuente as fuente_resultado,
  b.fuente as fuente_busqueda,
  r.external_id,
  coalesce(nullif(r.name, ''), nullif(r.razon_social, '')) as display_name,
  r.name,
  r.razon_social,
  r.actividad,
  r.estrato,
  coalesce(
    nullif(r.google_primary_type, ''),
    nullif(r.raw ->> 'google_primary_type', ''),
    nullif(r.raw #>> '{raw,primaryType}', ''),
    nullif(r.raw ->> 'primaryType', '')
  ) as google_primary_type,
  coalesce(
    nullif(r.google_primary_type_display_name, ''),
    nullif(r.raw ->> 'google_primary_type_display_name', ''),
    nullif(r.raw #>> '{raw,primaryTypeDisplayName,text}', ''),
    nullif(r.raw #>> '{raw,primaryTypeDisplayName}', ''),
    nullif(r.raw ->> 'primaryTypeDisplayName', '')
  ) as google_primary_type_display_name,
  coalesce(
    nullif(r.google_types, '{}'),
    case when jsonb_typeof(r.raw -> 'google_types') = 'array'
      then array(select jsonb_array_elements_text(r.raw -> 'google_types')) end,
    case when jsonb_typeof(r.raw #> '{raw,types}') = 'array'
      then array(select jsonb_array_elements_text(r.raw #> '{raw,types}')) end,
    case when jsonb_typeof(r.raw -> 'types') = 'array'
      then array(select jsonb_array_elements_text(r.raw -> 'types')) end,
    '{}'::text[]
  ) as google_types,
  coalesce(nullif(r.telefono_principal_e164, ''), nullif(r.phone_e164, ''), nullif(r.phone, ''), nullif(r.raw #>> '{internationalPhoneNumber}', ''), nullif(r.raw #>> '{nationalPhoneNumber}', '')) as phone,
  coalesce(nullif(r.correo_principal, ''), nullif(r.email, ''), nullif(r.raw #>> '{email}', '')) as email,
  r.correo_principal,
  r.correo_secundario,
  r.telefono_principal_e164,
  r.telefono_principal_tipo_linea,
  r.telefono_principal_extension,
  r.telefono_movil_1_e164,
  r.telefono_movil_1_tipo_linea,
  coalesce(nullif(r.website, ''), nullif(r.raw #>> '{websiteUri}', ''), nullif(r.raw #>> '{googleMapsUri}', '')) as website,
  nullif(r.address, '') as address,
  r.lat,
  r.lng,
  r.geom,
  r.rating,
  r.reviews,
  r.maps_url,
  r.creado_en as resultado_creado_en,
  b.query as busqueda_query,
  b.radio_m as busqueda_radio_m,
  b.lat as busqueda_lat,
  b.lng as busqueda_lng,
  b.centro as busqueda_centro,
  b.total_encontrados as busqueda_total_encontrados,
  b.meta as busqueda_meta,
  b.creado_en as busqueda_creado_en,
  b.creado_por as busqueda_creado_por,
  case when b.centro is not null and r.geom is not null then st_distance(b.centro, r.geom) else null::double precision end as distancia_m
from public.resultados r
join public.busquedas b on b.id = r.busqueda_id
where r.fuente = 'google_places'::public.fuente_resultado;

grant select on public.v_google_places_contactables to authenticated;
