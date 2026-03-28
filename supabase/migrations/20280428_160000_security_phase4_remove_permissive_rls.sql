-- Fase 4: eliminar políticas RLS permisivas redundantes

begin;

-- prospeccion_contactos_log
-- Existe política tenant/admin FOR ALL; esta INSERT global no aporta y abre bypass.
drop policy if exists p_insert_prospeccion_contactos_log on public.prospeccion_contactos_log;

-- prospeccion_prospectos
-- Existen políticas tenant/admin FOR ALL; estas reglas globales son redundantes y riesgosas.
drop policy if exists p_insert_prospeccion_prospectos on public.prospeccion_prospectos;
drop policy if exists p_update_prospeccion_prospectos on public.prospeccion_prospectos;

commit;
