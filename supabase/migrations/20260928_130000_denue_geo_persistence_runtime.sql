-- Persist DENUE geographic columns for new result batches.
-- Historical backfill is intentionally executed in bounded operational batches
-- outside this DDL migration to avoid statement timeouts on large installations.

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
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return 0; end if;
  if v_organizacion is null then
    begin
      v_header := nullif(current_setting('request.headers.x-organizacion-id', true), '');
      if v_header is not null then v_organizacion := v_header::uuid; end if;
    exception when others then v_organizacion := null;
    end;
  end if;
  if v_organizacion is null then
    raise exception using errcode = 'P0001', message = 'organizacion_id_required';
  end if;
  if not exists (
    select 1 from public.busquedas as busqueda
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
    email, website, address, address_full,
    tipo_vialidad, nombre_vialidad, numero_exterior, numero_interior, colonia,
    codigo_postal, estado_cve, estado_nombre, municipio_cve, municipio_nombre,
    localidad_cve, localidad, cvegeo, asentamiento, entre_calles, referencia,
    lat, lng, rating, reviews, maps_url, organizacion_id, raw,
    google_primary_type, google_primary_type_display_name, google_types
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
    coalesce(source.item ->> 'address_full', source.item ->> 'address'),
    source.item ->> 'tipo_vialidad', source.item ->> 'nombre_vialidad',
    source.item ->> 'numero_exterior', source.item ->> 'numero_interior', source.item ->> 'colonia',
    source.item ->> 'codigo_postal', source.item ->> 'estado_cve', source.item ->> 'estado_nombre',
    source.item ->> 'municipio_cve', source.item ->> 'municipio_nombre',
    source.item ->> 'localidad_cve', source.item ->> 'localidad', source.item ->> 'cvegeo',
    source.item ->> 'asentamiento', source.item ->> 'entre_calles', source.item ->> 'referencia',
    nullif(source.item ->> 'lat', '')::double precision,
    nullif(source.item ->> 'lng', '')::double precision,
    nullif(source.item ->> 'rating', '')::numeric,
    nullif(source.item ->> 'reviews', '')::integer,
    coalesce(source.item ->> 'maps_url', source.item ->> 'maps'),
    v_organizacion, source.item,
    nullif(source.item ->> 'google_primary_type', ''),
    nullif(source.item ->> 'google_primary_type_display_name', ''),
    case when jsonb_typeof(source.item -> 'google_types') = 'array'
      then array(select jsonb_array_elements_text(source.item -> 'google_types')) end
  from deduplicated as source
  on conflict (busqueda_id, fuente, external_id)
  do update set
    clee = excluded.clee, name = excluded.name, razon_social = excluded.razon_social,
    actividad = excluded.actividad, estrato = excluded.estrato,
    phone = excluded.phone, phone_e164 = excluded.phone_e164,
    correo_principal = excluded.correo_principal, correo_secundario = excluded.correo_secundario,
    telefono_principal_e164 = excluded.telefono_principal_e164,
    telefono_principal_tipo_linea = excluded.telefono_principal_tipo_linea,
    telefono_principal_extension = excluded.telefono_principal_extension,
    telefono_movil_1_e164 = excluded.telefono_movil_1_e164,
    telefono_movil_1_tipo_linea = excluded.telefono_movil_1_tipo_linea,
    email = excluded.email, website = excluded.website, address = excluded.address,
    address_full = excluded.address_full, tipo_vialidad = excluded.tipo_vialidad,
    nombre_vialidad = excluded.nombre_vialidad, numero_exterior = excluded.numero_exterior,
    numero_interior = excluded.numero_interior, colonia = excluded.colonia,
    codigo_postal = excluded.codigo_postal, estado_cve = excluded.estado_cve,
    estado_nombre = excluded.estado_nombre, municipio_cve = excluded.municipio_cve,
    municipio_nombre = excluded.municipio_nombre, localidad_cve = excluded.localidad_cve,
    localidad = excluded.localidad, cvegeo = excluded.cvegeo,
    asentamiento = excluded.asentamiento, entre_calles = excluded.entre_calles,
    referencia = excluded.referencia, lat = excluded.lat, lng = excluded.lng,
    rating = excluded.rating, reviews = excluded.reviews, maps_url = excluded.maps_url,
    raw = excluded.raw, google_primary_type = excluded.google_primary_type,
    google_primary_type_display_name = excluded.google_primary_type_display_name,
    google_types = excluded.google_types, columnarized_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
