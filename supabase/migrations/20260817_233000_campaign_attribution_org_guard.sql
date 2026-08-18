-- Garantiza el tenant de la atribución antes de evaluar sus FKs compuestas.
-- Algunas filas históricas de mensajes carecen de organizacion_id, pero la
-- campaña sigue siendo una relación explícita y confiable para recuperarlo.

create or replace function public.tg_set_campana_atribucion_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_campana_organizacion_id uuid;
begin
    select c.organizacion_id
      into v_campana_organizacion_id
      from public.campanas c
     where c.id = new.campana_id;

    if not found then
        raise exception 'La campaña de atribución no existe: %', new.campana_id
            using errcode = '23503';
    end if;

    if new.organizacion_id is null then
        new.organizacion_id := v_campana_organizacion_id;
    elsif new.organizacion_id <> v_campana_organizacion_id then
        raise exception 'La atribución no coincide con el tenant de la campaña'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists campana_mensaje_atribucion_set_org
    on public.campana_mensaje_atribucion;
create trigger campana_mensaje_atribucion_set_org
before insert or update of organizacion_id, campana_id
on public.campana_mensaje_atribucion
for each row execute function public.tg_set_campana_atribucion_org();

-- La RPC no debe tomar mensajes legacy sin tenant como fuente de atribución.
-- El guard anterior protege además cualquier inserción futura concurrente.
comment on function public.tg_set_campana_atribucion_org() is
    'Completa y valida organizacion_id de atribuciones desde la campaña relacionada.';
