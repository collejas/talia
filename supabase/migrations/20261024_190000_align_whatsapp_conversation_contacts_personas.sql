-- Align the WhatsApp map source with the personas/contactos refactor.
-- personas is canonical; contactos is only a fallback for unmigrated rows.
create or replace function public.panel_visitantes_whatsapp_conversation_contacts_v1(
    p_organizacion_id uuid,
    p_from timestamptz default null,
    p_to timestamptz default null
)
returns table(
    conversacion_id uuid,
    telefono_e164 text,
    pais text,
    clave_entidad text,
    entidad text,
    clave_municipio text,
    municipio text
)
language sql
stable
security definer
set search_path = public
as $function$
select distinct on (c.id)
    c.id,
    coalesce(
        nullif(btrim(p.telefono_principal_e164), ''),
        nullif(btrim(p.telefono_secundario_e164), ''),
        nullif(btrim(p.telefono_movil_1_e164), ''),
        nullif(btrim(p.telefono_movil_2_e164), ''),
        nullif(btrim(ct.telefono_e164), ''),
        nullif(btrim(ct.telefono), '')
    ) as telefono_e164,
    coalesce(nullif(btrim(p.pais), ''), nullif(btrim(ct.pais), '')) as pais,
    coalesce(nullif(btrim(p.clave_entidad), ''), nullif(btrim(ct.clave_entidad), '')) as clave_entidad,
    coalesce(nullif(btrim(p.entidad), ''), nullif(btrim(ct.entidad), '')) as entidad,
    coalesce(nullif(btrim(p.clave_municipio), ''), nullif(btrim(ct.clave_municipio), '')) as clave_municipio,
    coalesce(nullif(btrim(p.municipio), ''), nullif(btrim(ct.municipio), '')) as municipio
from public.conversaciones c
left join public.personas p
  on p.id = coalesce(c.persona_id, c.contacto_id)
 and p.organizacion_id = c.organizacion_id
left join public.contactos ct
  on p.id is null
 and ct.id = c.contacto_id
 and ct.organizacion_id = c.organizacion_id
where c.organizacion_id = p_organizacion_id
  and lower(coalesce(c.canal, '')) = 'whatsapp'
  and (p_from is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en, now()) >= p_from)
  and (p_to is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en, now()) <= p_to)
order by c.id, coalesce(c.ultimo_mensaje_en, c.iniciada_en, now()) desc;
$function$;

revoke all on function public.panel_visitantes_whatsapp_conversation_contacts_v1(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.panel_visitantes_whatsapp_conversation_contacts_v1(uuid, timestamptz, timestamptz) to service_role;
