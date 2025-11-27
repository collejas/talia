BEGIN;

UPDATE public.quote_templates
SET
    html = $$<!DOCTYPE html>
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
    css = $$@page {
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
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.concept-title { width: 24%; font-weight: 600; }
.concept-unit,
.concept-qty {
  width: 14%;
  text-align: center;
  font-size: 0.9rem;
}
.concept-amount {
  width: 20%;
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
    variables = '["cliente.nombre","cliente.empresa","cliente.correo","cliente.telefono","lead.nombre","cotizacion.referencia","cotizacion.fecha","cotizacion.descripcion","cotizacion.vigencia","detalles_propuesta","tabla_conceptos","ejecutivo.nombre","ejecutivo.correo"]'::jsonb,
    updated_at = now(),
    version = version + 1
WHERE slug = 'default';

COMMIT;
