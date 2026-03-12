-- Backfill de snapshot de plantilla para envios historicos de prospeccion.
-- Objetivo: evitar que Inbox muestre IDs/SIDs crudos cuando falta metadata de nombre.

with resolved as (
    select
        e.id,
        k.template_id_text,
        k.template_slug_text,
        k.template_sid_text,
        coalesce(
            nullif(t.nombre, ''),
            nullif((e.payload -> 'metadata' ->> 'template_label'), ''),
            nullif((e.payload -> 'metadata' ->> 'template_nombre'), ''),
            nullif((e.payload -> 'metadata' ->> 'template_name'), '')
        ) as template_label_resolved,
        coalesce(
            nullif(t.slug, ''),
            nullif((t.metadata ->> 'template_slug'), ''),
            k.template_slug_text
        ) as template_slug_resolved,
        coalesce(
            nullif((t.metadata ->> 'twilio_content_sid'), ''),
            nullif((t.metadata ->> 'template_sid'), ''),
            k.template_sid_text
        ) as template_sid_resolved,
        coalesce(
            nullif(t.id::text, ''),
            k.template_id_text
        ) as template_id_resolved
    from public.prospeccion_contacto_envio e
    cross join lateral (
        select
            nullif(
                coalesce(
                    e.payload ->> 'template_id',
                    e.payload -> 'metadata' ->> 'template_id',
                    e.payload -> 'metadata' ->> 'template_id_snapshot'
                ),
                ''
            ) as template_id_text,
            lower(
                nullif(
                    coalesce(
                        e.payload ->> 'template_slug',
                        e.payload -> 'metadata' ->> 'template_slug',
                        e.payload -> 'metadata' ->> 'template_slug_snapshot',
                        e.payload -> 'metadata' ->> 'kw'
                    ),
                    ''
                )
            ) as template_slug_text,
            lower(
                nullif(
                    coalesce(
                        e.payload -> 'metadata' ->> 'twilio_content_sid',
                        e.payload ->> 'twilio_content_sid',
                        e.detalle ->> 'template_sid',
                        e.payload -> 'metadata' ->> 'template_sid_snapshot'
                    ),
                    ''
                )
            ) as template_sid_text,
            lower(nullif(e.payload -> 'metadata' ->> 'brevo_template_id', '')) as brevo_template_id_text
    ) k
    left join lateral (
        select t.*
        from public.prospeccion_contacto_templates t
        where t.organizacion_id = e.organizacion_id
          and (
              (k.template_id_text is not null and t.id::text = k.template_id_text)
              or (
                  k.template_slug_text is not null
                  and lower(coalesce(t.slug, t.metadata ->> 'template_slug')) = k.template_slug_text
              )
              or (
                  k.template_sid_text is not null
                  and (
                      lower(t.metadata ->> 'twilio_content_sid') = k.template_sid_text
                      or lower(t.metadata ->> 'template_sid') = k.template_sid_text
                  )
              )
              or (
                  k.brevo_template_id_text is not null
                  and lower(t.metadata ->> 'brevo_template_id') = k.brevo_template_id_text
              )
          )
        order by
            case
                when k.template_id_text is not null and t.id::text = k.template_id_text then 1
                when k.template_slug_text is not null and lower(coalesce(t.slug, t.metadata ->> 'template_slug')) = k.template_slug_text then 2
                when k.template_sid_text is not null and (
                    lower(t.metadata ->> 'twilio_content_sid') = k.template_sid_text
                    or lower(t.metadata ->> 'template_sid') = k.template_sid_text
                ) then 3
                when k.brevo_template_id_text is not null and lower(t.metadata ->> 'brevo_template_id') = k.brevo_template_id_text then 4
                else 9
            end,
            t.actualizado_en desc nulls last,
            t.creado_en desc nulls last
        limit 1
    ) t on true
    where e.canal in ('whatsapp', 'correo')
)
update public.prospeccion_contacto_envio e
set payload = jsonb_set(
    e.payload,
    '{metadata}',
    coalesce(e.payload -> 'metadata', '{}'::jsonb)
    || jsonb_build_object(
        'template_id_snapshot',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_id_snapshot', ''),
            r.template_id_resolved,
            nullif(e.payload ->> 'template_id', ''),
            nullif(e.payload -> 'metadata' ->> 'template_id', '')
        ),
        'template_slug_snapshot',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_slug_snapshot', ''),
            r.template_slug_resolved,
            nullif(e.payload ->> 'template_slug', ''),
            nullif(e.payload -> 'metadata' ->> 'template_slug', '')
        ),
        'template_sid_snapshot',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_sid_snapshot', ''),
            r.template_sid_resolved
        ),
        'template_nombre_snapshot',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_nombre_snapshot', ''),
            r.template_label_resolved
        ),
        'template_name_snapshot',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_name_snapshot', ''),
            r.template_label_resolved
        ),
        'template_label_snapshot',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_label_snapshot', ''),
            r.template_label_resolved
        ),
        'template_nombre',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_nombre', ''),
            r.template_label_resolved
        ),
        'template_name',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_name', ''),
            r.template_label_resolved
        ),
        'template_label',
        coalesce(
            nullif(e.payload -> 'metadata' ->> 'template_label', ''),
            r.template_label_resolved
        )
    ),
    true
)
from resolved r
where r.id = e.id
  and (
      nullif(e.payload -> 'metadata' ->> 'template_label_snapshot', '') is null
      or nullif(e.payload -> 'metadata' ->> 'template_nombre_snapshot', '') is null
      or nullif(e.payload -> 'metadata' ->> 'template_name_snapshot', '') is null
      or nullif(e.payload -> 'metadata' ->> 'template_id_snapshot', '') is null
      or nullif(e.payload -> 'metadata' ->> 'template_slug_snapshot', '') is null
  );

-- Fallback para historicos sin match (template eliminado o no localizable):
-- evita mostrar IDs/SIDs crudos en Inbox.
update public.prospeccion_contacto_envio e
set payload = jsonb_set(
    e.payload,
    '{metadata}',
    coalesce(e.payload -> 'metadata', '{}'::jsonb)
    || jsonb_build_object(
        'template_label', coalesce(nullif(e.payload -> 'metadata' ->> 'template_label', ''), 'Plantilla historica'),
        'template_label_snapshot', coalesce(nullif(e.payload -> 'metadata' ->> 'template_label_snapshot', ''), 'Plantilla historica'),
        'template_nombre_snapshot', coalesce(nullif(e.payload -> 'metadata' ->> 'template_nombre_snapshot', ''), 'Plantilla historica'),
        'template_name_snapshot', coalesce(nullif(e.payload -> 'metadata' ->> 'template_name_snapshot', ''), 'Plantilla historica')
    ),
    true
)
where e.canal in ('whatsapp', 'correo')
  and nullif(e.payload -> 'metadata' ->> 'template_label_snapshot', '') is null
  and coalesce(
      nullif(e.payload ->> 'template_id', ''),
      nullif(e.payload -> 'metadata' ->> 'template_id', ''),
      nullif(e.payload ->> 'template_slug', ''),
      nullif(e.payload -> 'metadata' ->> 'template_slug', ''),
      nullif(e.payload -> 'metadata' ->> 'twilio_content_sid', ''),
      nullif(e.detalle ->> 'template_sid', '')
  ) is not null;
