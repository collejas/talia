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
        <div class="brand-left">
          <div class="brand-head">
            <img src="/assets/logos/Logo8.png" alt="Logo" class="logo" />
            <div class="brand-copy">
              <h1>{{organizacion.nombre}}</h1>
              <p class="subtitle">{{organizacion.eslogan_empresa}}</p>
            </div>
          </div>
          <div class="brand-lines">
            <p><strong>{{organizacion.razon_social}}</strong> · RFC {{organizacion.rfc}}</p>
            <p>{{organizacion.direccion_fiscal_calle}}, # {{organizacion.direccion_fiscal_numero_exterior}} {{organizacion.direccion_fiscal_numero_interior}}, Colonia: {{organizacion.direccion_fiscal_colonia}}</p>
            <p>CP {{organizacion.codigo_postal}}, {{organizacion.estado}}, {{organizacion.ciudad}}, {{organizacion.pais}}</p>
            <p>{{organizacion.sitio_web}}</p>
          </div>
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
.brand {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}
.brand-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.brand-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.brand-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 0 1 auto;
  min-width: 0;
  min-height: 64px;
  max-width: 360px;
}
.logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 8px;
  background: #fff;
}
h1 {
  margin: 0;
  font-size: 1.55rem;
  color: var(--quote-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.subtitle {
  margin: 2px 0 0;
  color: #475569;
  font-size: 0.77rem;
  line-height: 1.15;
}
.brand-lines {
  display: grid;
  gap: 2px;
  margin-top: 4px;
  color: #334155;
  font-size: 0.63rem;
  line-height: 1.18;
}
.brand-lines p {
  margin: 0;
}
.brand-lines strong {
  color: var(--quote-primary);
}
.top-meta {
  min-width: 180px;
  text-align: right;
  display: grid;
  gap: 5px;
  align-content: start;
  padding-top: 1px;
}
.meta-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.meta-label {
  color: #64748b;
  font-size: 7.8pt;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  line-height: 1.22;
}
.meta-value {
  display: block;
  margin-top: 0;
  color: #0f172a;
  font-size: 9pt;
  font-weight: 700;
  line-height: 1.22;
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
.muted {
  color: #475569;
  font-size: 0.9rem;
}
footer {
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
  font-size: 0.95rem;
}
$$,
    variables = to_jsonb(ARRAY[
        'cliente.nombre',
        'cliente.empresa',
        'cliente.correo',
        'cliente.telefono',
        'lead.nombre',
        'organizacion.nombre',
        'organizacion.eslogan_empresa',
        'organizacion.razon_social',
        'organizacion.rfc',
        'organizacion.direccion_fiscal_calle',
        'organizacion.direccion_fiscal_numero_exterior',
        'organizacion.direccion_fiscal_numero_interior',
        'organizacion.direccion_fiscal_colonia',
        'organizacion.codigo_postal',
        'organizacion.estado',
        'organizacion.ciudad',
        'organizacion.pais',
        'organizacion.sitio_web',
        'cotizacion.referencia',
        'cotizacion.fecha',
        'cotizacion.descripcion',
        'cotizacion.vigencia',
        'tabla_conceptos',
        'resumen_totales',
        'detalles_propuesta',
        'ejecutivo.nombre',
        'ejecutivo.correo'
    ]::text[])
WHERE slug = 'default';

COMMIT;
