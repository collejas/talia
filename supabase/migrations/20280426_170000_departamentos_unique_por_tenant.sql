-- Evita colisión global de nombres de departamentos entre tenants.
-- Antes: UNIQUE(nombre)
-- Ahora: UNIQUE(organizacion_id, nombre)

alter table public.departamentos
  drop constraint if exists departments_name_key;

alter table public.departamentos
  add constraint departamentos_organizacion_nombre_key
  unique (organizacion_id, nombre);
