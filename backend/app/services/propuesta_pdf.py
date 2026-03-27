from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape as html_escape
from pathlib import Path
from typing import Sequence, Mapping
from base64 import b64encode

from weasyprint import HTML as WeasyHTML

from app.core.logging import get_logger

logger = get_logger("app.services.propuesta_pdf")


@dataclass
class PropuestaDocument:
    filename: str
    content: bytes


COLUMN_HEADERS = [
    "Plan mensual · 12 pagos · - 0%",
    "Plan trimestral · 4 pagos · - 10%",
    "Plan semestral · 2 pagos · - 15%",
    "Plan anual · Pago único · - 20%",
]

RENTA_ROWS = [
    ("Pagos", ["$4,166.67", "$11,764.71", "$22,222.22", ""]),
    ("Costo anual total", ["$50,000.04", "$47,058.84", "$44,444.44", "$40,000.00"]),
]

CONFIGURACION_ROWS = [
    ("Pagos", ["$10,312.50", "$29,117.65", "$55,000.00", ""]),
    ("Costo anual total", ["$123,750.00", "$116,470.59", "$110,000.00", "$99,000.00"]),
]

CARD_BLOCKS = [
    ("1️⃣ 🏢 INVENTARIO INMOBILIARIO 3D INTERACTIVO", "Visualiza propiedades en plano digital 3D con estatus en tiempo real.", "Una experiencia que acelera decisiones y eleva la percepción del proyecto."),
    ("2️⃣ 🔁 MARKETING + REMARKETING INTELIGENTE", "Activa campañas automáticas que convierten sin depender del equipo.", "Segmenta, dispara y vuelve a impactar en el momento exacto."),
    ("3️⃣ 🎯 CALIFICACION + ASIGNACION AUTOMATICA", "Detecta intención real y asigna al asesor correcto con contexto completo.", "Menos ruido. Mas cierres."),
    ("4️⃣ 🤖 ASISTENTE IA MULTICANAL CON MEMORIA", "WhatsApp y webchat con contexto unificado y perfil 360°.", "Habla como tu mejor vendedor y recuerda cada interacción."),
    ("5️⃣ 🧠 CRM PERSONALIZADO", "Control total del embudo en un solo tablero.", "Historial, métricas y reglas de negocio centralizadas."),
    ("6️⃣ 🔄 SEGUIMIENTO + ALERTAS INTELIGENTES", "Activa mensajes, recordatorios y avisos en tiempo real.", "Detecta oportunidades antes que se enfríen."),
    ("7️⃣ 📅 AGENDA Y CITAS", "Coordina visitas y reuniones sin fricción.", "Confirmaciones y cambios centralizados."),
    ("8️⃣ 📈 ANALITICA COMERCIAL", "KPIs claros y reportes accionables en tiempo real.", "Decisiones basadas en datos, no en intuición."),
    ("9️⃣ 📍 GEO-PROSPECCION", "Genera prospectos por ubicación, giro y radio configurable.", "Expande tu alcance con inteligencia territorial."),
    ("🔟 🧾 CONTRATOS + PAPELERIA AUTOMATICA", "Solicita documentos y completa contratos con datos validados.", "Menos fricción legal. Más velocidad de firma."),
    ("1️⃣1️⃣ 🏆 EXPERIENCIA DE CLIENTE DIFERENCIADA", "Interacciones rápidas, personalizadas y profesionales.", "Tu proyecto destaca frente a la competencia."),
    ("1️⃣2️⃣ 💰 OPTIMIZACION DEL CICLO DE VENTA", "Reduce tiempos desde el primer contacto hasta la firma.", "Más velocidad significa mayor rotación de inventario."),
    ("1️⃣3️⃣ 🔗 INTEGRACIONES + ESCALABILIDAD SAAS", "Conecta tus herramientas actuales y crece sin infraestructura propia.", "La plataforma evoluciona contigo sin fricción técnica."),
    ("1️⃣4️⃣ 🛡️ SEGURIDAD + AUDITORIA", "Roles, permisos y bitácora completa de acciones por usuario.", "Control total y trazabilidad empresarial."),
    ("1️⃣5️⃣ ⚡ IMPLEMENTACION EN 4 SEMANAS", "Workshops, configuración y puesta en marcha estructurada.", "De idea a operando sin fricción."),
]
CARD_GROUP_TITLES = [
    "🔥 IMPACTO DIRECTO EN VENTAS",
    "🤖 MOTOR OPERATIVO",
    "📊 CONTROL Y EXPANSION",
    "🧾 FORMALIZACION Y EXPERIENCIA",
    "🏢 INFRAESTRUCTURA EMPRESARIAL",
]
DEFAULT_PROPOSAL_TITLE = "Propuesta sistema Tal-IA *SaaS"
DEFAULT_PROPOSAL_SUBTITLE = "DESARROLLADORA EL PEÑON"
DEFAULT_HERO_INTRO_ONE = (
    "El sistema Tal-IA se configura a la medida del flujo de ventas, marketing y operaciones "
    "de Gran Peñón. Todos los montos indicados son más IVA y pueden combinarse según el nivel "
    "de compromiso anual."
)
DEFAULT_HERO_INTRO_TWO = (
    "Tal-IA se entrega como SaaS (software como servicio), lo que permite acceder al sistema "
    "sin inversión en infraestructura física y recibir soporte y mejoras continuas desde la nube."
)
DEFAULT_MVP_TITLE = "MVP · Despliegue inicial"
DEFAULT_MVP_INTRO = "El MVP comprende las piezas mínimas para arrancar Tal-IA en Gran Peñón:"
DEFAULT_MVP_ITEMS = [
    "Asistente multicanal: entrenamiento con esquemas de conversación y conexión a WhatsApp + webchat.",
    "Marketing multicanal: plantillas y automatizaciones para campañas activas y seguimiento automático.",
    "CRM personalizado: flujo de ventas, sincronización de contactos y seguimiento de oportunidades.",
    "Contidad de Usuarios 50",
]
DEFAULT_MVP_TIMELINE = (
    "Tiempos de entrega aproximados: 4 semanas desde que Gran Peñón entregue toda la "
    "información solicitada (flujos, contactos clave, contenidos y aprobaciones)."
)
DEFAULT_MVP_VALIDITY = "Vigencia de propuesta: 20 días naturales."


