-- Agrega columna config a quote_templates si no existiera (para entornos ya creados).
alter table if exists public.quote_templates
    add column if not exists config jsonb not null default '{}'::jsonb;

comment on column public.quote_templates.config is 'Configuración declarativa (logo, colores, textos) usada para construir el HTML.';
