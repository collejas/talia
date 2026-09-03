-- Conserva la identidad de cobro aunque el tenant elimine el dato operativo.
-- Las columnas son históricas y no deben depender de conversaciones/personas.

alter table public.cobro_mensajes
  add column if not exists contacto_nombre_historico text,
  add column if not exists contacto_telefono_historico text,
  add column if not exists contacto_correo_historico text,
  add column if not exists operativo_eliminado boolean not null default false,
  add column if not exists operativo_eliminado_en timestamptz;

alter table public.cobro_hilos_resumen
  add column if not exists operativo_eliminado boolean not null default false,
  add column if not exists operativo_eliminado_en timestamptz;

-- Recupera la identidad de los registros que todavía conservan su conversación.
update public.cobro_mensajes cm
set contacto_nombre_historico = coalesce(
      nullif(btrim(p.nombre_completo), ''),
      nullif(btrim(c.nombre_remitente), ''),
      nullif(btrim(c.correo_remitente), '')
    ),
    contacto_telefono_historico = nullif(btrim(p.telefono_principal_e164), ''),
    contacto_correo_historico = coalesce(
      nullif(btrim(p.correo_principal), ''),
      nullif(btrim(p.correo), ''),
      nullif(btrim(c.correo_remitente), '')
    )
from public.conversaciones c
left join public.personas p
  on p.organizacion_id = c.organizacion_id
 and p.id = c.persona_id
where c.organizacion_id = cm.organizacion_id
  and c.id = cm.conversacion_id
  and (cm.contacto_nombre_historico is null
    or cm.contacto_telefono_historico is null
    or cm.contacto_correo_historico is null);

-- Los registros históricos cuyo origen operativo ya desapareció quedan
-- identificados como eliminados. La fecha es una aproximación conservadora
-- basada en la fecha del cargo, porque el borrado ocurrió antes de este control.
update public.cobro_mensajes cm
set operativo_eliminado = true,
    operativo_eliminado_en = coalesce(cm.operativo_eliminado_en, cm.creado_en)
where not exists (
  select 1 from public.conversaciones c
  where c.organizacion_id = cm.organizacion_id
    and c.id = cm.conversacion_id
);

update public.cobro_hilos_resumen chr
set operativo_eliminado = true,
    operativo_eliminado_en = coalesce(chr.operativo_eliminado_en, chr.creado_en)
where not exists (
  select 1 from public.conversaciones c
  where c.organizacion_id = chr.organizacion_id
    and c.id = chr.conversacion_id
);

create or replace function public.capture_billing_contact_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if new.conversacion_id is not null then
    update public.cobro_mensajes cm
    set contacto_nombre_historico = coalesce(
          cm.contacto_nombre_historico,
          nullif(btrim(p.nombre_completo), ''),
          nullif(btrim(c.nombre_remitente), ''),
          nullif(btrim(c.correo_remitente), '')
        ),
        contacto_telefono_historico = coalesce(
          cm.contacto_telefono_historico,
          nullif(btrim(p.telefono_principal_e164), '')
        ),
        contacto_correo_historico = coalesce(
          cm.contacto_correo_historico,
          nullif(btrim(p.correo_principal), ''),
          nullif(btrim(p.correo), ''),
          nullif(btrim(c.correo_remitente), '')
        )
    from public.conversaciones c
    left join public.personas p
      on p.organizacion_id = c.organizacion_id
     and p.id = c.persona_id
    where cm.id = new.id
      and c.organizacion_id = new.organizacion_id
      and c.id = new.conversacion_id;
  end if;
  return new;
end;
$$;

create or replace function public.mark_billing_message_operational_deleted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  update public.cobro_mensajes cm
  set contacto_nombre_historico = coalesce(
        cm.contacto_nombre_historico,
        nullif(btrim(p.nombre_completo), ''),
        nullif(btrim(c.nombre_remitente), ''),
        nullif(btrim(c.correo_remitente), '')
      ),
      contacto_telefono_historico = coalesce(cm.contacto_telefono_historico, nullif(btrim(p.telefono_principal_e164), '')),
      contacto_correo_historico = coalesce(
        cm.contacto_correo_historico,
        nullif(btrim(p.correo_principal), ''),
        nullif(btrim(p.correo), ''),
        nullif(btrim(c.correo_remitente), '')
      ),
      operativo_eliminado = true,
      operativo_eliminado_en = coalesce(cm.operativo_eliminado_en, now())
  from public.conversaciones c
  left join public.personas p
    on p.organizacion_id = c.organizacion_id
   and p.id = c.persona_id
  where cm.organizacion_id = old.organizacion_id
    and cm.mensaje_id = old.id
    and c.organizacion_id = old.organizacion_id
    and c.id = old.conversacion_id;
  return old;
end;
$$;

create or replace function public.mark_billing_conversation_operational_deleted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  update public.cobro_mensajes cm
  set contacto_nombre_historico = coalesce(
        cm.contacto_nombre_historico,
        nullif(btrim(p.nombre_completo), ''),
        nullif(btrim(old.nombre_remitente), ''),
        nullif(btrim(old.correo_remitente), '')
      ),
      contacto_telefono_historico = coalesce(cm.contacto_telefono_historico, nullif(btrim(p.telefono_principal_e164), '')),
      contacto_correo_historico = coalesce(
        cm.contacto_correo_historico,
        nullif(btrim(p.correo_principal), ''),
        nullif(btrim(p.correo), ''),
        nullif(btrim(old.correo_remitente), '')
      ),
      operativo_eliminado = true,
      operativo_eliminado_en = coalesce(cm.operativo_eliminado_en, now())
  from public.personas p
  where cm.organizacion_id = old.organizacion_id
    and cm.conversacion_id = old.id
    and p.organizacion_id = old.organizacion_id
    and p.id = old.persona_id;

  update public.cobro_hilos_resumen chr
  set operativo_eliminado = true,
      operativo_eliminado_en = coalesce(chr.operativo_eliminado_en, now())
  where chr.organizacion_id = old.organizacion_id
    and chr.conversacion_id = old.id;
  return old;
end;
$$;

revoke all on function public.capture_billing_contact_snapshot() from public, anon, authenticated;
revoke all on function public.mark_billing_message_operational_deleted() from public, anon, authenticated;
revoke all on function public.mark_billing_conversation_operational_deleted() from public, anon, authenticated;

drop trigger if exists trg_capture_billing_contact_snapshot on public.cobro_mensajes;
create trigger trg_capture_billing_contact_snapshot
after insert on public.cobro_mensajes
for each row execute function public.capture_billing_contact_snapshot();

drop trigger if exists trg_mark_billing_message_operational_deleted on public.mensajes;
create trigger trg_mark_billing_message_operational_deleted
before delete on public.mensajes
for each row execute function public.mark_billing_message_operational_deleted();

drop trigger if exists trg_mark_billing_conversation_operational_deleted on public.conversaciones;
create trigger trg_mark_billing_conversation_operational_deleted
before delete on public.conversaciones
for each row execute function public.mark_billing_conversation_operational_deleted();
