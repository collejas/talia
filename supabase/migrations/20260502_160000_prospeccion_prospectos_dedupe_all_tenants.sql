create or replace function public.normalize_phone_for_dedupe(value text)
returns text
language sql
immutable
as $$
with cleaned as (
  select regexp_replace(coalesce(value, ''), '[^0-9]+', '', 'g') as digits
),
stripped as (
  select case
    when left(digits, 2) = '00' then substring(digits from 3)
    else digits
  end as digits
  from cleaned
)
select case
  when digits = '' then null
  when left(digits, 2) = '52' then
    case
      when length(digits) > 2 and substring(digits from 3 for 1) = '1' then '+' || digits
      when length(digits) > 2 then '+52' || '1' || substring(digits from 3)
      else '+' || digits
    end
  when length(digits) = 10 then '+52' || '1' || digits
  else '+' || digits
end
from stripped;
$$;

update public.prospeccion_prospectos
set
  email = lower(nullif(btrim(email), '')),
  phone_e164 = coalesce(
    public.normalize_phone_for_dedupe(phone_e164),
    public.normalize_phone_for_dedupe(phone)
  )
where
  email is not null
  or phone is not null
  or phone_e164 is not null;

do $$
declare
  v_changed integer := 1;
  v_row_count integer := 0;
begin
  create temp table tmp_prospeccion_prospectos_dedupe on commit drop as
  select
    id,
    organizacion_id,
    lower(nullif(btrim(email), '')) as email_norm,
    coalesce(nullif(btrim(phone_e164), ''), public.normalize_phone_for_dedupe(phone)) as phone_norm,
    actualizado_en,
    creado_en
  from public.prospeccion_prospectos;

  alter table tmp_prospeccion_prospectos_dedupe
    add column component_root uuid;

  update tmp_prospeccion_prospectos_dedupe
  set component_root = id;

  while v_changed > 0 loop
    v_changed := 0;

    update tmp_prospeccion_prospectos_dedupe target
    set component_root = source.min_root
    from (
      select organizacion_id, email_norm, min(component_root::text)::uuid as min_root
      from tmp_prospeccion_prospectos_dedupe
      where email_norm is not null
      group by organizacion_id, email_norm
    ) source
    where target.organizacion_id = source.organizacion_id
      and target.email_norm is not distinct from source.email_norm
      and target.component_root <> source.min_root;
    get diagnostics v_row_count = row_count;
    v_changed := v_changed + v_row_count;

    update tmp_prospeccion_prospectos_dedupe target
    set component_root = source.min_root
    from (
      select organizacion_id, phone_norm, min(component_root::text)::uuid as min_root
      from tmp_prospeccion_prospectos_dedupe
      where phone_norm is not null
      group by organizacion_id, phone_norm
    ) source
    where target.organizacion_id = source.organizacion_id
      and target.phone_norm is not distinct from source.phone_norm
      and target.component_root <> source.min_root;
    get diagnostics v_row_count = row_count;
    v_changed := v_changed + v_row_count;
  end loop;

  create temp table tmp_prospeccion_prospectos_canonical on commit drop as
  select component_root, id as canonical_id
  from (
    select
      id,
      component_root,
      row_number() over (
        partition by component_root
        order by actualizado_en desc nulls last, creado_en desc nulls last, id desc
      ) as rn
    from tmp_prospeccion_prospectos_dedupe
  ) ranked
  where rn = 1;

  update public.prospeccion_resultado_apariciones ra
  set prospecto_id = canonical.canonical_id
  from tmp_prospeccion_prospectos_dedupe dup
  join tmp_prospeccion_prospectos_canonical canonical
    on canonical.component_root = dup.component_root
  where ra.prospecto_id = dup.id
    and dup.id <> canonical.canonical_id;

  update public.prospeccion_contactos_log cl
  set prospecto_id = canonical.canonical_id
  from tmp_prospeccion_prospectos_dedupe dup
  join tmp_prospeccion_prospectos_canonical canonical
    on canonical.component_root = dup.component_root
  where cl.prospecto_id = dup.id
    and dup.id <> canonical.canonical_id;

  update public.prospeccion_contacto_suppressions cs
  set prospecto_id = canonical.canonical_id
  from tmp_prospeccion_prospectos_dedupe dup
  join tmp_prospeccion_prospectos_canonical canonical
    on canonical.component_root = dup.component_root
  where cs.prospecto_id = dup.id
    and dup.id <> canonical.canonical_id;

  create temp table tmp_prospeccion_contacto_envio_dedupe on commit drop as
  select
    ce.id,
    ce.batch_id,
    ce.canal,
    ce.procesado_en,
    ce.creado_en,
    ce.prospecto_id as original_prospecto_id,
    canonical.canonical_id as prospecto_id,
    row_number() over (
      partition by ce.batch_id, canonical.canonical_id, ce.canal
      order by coalesce(ce.procesado_en, ce.creado_en) desc nulls last, ce.id desc
    ) as rn
  from public.prospeccion_contacto_envio ce
  join tmp_prospeccion_prospectos_dedupe dup
    on dup.id = ce.prospecto_id
  join tmp_prospeccion_prospectos_canonical canonical
    on canonical.component_root = dup.component_root;

  create temp table tmp_prospeccion_contacto_envio_keep on commit drop as
  select *
  from tmp_prospeccion_contacto_envio_dedupe
  where rn = 1;

  update public.prospeccion_contactos_log cl
  set envio_id = keep.id
  from tmp_prospeccion_contacto_envio_dedupe dup
  join tmp_prospeccion_contacto_envio_keep keep
    on keep.batch_id = dup.batch_id
   and keep.canal = dup.canal
   and keep.prospecto_id = dup.prospecto_id
  where cl.envio_id = dup.id
    and dup.rn > 1;

  delete from public.prospeccion_contacto_envio ce
  using tmp_prospeccion_contacto_envio_dedupe dup
  where ce.id = dup.id
    and dup.rn > 1;

  update public.prospeccion_contacto_envio ce
  set prospecto_id = keep.prospecto_id
  from tmp_prospeccion_contacto_envio_keep keep
  where ce.id = keep.id
    and ce.prospecto_id <> keep.prospecto_id;

  delete from public.prospeccion_prospectos p
  using tmp_prospeccion_prospectos_dedupe dup
  join tmp_prospeccion_prospectos_canonical canonical
    on canonical.component_root = dup.component_root
  where p.id = dup.id
    and dup.id <> canonical.canonical_id;
end;
$$;

create unique index if not exists prospeccion_prospectos_org_email_unique
  on public.prospeccion_prospectos (organizacion_id, email)
  where email is not null and btrim(email) <> '';

create unique index if not exists prospeccion_prospectos_org_phone_e164_unique
  on public.prospeccion_prospectos (organizacion_id, phone_e164)
  where phone_e164 is not null and btrim(phone_e164) <> '';
