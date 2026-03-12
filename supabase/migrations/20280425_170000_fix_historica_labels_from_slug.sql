-- Corrige labels historicos de plantillas de prospeccion usando slug disponible.
-- Aplica a todos los envios donde el label quedo como "Plantilla historica".

with resolved as (
    select
        e.id,
        coalesce(
            nullif(t.nombre, ''),
            'Plantilla ' || coalesce(
                nullif(e.payload -> 'metadata' ->> 'template_slug_snapshot', ''),
                nullif(e.payload -> 'metadata' ->> 'template_slug', ''),
                nullif(e.payload ->> 'template_slug', ''),
                nullif(e.payload -> 'metadata' ->> 'kw', '')
            )
        ) as label_resolved
    from public.prospeccion_contacto_envio e
    left join public.prospeccion_contacto_templates t
      on t.organizacion_id = e.organizacion_id
     and (
          (nullif(e.payload -> 'metadata' ->> 'template_id_snapshot', '') is not null
           and t.id::text = e.payload -> 'metadata' ->> 'template_id_snapshot')
          or (
              nullif(e.payload -> 'metadata' ->> 'template_slug_snapshot', '') is not null
              and lower(coalesce(t.slug, t.metadata ->> 'template_slug')) =
                  lower(e.payload -> 'metadata' ->> 'template_slug_snapshot')
          )
          or (
              nullif(e.payload -> 'metadata' ->> 'twilio_content_sid', '') is not null
              and lower(coalesce(t.metadata ->> 'twilio_content_sid', t.metadata ->> 'template_sid')) =
                  lower(e.payload -> 'metadata' ->> 'twilio_content_sid')
          )
     )
    where e.canal in ('whatsapp', 'correo')
      and lower(
          coalesce(
              e.payload -> 'metadata' ->> 'template_label_snapshot',
              e.payload -> 'metadata' ->> 'template_label',
              ''
          )
      ) in ('plantilla historica', 'plantilla histórica')
      and coalesce(
          nullif(e.payload -> 'metadata' ->> 'template_slug_snapshot', ''),
          nullif(e.payload -> 'metadata' ->> 'template_slug', ''),
          nullif(e.payload ->> 'template_slug', ''),
          nullif(e.payload -> 'metadata' ->> 'kw', '')
      ) is not null
)
update public.prospeccion_contacto_envio e
set payload = jsonb_set(
    e.payload,
    '{metadata}',
    coalesce(e.payload -> 'metadata', '{}'::jsonb)
    || jsonb_build_object(
        'template_label', r.label_resolved,
        'template_label_snapshot', r.label_resolved,
        'template_nombre', r.label_resolved,
        'template_nombre_snapshot', r.label_resolved,
        'template_name', r.label_resolved,
        'template_name_snapshot', r.label_resolved
    ),
    true
)
from resolved r
where r.id = e.id;
