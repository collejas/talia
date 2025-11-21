-- -------------------------------------------------------------
-- Tabla de plantillas para correos informativos del panel.
-- Permite personalizar la introducción, bullets y recursos que
-- el backend usa en la función send_information_email.
-- -------------------------------------------------------------

create table if not exists public.panel_email_templates (
    slug text primary key,
    intro text not null,
    closing text not null,
    highlights jsonb not null default '[]'::jsonb,
    resources jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

comment on table public.panel_email_templates is
    'Plantillas personalizables para los correos que Tal-IA envía desde el panel cuando el prospecto solicita información.';

comment on column public.panel_email_templates.slug is 'Identificador único de la plantilla (ej. "default").';
comment on column public.panel_email_templates.intro is 'Texto de introducción del correo.';
comment on column public.panel_email_templates.closing is 'Texto de cierre/CTA del correo.';
comment on column public.panel_email_templates.highlights is 'Arreglo JSON con los beneficios o puntos clave que se envían como bullets.';
comment on column public.panel_email_templates.resources is 'Arreglo JSON con objetos {label, url} para enlaces adicionales.';
comment on column public.panel_email_templates.updated_at is 'Marca de tiempo de la última actualización.';

-- Inserta el template base si no existe ya.
insert into public.panel_email_templates (slug, intro, closing, highlights, resources)
values (
    'default',
    'Gracias por tu interés en Tal-IA. Te comparto un resumen con la información que platicamos:',
    'Cuando quieras, puedo ayudarte a agendar una demo personalizada o resolver cualquier duda por este medio.',
    '[
      "Automatiza la atención 24/7 en webchat, WhatsApp y voz con un solo asistente.",
      "Califica prospectos y agenda demos o recordatorios sin cargar al equipo comercial.",
      "Centraliza conversaciones, métricas y tareas en el panel de Tal-IA para dar seguimiento inteligente."
    ]'::jsonb,
    '[
      {"label": "Sitio de Tal-IA", "url": "https://talia.mx/"},
      {"label": "Geoactiv · Casos y soluciones", "url": "https://geoactiv.ai/"}
    ]'::jsonb
)
on conflict (slug) do nothing;
