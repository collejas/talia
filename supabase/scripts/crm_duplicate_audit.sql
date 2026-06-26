-- Auditoria de duplicados activos en CRM.
-- Recorre personas y cuentas usando las mismas normalizaciones que el backend.

with active_personas as (
    select
        id,
        organizacion_id,
        creado_en,
        nullif(lower(btrim(coalesce(correo_principal, correo, correo_secundario, correo_institucional, correo_personal_3))), '') as email_norm,
        nullif(regexp_replace(btrim(coalesce(telefono_principal_e164, telefono_movil_1_e164, telefono)), '\D', '', 'g'), '') as phone_norm
    from public.personas
    where archived_at is null
      and merged_into_persona_id is null
      and coalesce(estado, '') <> 'fusionado'
),
persona_groups as (
    select organizacion_id, 'email'::text as key_type, email_norm as key_value, count(*) as total, array_agg(id order by creado_en asc, id asc) as ids
    from active_personas
    where email_norm is not null
    group by organizacion_id, email_norm
    having count(*) > 1
    union all
    select organizacion_id, 'phone'::text as key_type, phone_norm as key_value, count(*) as total, array_agg(id order by creado_en asc, id asc) as ids
    from active_personas
    where phone_norm is not null
    group by organizacion_id, phone_norm
    having count(*) > 1
),
active_cuentas as (
    select
        id,
        organizacion_id,
        creado_en,
        nullif(lower(btrim(coalesce(correo_principal, correo, email, correo_secundario))), '') as email_norm,
        nullif(regexp_replace(btrim(coalesce(telefono_principal_e164, telefono, telefono_secundario_e164)), '\D', '', 'g'), '') as phone_norm,
        nullif(upper(btrim(rfc)), '') as rfc_norm
    from public.cuentas
    where archived_at is null
      and merged_into_cuenta_id is null
      and coalesce(estado, '') <> 'fusionado'
),
cuenta_groups as (
    select organizacion_id, 'rfc'::text as key_type, rfc_norm as key_value, count(*) as total, array_agg(id order by creado_en asc, id asc) as ids
    from active_cuentas
    where rfc_norm is not null
    group by organizacion_id, rfc_norm
    having count(*) > 1
    union all
    select organizacion_id, 'email'::text as key_type, email_norm as key_value, count(*) as total, array_agg(id order by creado_en asc, id asc) as ids
    from active_cuentas
    where email_norm is not null
    group by organizacion_id, email_norm
    having count(*) > 1
    union all
    select organizacion_id, 'phone'::text as key_type, phone_norm as key_value, count(*) as total, array_agg(id order by creado_en asc, id asc) as ids
    from active_cuentas
    where phone_norm is not null
    group by organizacion_id, phone_norm
    having count(*) > 1
)
select 'personas' as entity, * from persona_groups
union all
select 'cuentas' as entity, * from cuenta_groups
order by entity, organizacion_id, key_type, key_value;
