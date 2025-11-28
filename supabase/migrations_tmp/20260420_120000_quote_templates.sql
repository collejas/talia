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
      <div class="brand">
        <img src="/assets/logos/Logo8.png" alt="Logo" class="logo" />
        <div>
          <p class="eyebrow">Geoactiv · Propuesta Comercial</p>
          <h1>Solución integral Tal-IA</h1>
          <p class="muted">Proyecto {{lead.nombre}} · Emitida el {{cotizacion.fecha}}</p>
        </div>
      </div>
    </header>

    <section class="intro">
      <p>Hola {{cliente.nombre}}, te compartimos la propuesta que resume la solución acordada para {{cliente.empresa}}.</p>
    </section>

    <section>
      <h2>Resumen ejecutivo</h2>
      <ul class="highlights">
        <li>Automatiza la atención 24/7 en webchat, WhatsApp y voz.</li>
        <li>Califica prospectos y agenda demos sin saturar a tu equipo.</li>
        <li>Centraliza conversaciones y métricas en un solo panel.</li>
      </ul>
    </section>

    <section>
      <h2>Detalles de propuesta económica</h2>
      {{detalles_propuesta}}
    </section>

    <section>
      <h2>Propuesta económica</h2>
      {{tabla_conceptos}}
      <p class="muted">Vigencia estimada: {{cotizacion.vigencia}}</p>
    </section>

    <section>
      <h2>Notas detectadas</h2>
      <p>Documentamos las necesidades conversadas y personalizamos la activación para {{cliente.empresa}}.</p>
    </section>

    <section>
      <h2>Términos y vigencia</h2>
      <p>Esta propuesta es referencial y puede ajustarse a la medida. Vigencia 15 días naturales.</p>
    </section>

    <footer>
      <p>Emitido por {{ejecutivo.nombre}} · {{ejecutivo.correo}}</p>
      <p>Equipo Tal-IA · Consultoría Geoactiv</p>
      <p class="muted">Tal-IA automatiza ventas y soporte omnicanal.</p>
    </footer>
  </body>
</html>$$,
    $$@page {
  size: A4;
  margin: 12mm 10mm;
}
:root {
  --quote-primary: #0f172a;
  --quote-accent: #14b8a6;
}
body {
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: var(--quote-primary);
  margin: 0;
  padding: 24px 28px;
  line-height: 1.5;
  font-size: 0.95rem;
}
header, section, footer { margin-bottom: 24px; }
header .brand { display: flex; align-items: center; gap: 16px; }
.logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 8px;
  background: #fff;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.75rem;
  color: var(--quote-accent);
  margin-bottom: 4px;
}
h1 {
  margin: 0 0 4px;
  font-size: 1.75rem;
  color: var(--quote-primary);
}
h2 {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 6px;
  margin-top: 32px;
  color: var(--quote-primary);
  font-size: 1.1rem;
}
.intro {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 20px;
}
.highlights {
  display: grid;
  gap: 8px;
  padding-left: 20px;
}
.highlights li {
  background: #f0fdf4;
  border-left: 3px solid var(--quote-accent);
  padding: 8px 12px;
  border-radius: 6px;
  list-style: none;
}
.proposal-details {
  margin-top: 16px;
  border: 1px solid #dbe3f3;
  border-radius: 12px;
  padding: 16px 18px;
  background: #f8fbff;
}
.proposal-detail { margin-bottom: 12px; }
.proposal-detail:last-child { margin-bottom: 0; }
.proposal-detail h3 { margin: 0 0 6px; font-size: 1rem; }
.proposal-detail p { margin: 0; font-size: 0.92rem; color: #334155; line-height: 1.5; }
.concept-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  table-layout: fixed;
}
.concept-table th,
.concept-table td {
  border: 1px solid #d7e3f4;
  padding: 8px 10px;
  vertical-align: top;
  font-size: 0.92rem;
}
.concept-table th {
  background: #f8fafc;
  color: var(--quote-primary);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.concept-title { width: 28%; font-weight: 600; }
.concept-unit {
  width: 12%;
  text-align: center;
  font-size: 0.9rem;
}
.concept-price {
  width: 18%;
  text-align: right;
  font-size: 0.9rem;
  white-space: nowrap;
}
.concept-qty {
  width: 12%;
  text-align: center;
  font-size: 0.9rem;
}
.concept-amount {
  width: 30%;
  text-align: right;
  font-weight: 600;
  color: var(--quote-primary);
  white-space: nowrap;
}
.concept-table tfoot td {
  border-top: 2px solid #cfd8ea;
  font-weight: 600;
}
.concept-table .totals-label {
  text-align: right;
  padding-right: 14px;
}
.muted { color: #475569; font-size: 0.9rem; }
footer {
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
  font-size: 0.95rem;
}
$$,
    '["cliente.nombre","cliente.empresa","cliente.correo","cliente.telefono","lead.nombre","cotizacion.referencia","cotizacion.fecha","cotizacion.descripcion","cotizacion.vigencia","detalles_propuesta","tabla_conceptos","ejecutivo.nombre","ejecutivo.correo"]'::jsonb,
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