REPO_ROOT = Path(__file__).resolve().parents[3]
QR_IMAGE_PATH = REPO_ROOT / "QR_Lia.png"


def _load_qr_image_data_url() -> str:
    if not QR_IMAGE_PATH.exists():
        return ""
    encoded = b64encode(QR_IMAGE_PATH.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _normalize_input_rows(
    rows_data: Sequence[Mapping[str, Sequence[str]]] | None,
    default_rows: Sequence[tuple[str, Sequence[str]]],
) -> list[tuple[str, list[str]]]:
    if not rows_data:
        return [(label, list(cells)) for label, cells in default_rows]
    normalized = []
    for row in rows_data:
        normalized.append((row["label"], list(row["cells"])))
    return normalized


def _render_rows(rows: Sequence[tuple[str, Sequence[str]]]) -> str:
    row_html = []
    for label, cells in rows:
        cells_html = "".join(f'<td class="table-cell">{html_escape(cell)}</td>' for cell in cells)
        row_html.append(f'<tr><td class="table-label">{html_escape(label)}</td>{cells_html}</tr>')
    return "".join(row_html)


def _render_cards() -> str:
    cards = []
    for caption, title, description in CARD_BLOCKS:
        cards.append((caption, title, description))
    return _render_grouped_cards(cards)


def _render_grouped_cards(cards: Sequence[tuple[str, str, str]]) -> str:
    result = []
    for start in range(0, len(cards), 3):
        group_index = start // 3
        group_title = (
            CARD_GROUP_TITLES[group_index]
            if group_index < len(CARD_GROUP_TITLES)
            else f"Bloque {group_index + 1}"
        )
        group_cards = cards[start : start + 3]
        cards_html = []
        for caption, title, description in group_cards:
            cards_html.append(
                f"""
              <article class="card">
                <p class="card-caption">{html_escape(caption)}</p>
                <p class="card-title">{html_escape(title)}</p>
                <p class="card-body">{html_escape(description)}</p>
              </article>
            """
            )
        result.append(
            f"""
          <section class="card-group">
            <p class="card-group-title">{html_escape(group_title)}</p>
            <div class="card-grid">
              {''.join(cards_html)}
            </div>
          </section>
        """
        )
    return "".join(result)


def _render_mvp_items(items: Sequence[str]) -> str:
    return "".join(f"<li>{html_escape(item)}</li>" for item in items)


def _render_header_cell(column: str) -> str:
    lines = [part.strip() for part in column.split(" · ") if part.strip()]
    if len(lines) > 1:
        lines_html = "".join(
            f"<span class='header-line {'header-title' if index == 0 else 'header-subtitle'}'>{html_escape(line)}</span>"
            for index, line in enumerate(lines)
        )
        return f"<th class='table-header'>{lines_html}</th>"
    return f"<th class='table-header'>{html_escape(column)}</th>"


def _format_spanish_date(value: datetime) -> str:
    months = [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ]
    return f"{value.day:02d} de {months[value.month - 1]} de {value.year}"


def _render_cards_from_payload(cards: Sequence[Mapping[str, str]] | None) -> str:
    if not cards:
        return _render_cards()

    normalized: list[tuple[str, str, str]] = []
    for card in cards:
        caption = str(card.get("caption", "")).strip()
        title = str(card.get("title", "")).strip()
        description = str(card.get("description", "")).strip()
        if not caption and not title and not description:
            continue
        normalized.append((caption, title, description))

    if not normalized:
        return _render_cards()

    result: list[tuple[str, str, str]] = []
    for caption, title, description in normalized:
        result.append((caption, title, description))
    return _render_grouped_cards(result)


def _build_html(
    proposal_title: str,
    proposal_subtitle: str,
    hero_intro_one: str,
    hero_intro_two: str,
    cards_html: str,
    mvp_title: str,
    mvp_intro: str,
    mvp_items: Sequence[str],
    mvp_timeline: str,
    mvp_validity: str,
    secondary_contact_name: str | None,
    secondary_contact_phone: str | None,
    secondary_contact_email: str | None,
    generated_date: str,
    column_headers: Sequence[str],
    renta_rows: Sequence[tuple[str, Sequence[str]]],
    configuracion_rows: Sequence[tuple[str, Sequence[str]]],
) -> str:
    header_columns = "".join(_render_header_cell(column) for column in column_headers)
    renta_rows_html = _render_rows(renta_rows)
    config_rows_html = _render_rows(configuracion_rows)
    mvp_items_html = _render_mvp_items(mvp_items)
    qr_data_url = _load_qr_image_data_url()
    qr_html = (
        f'<div class="qr"><img src="{qr_data_url}" alt="QR Tal-IA" /></div>'
        if qr_data_url
        else ""
    )
    secondary_contact_html = ""
    if secondary_contact_name or secondary_contact_phone or secondary_contact_email:
        parts = ['<div class="secondary-contact">']
        if secondary_contact_name:
            parts.append(
                f'<p class="secondary-contact-name">{html_escape(secondary_contact_name)}</p>'
            )
        if secondary_contact_phone:
            parts.append(f"<p>Cel: {html_escape(secondary_contact_phone)}</p>")
        if secondary_contact_email:
            parts.append(f"<p>Email: {html_escape(secondary_contact_email)}</p>")
        parts.append("</div>")
        secondary_contact_html = "".join(parts)
    return f"""
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Propuesta sistema Tal-IA</title>
  <style>
    @page {{
      size: A4;
      margin: 14mm;
    }}
    :root {{
      font-family: "Inter", "Helvetica Neue", Arial, "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif;
      color: #111827;
      background-color: #f8fafc;
    }}
    body {{
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
    }}
    .page {{
      padding: 0;
    }}
    .header {{
      margin-bottom: 16px;
    }}
    .header h1 {{
      margin: 0;
      font-size: 32px;
    }}
    .header .subtitle {{
      margin-top: 4px;
      font-size: 12px;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      font-weight: 600;
      color: #4b5563;
    }}
    .intro {{
      margin-top: 12px;
      font-size: 12px;
      color: #475467;
      max-width: 720px;
      line-height: 1.45;
    }}
    .card-group {{
      margin-top: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .card-group-title {{
      margin: 0 0 8px;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-weight: 700;
      color: #1f2937;
    }}
    .card-grid {{
      display: grid;
      grid-template-columns: repeat(3, minmax(120px, 1fr));
      gap: 10px;
      margin-top: 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .card {{
      border: 1px solid #cbd5f5;
      padding: 10px;
      border-radius: 10px;
      background: linear-gradient(135deg, #ecfdf5, #ffffff);
      min-height: 94px;
    }}
    .card-caption {{
      font-size: 8px;
      letter-spacing: 0.16em;
      color: #047857;
      margin: 0 0 6px;
      line-height: 1.75;
      display: block;
    }}
    .card-title {{
      font-size: 10px;
      font-weight: 600;
      margin: 7px 0 6px;
      line-height: 1.55;
    }}
    .card-body {{
      font-size: 9px;
      color: #475467;
      margin: 0;
      line-height: 1.35;
    }}
    .section {{
      background: #ffffff;
      border-radius: 16px;
      padding: 18px;
      margin-top: 16px;
      border: 1px solid #e2e8f0;
      break-inside: auto;
      page-break-inside: auto;
    }}
    .section-title {{
      font-size: 11px;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: #475467;
      margin: 0;
    }}
    .section-desc {{
      font-size: 11px;
      color: #475467;
      margin: 4px 0 16px;
    }}
    .section-title,
    .section-desc {{
      break-after: avoid;
      page-break-after: avoid;
    }}
    .section-block {{
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .table-wrapper {{
      overflow: visible;
      break-inside: auto;
      page-break-inside: auto;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
      break-inside: auto;
      page-break-inside: auto;
    }}
    thead {{
      display: table-header-group;
    }}
    tr, td, th {{
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .table-header {{
      text-align: left;
      padding: 10px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }}
    .table-header .header-title {{
      display: block;
    }}
    .table-header .header-line {{
      display: block;
    }}
    .table-header .header-subtitle {{
      display: block;
      margin-top: 2px;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: none;
      color: #6b7280;
    }}
    .table-label {{
      padding: 10px;
      font-weight: 600;
      background: #f8fafc;
      border-bottom: 1px solid #e5e7eb;
    }}
    .table-cell {{
      padding: 10px;
      border-bottom: 1px solid #e5e7eb;
    }}
    .footer {{
      margin-top: 16px;
      font-size: 11px;
      color: #475467;
    }}
    .page-break-before {{
      break-before: page;
      page-break-before: always;
    }}
    .economic-page .section {{
      padding: 14px;
      margin-top: 12px;
    }}
    .economic-page .economic-title {{
      margin: 0 0 8px;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-weight: 700;
      line-height: 1.2;
      color: #1f2937;
    }}
    .economic-page .section-title {{
      font-size: 10px;
      letter-spacing: 0.22em;
    }}
    .economic-page .section-desc {{
      font-size: 10px;
      margin: 3px 0 10px;
    }}
    .economic-page table {{
      font-size: 9px;
      margin-top: 4px;
    }}
    .economic-page .table-header {{
      padding: 7px;
      letter-spacing: 0.03em;
      text-transform: none;
    }}
    .economic-page .table-header .header-subtitle {{
      font-size: 8px;
      letter-spacing: 0.04em;
      margin-top: 1px;
    }}
    .economic-page .table-label,
    .economic-page .table-cell {{
      padding: 7px;
      letter-spacing: 0;
      word-spacing: 0;
      font-variant-numeric: tabular-nums;
    }}
    .economic-page .intro {{
      font-size: 10px;
      line-height: 1.3;
      margin-top: 10px;
    }}
    .mvp-final .section {{
      padding: 14px;
      margin-top: 12px;
    }}
    .mvp-final .mvp-title {{
      margin: 14px 0 8px;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-weight: 700;
      line-height: 1.2;
      color: #1f2937;
    }}
    .mvp-final .section-title {{
      font-size: 11px;
      letter-spacing: 0.2em;
    }}
    .mvp-final .section-desc {{
      font-size: 11px;
      margin: 4px 0 10px;
      line-height: 1.3;
    }}
    .mvp-final ul {{
      margin: 8px 0 8px 16px;
      padding-left: 12px;
    }}
    .mvp-final li {{
      font-size: 11px;
      line-height: 1.3;
      margin-bottom: 3px;
    }}
    .mvp-final .intro {{
      font-size: 11px;
      line-height: 1.32;
      margin-top: 10px;
    }}
    .mvp-final .footer {{
      margin-top: 10px;
      font-size: 10px;
    }}
    .mvp-final .footer-content {{
      gap: 16px;
      margin-top: 8px;
    }}
    .mvp-final .qr {{
      width: 84px;
    }}
    .footer-content {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 32px;
      margin-top: 12px;
    }}
    .footer .contact {{
      color: #475467;
    }}
    .footer .contact a {{
      color: #047857;
      text-decoration: none;
      word-break: break-all;
    }}
    .secondary-contact {{
      margin-top: 8px;
    }}
    .secondary-contact-name {{
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 2px;
    }}
    .qr {{
      width: 96px;
      flex-shrink: 0;
    }}
    .qr img {{
      width: 100%;
      display: block;
    }}
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <p class="subtitle">{html_escape(proposal_subtitle)}</p>
      <h1>{html_escape(proposal_title)}</h1>
      <p class="intro">
        {html_escape(hero_intro_one)}
      </p>
      <p class="intro" style="margin-top:8px;">
        {html_escape(hero_intro_two)}
      </p>
    </div>
    <div class="card-groups">
      {cards_html}
    </div>
    <div class="page-break-before economic-page">
      <p class="economic-title">🏢 PROPUESTA    ECONOMICA</p>
      <div class="section">
        <div class="section-block">
          <p class="section-title"><strong>Precio renta</strong></p>
          <p class="section-desc">Renta mensual por aplicación (más IVA)</p>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th class="table-header">Concepto</th>
                  {header_columns}
                </tr>
              </thead>
              <tbody>
                {renta_rows_html}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-block">
          <p class="section-title"><strong>Configuración</strong></p>
          <p class="section-desc">Costos de configuración, programación y puesta en marcha (más IVA) <strong>Pago único no recurrente.</strong></p>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th class="table-header">Concepto</th>
                  {header_columns}
                </tr>
              </thead>
              <tbody>
                {config_rows_html}
              </tbody>
            </table>
          </div>
        </div>
        <p class="intro" style="margin-top:16px;">
          La configuración incluye workshops de discovery, ajuste de workflows y la parametrización
          de reglas de negocio. El pago aquí refleja la inversión
          única necesaria para que el sistema esté plenamente operativo.
        </p>
      </div>
    </div>
    <div class="mvp-final">
      <p class="mvp-title">🚀 MVP · DESPLIEGUE  INICIAL</p>
      <div class="section">
        <p class="section-desc">{html_escape(mvp_intro)}</p>
        <ul>
          {mvp_items_html}
        </ul>
        <p class="intro" style="margin-top:12px;">
          {html_escape(mvp_timeline)}
        </p>
        <p class="section-desc" style="margin-top:4px;">
          {html_escape(mvp_validity)}
        </p>
      </div>
      <div class="section footer">
        <p>Fecha: {generated_date}</p>
        <p>Jorge Torre · Sistema Tal-IA*</p>
        <div class="footer-content">
          <div class="contact">
            <p>Cel: 4443354450</p>
            <p>Email: administracion@talia.mx</p>
            {secondary_contact_html}
            <p>Web: <a href="https://geoactiv.mx/">https://geoactiv.mx/</a></p>
            <p>Web: <a href="https://talia.mx/">https://talia.mx/</a></p>
          </div>
          {qr_html}
        </div>
        <p class="intro" style="margin-top:12px;">
          *SaaS (Software como servicio): plataforma en la nube con actualizaciones y soporte continuo.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
"""


async def render_propuesta_pdf(
    proposal_title: str | None = None,
    proposal_subtitle: str | None = None,
    hero_cards: Sequence[Mapping[str, str]] | None = None,
    hero_intro_one: str | None = None,
    hero_intro_two: str | None = None,
    mvp_title: str | None = None,
    mvp_intro: str | None = None,
    mvp_items: Sequence[str] | None = None,
    mvp_timeline: str | None = None,
    mvp_validity: str | None = None,
    secondary_contact_name: str | None = None,
    secondary_contact_phone: str | None = None,
    secondary_contact_email: str | None = None,
    column_headers: Sequence[str] | None = None,
    renta_rows: Sequence[Mapping[str, Sequence[str]]] | None = None,
    configuracion_rows: Sequence[Mapping[str, Sequence[str]]] | None = None,
) -> PropuestaDocument:
    title = proposal_title.strip() if proposal_title and proposal_title.strip() else DEFAULT_PROPOSAL_TITLE
    subtitle = (
        proposal_subtitle.strip()
        if proposal_subtitle and proposal_subtitle.strip()
        else DEFAULT_PROPOSAL_SUBTITLE
    )
    hero_intro_one_value = (
        hero_intro_one.strip() if hero_intro_one and hero_intro_one.strip() else DEFAULT_HERO_INTRO_ONE
    )
    hero_intro_two_value = (
        hero_intro_two.strip() if hero_intro_two and hero_intro_two.strip() else DEFAULT_HERO_INTRO_TWO
    )
    cards_html = _render_cards_from_payload(hero_cards)
    mvp_title_value = mvp_title.strip() if mvp_title and mvp_title.strip() else DEFAULT_MVP_TITLE
    mvp_intro_value = mvp_intro.strip() if mvp_intro and mvp_intro.strip() else DEFAULT_MVP_INTRO
    mvp_items_value = (
        [item.strip() for item in mvp_items if item and item.strip()]
        if mvp_items
        else list(DEFAULT_MVP_ITEMS)
    )
    if not mvp_items_value:
        mvp_items_value = list(DEFAULT_MVP_ITEMS)
    mvp_timeline_value = (
        mvp_timeline.strip() if mvp_timeline and mvp_timeline.strip() else DEFAULT_MVP_TIMELINE
    )
    mvp_validity_value = (
        mvp_validity.strip() if mvp_validity and mvp_validity.strip() else DEFAULT_MVP_VALIDITY
    )
    secondary_contact_name_value = (
        secondary_contact_name.strip()
        if secondary_contact_name and secondary_contact_name.strip()
        else None
    )
    secondary_contact_phone_value = (
        secondary_contact_phone.strip()
        if secondary_contact_phone and secondary_contact_phone.strip()
        else None
    )
    secondary_contact_email_value = (
        secondary_contact_email.strip()
        if secondary_contact_email and secondary_contact_email.strip()
        else None
    )
    headers = list(column_headers) if column_headers else list(COLUMN_HEADERS)
    renta_rows_normalized = _normalize_input_rows(renta_rows, RENTA_ROWS)
    configuracion_rows_normalized = _normalize_input_rows(configuracion_rows, CONFIGURACION_ROWS)
    generated_date = _format_spanish_date(datetime.now(timezone.utc))
    html = _build_html(
        title,
        subtitle,
        hero_intro_one_value,
        hero_intro_two_value,
        cards_html,
        mvp_title_value,
        mvp_intro_value,
        mvp_items_value,
        mvp_timeline_value,
        mvp_validity_value,
        secondary_contact_name_value,
        secondary_contact_phone_value,
        secondary_contact_email_value,
        generated_date,
        headers,
        renta_rows_normalized,
        configuracion_rows_normalized,
    )
    try:
        pdf_bytes = await asyncio.to_thread(lambda: WeasyHTML(string=html).write_pdf())
        filename = f"propuesta-tal-ia-{datetime.now(timezone.utc):%Y%m%d}.pdf"
        return PropuestaDocument(filename=filename, content=pdf_bytes)
    except Exception as exc:
        logger.exception("propuesta_pdf_render_failed", exc_info=exc)
        raise
