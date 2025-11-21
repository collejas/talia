-- -------------------------------------------------------------
-- Plantilla editable para cotizaciones enviadas desde el panel.
-- Define la estructura base del PDF y permite versionar cambios
-- sin modificar el código del backend.
-- -------------------------------------------------------------

create table if not exists public.quote_templates (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    nombre text not null,
    descripcion text,
    html text not null,
    css text not null default '',
    variables jsonb not null default '[]'::jsonb,
    config jsonb not null default '{}'::jsonb,
    version integer not null default 1,
    is_active boolean not null default true,
    updated_by uuid references public.usuarios(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.quote_templates is
    'Plantillas HTML utilizadas para renderizar las cotizaciones del panel.';

comment on column public.quote_templates.slug is 'Identificador lógico (ej. "default") para seleccionar la plantilla.';
comment on column public.quote_templates.nombre is 'Nombre visible del formato.';
comment on column public.quote_templates.descripcion is 'Notas o contexto sobre el formato.';
comment on column public.quote_templates.html is 'Markup principal con placeholders moustache {{token}}.';
comment on column public.quote_templates.css is 'Bloque CSS que se inyecta en el template.';
comment on column public.quote_templates.variables is 'Listado JSON con los tokens soportados por el template.';
comment on column public.quote_templates.config is 'Configuración declarativa (logo, colores, textos) usada para construir el HTML.';
comment on column public.quote_templates.version is 'Número de versión para mantener historial de cambios.';
comment on column public.quote_templates.is_active is 'Indica si la plantilla puede seleccionarse para renderizar PDFs.';
comment on column public.quote_templates.updated_by is 'Usuario que realizó la última edición desde el panel.';
comment on column public.quote_templates.created_at is 'Fecha de creación.';
comment on column public.quote_templates.updated_at is 'Fecha de última modificación.';

create index if not exists quote_templates_active_idx
    on public.quote_templates (is_active, updated_at desc);

drop trigger if exists quote_templates_touch_updated_at on public.quote_templates;
create trigger quote_templates_touch_updated_at
    before update on public.quote_templates
    for each row execute function public.tg_touch_updated_at();

insert into public.quote_templates (slug, nombre, descripcion, html, css, variables, config, version, is_active)
values (
    'default',
    'Formato estándar Tal-IA',
    'Plantilla base utilizada para las cotizaciones PDF generadas en el panel.',
    $$<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Cotización {{cotizacion.referencia}}</title>
  </head>
  <body>
    <header>
      <h1>{{empresa.nombre}}</h1>
      <p>Cotización para {{cliente.nombre}}</p>
      <p class="muted">Proyecto: {{lead.nombre}} · Emitida el {{cotizacion.fecha}}</p>
    </header>

    <section>
      <h2>Contacto</h2>
      <p><strong>Nombre:</strong> {{cliente.nombre}}</p>
      <p><strong>Empresa:</strong> {{cliente.empresa}}</p>
      <p><strong>Correo:</strong> {{cliente.correo}}</p>
      <p><strong>Teléfono:</strong> {{cliente.telefono}}</p>
    </section>

    <section>
      <h2>Resumen del proyecto</h2>
      <p>{{cotizacion.descripcion}}</p>
    </section>

    <section>
      <h2>Detalle de conceptos</h2>
      {{tabla_conceptos}}
    </section>

    <section>
      <h2>Resumen económico</h2>
      {{resumen_totales}}
      <p class="muted">Vigencia: {{cotizacion.vigencia}}</p>
    </section>

    <footer>
      <p>Emitido por {{ejecutivo.nombre}} ({{ejecutivo.correo}})</p>
      <p class="muted">Tal-IA automatiza ventas y soporte omnicanal.</p>
    </footer>
  </body>
</html>$$,
    $$body { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; }
header, section, footer { margin-bottom: 24px; }
h1 { font-size: 28px; margin-bottom: 4px; }
h2 { font-size: 18px; margin-bottom: 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
p { margin: 4px 0; }
.table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.table th, .table td { border: 1px solid #cbd5f5; padding: 8px; text-align: left; }
.muted { color: #475569; font-size: 0.9rem; }
footer { border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 0.95rem; }
$$,
    '["cliente.nombre","cliente.empresa","cliente.correo","cliente.telefono","lead.nombre","cotizacion.referencia","cotizacion.fecha","cotizacion.descripcion","cotizacion.vigencia","tabla_conceptos","resumen_totales","ejecutivo.nombre","ejecutivo.correo"]'::jsonb,
    '{
      "logoUrl": "/assets/logos/Logo8.png",
      "primaryColor": "#0f172a",
      "accentColor": "#14b8a6",
      "headerTitle": "Geoactiv · Propuesta Comercial",
      "headerSubtitle": "Solución integral Tal-IA",
      "introText": "Hola {{cliente.nombre}}, te compartimos la propuesta que resume la solución acordada.",
      "highlights": [
        "Automatiza la atención 24/7 en webchat, WhatsApp y voz.",
        "Califica prospectos y agenda demos sin saturar a tu equipo.",
        "Centraliza conversaciones y métricas en un solo panel."
      ],
      "notesTitle": "Notas detectadas",
      "notesBody": "Incluimos las principales necesidades conversadas y personalizamos la activación para {{cliente.empresa}}.",
      "termsTitle": "Términos y vigencia",
      "termsBody": "Esta propuesta es referencial y puede ajustarse a la medida. Vigencia 15 días naturales.",
      "signatureName": "Equipo Tal-IA",
      "signatureRole": "Consultoría Geoactiv",
      "footerNote": "Tal-IA automatiza ventas y soporte omnicanal."
    }'::jsonb,
    1,
    true
)
on conflict (slug) do nothing;

alter table public.quote_templates enable row level security;

grant select, insert, update, delete on public.quote_templates to postgres, service_role;
grant select, insert, update on public.quote_templates to authenticated;

drop policy if exists quote_templates_select on public.quote_templates;
create policy quote_templates_select on public.quote_templates
    for select
    to authenticated
    using (true);

drop policy if exists quote_templates_insert_admin on public.quote_templates;
create policy quote_templates_insert_admin on public.quote_templates
    for insert
    to authenticated
    with check (public.es_admin(auth.uid()));

drop policy if exists quote_templates_update_admin on public.quote_templates;
create policy quote_templates_update_admin on public.quote_templates
    for update
    to authenticated
    using (public.es_admin(auth.uid()))
    with check (public.es_admin(auth.uid()));
