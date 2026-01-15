from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence
from base64 import b64encode

from weasyprint import HTML as WeasyHTML

from app.core.logging import get_logger

logger = get_logger("app.services.propuesta_pdf")


@dataclass
class PropuestaDocument:
    filename: str
    content: bytes


COLUMN_HEADERS = [
    "Plan mensual 0%",
    "Plan trimestral 10%",
    "Plan semestral 15%",
    "Precio mínimo anual objetivo 20%",
]

RENTA_ROWS = [
    ("Opciones de pago", ["12 pagos de: $4,166.67", "4 pagos de: $11,764.71", "2 pagos de: $22,222.22", "Pago único de: $40,000.00"]),
    ("Pago anual total", ["$50,000.04", "$47,058.84", "$44,444.44", "Pago único de: $40,000.00"]),
]

CONFIGURACION_ROWS = [
    ("Opciones de pago", ["12 pagos de: $10,312.50", "4 pagos de: $29,117.65", "2 pagos de: $55,000.00", "Pago único de: $99,000.00"]),
    ("Pago anual total", ["$123,750.00", "$116,470.59", "$110,000.00", "Pago único de: $99,000.00"]),
]

CARD_BLOCKS = [
    ("Asistente multicanal", "Atiende prospectos y clientes en todos los canales", "WhatsApp, webchat y otros medios comparten contexto."),
    ("Marketing integrado", "Orquesta campañas proactivas", "Automatiza contenidos, notificaciones y flujos sin salir de Tal-IA."),
    ("CRM personalizado", "Centraliza contactos y oportunidades", "Mantiene historial y métricas para alimentar al asistente y al equipo comercial."),
    ("Prospección", "Generación de contactos y leads", "Búsquedas configuradas actualizan el CRM y al asistente."),
]


REPO_ROOT = Path(__file__).resolve().parents[3]
QR_IMAGE_PATH = REPO_ROOT / "QR_Lia.png"


def _load_qr_image_data_url() -> str:
    if not QR_IMAGE_PATH.exists():
        return ""
    encoded = b64encode(QR_IMAGE_PATH.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"




def _render_rows(rows: Sequence[tuple[str, Sequence[str]]]) -> str:
    row_html = []
    for label, cells in rows:
        cells_html = "".join(f'<td class="table-cell">{cell}</td>' for cell in cells)
        row_html.append(f'<tr><td class="table-label">{label}</td>{cells_html}</tr>')
    return "".join(row_html)


def _render_cards() -> str:
    result = []
    for caption, title, description in CARD_BLOCKS:
        result.append(
            f"""
          <article class="card">
            <p class="card-caption">{caption}</p>
            <p class="card-title">{title}</p>
            <p class="card-body">{description}</p>
          </article>
        """
        )
    return "".join(result)


def _build_html() -> str:
    header_columns = "".join(f"<th class='table-header'>{column}</th>" for column in COLUMN_HEADERS)
    renta_rows = _render_rows(RENTA_ROWS)
    config_rows = _render_rows(CONFIGURACION_ROWS)
    cards = _render_cards()
    qr_data_url = _load_qr_image_data_url()
    qr_html = (
        f'<div class="qr"><img src="{qr_data_url}" alt="QR Tal-IA" /></div>'
        if qr_data_url
        else ""
    )
    return f"""
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Propuesta sistema Tal-IA</title>
  <style>
    :root {{
      font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      background-color: #f8fafc;
    }}
    body {{
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
    }}
    .page {{
      padding: 32px;
    }}
    .header {{
      margin-bottom: 24px;
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
      margin-top: 16px;
      font-size: 14px;
      color: #475467;
      max-width: 720px;
      line-height: 1.6;
    }}
    .card-grid {{
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 12px;
      margin-top: 24px;
    }}
    .card {{
      border: 1px solid #cbd5f5;
      padding: 12px;
      border-radius: 12px;
      background: linear-gradient(135deg, #ecfdf5, #ffffff);
    }}
    .card-caption {{
      font-size: 9px;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: #047857;
      margin: 0;
    }}
    .card-title {{
      font-size: 12px;
      font-weight: 600;
      margin: 8px 0 4px;
    }}
    .card-body {{
      font-size: 10px;
      color: #475467;
      margin: 0;
    }}
    .section {{
      background: #ffffff;
      border-radius: 16px;
      padding: 24px;
      margin-top: 32px;
      border: 1px solid #e2e8f0;
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
    .table-wrapper {{
      overflow-x: auto;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
    }}
    .table-header {{
      text-align: left;
      padding: 10px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      border-bottom: 1px solid #e5e7eb;
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
      margin-top: 32px;
      font-size: 11px;
      color: #475467;
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
      <p class="subtitle">DESARROLLADORA EL PEÑON</p>
      <h1>Propuesta sistema Tal-IA *SaaS</h1>
      <p class="intro">
        El sistema Tal-IA se configura a la medida del flujo de ventas, marketing y operaciones de
        Gran Peñón. Todos los montos indicados son más IVA y pueden combinarse según el nivel de
        compromiso anual.
      </p>
      <p class="intro" style="margin-top:8px;">
        Tal-IA se entrega como SaaS (software como servicio), lo que permite acceder al sistema sin
        inversión en infraestructura física y recibir soporte y mejoras continuas desde la nube.
      </p>
    </div>
    <div class="card-grid">
      {cards}
    </div>
    <div class="section">
      <p class="section-title">Precio renta</p>
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
            {renta_rows}
          </tbody>
        </table>
      </div>
    </div>
    <div class="section">
      <p class="section-title">Configuración</p>
      <p class="section-desc">Costos de configuración, programación y puesta en marcha (más IVA)</p>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th class="table-header">Concepto</th>
              {header_columns}
            </tr>
          </thead>
          <tbody>
            {config_rows}
          </tbody>
        </table>
      </div>
      <p class="intro" style="margin-top:16px;">
        La configuración incluye workshops de discovery, ajuste de workflows y la parametrización
        de reglas de negocio para los tres módulos mencionados. El pago aquí refleja la inversión
        única necesaria para que el sistema esté plenamente operativo.
      </p>
    </div>
    <div class="section">
      <p class="section-title">MVP · Despliegue inicial</p>
      <ul>
        <li>Asistente multicanal: entrenamiento con esquemas de conversación y conexión a WhatsApp + webchat.</li>
        <li>Marketing multicanal: plantillas y automatizaciones para campañas activas y seguimiento automático.</li>
        <li>CRM personalizado: flujo de ventas, sincronización de contactos y seguimiento de oportunidades.</li>
        <li>* Contidad de Usuarios 50</li>
      </ul>
      <p class="intro" style="margin-top:12px;">
        Tiempos de entrega aproximados: 4 semanas desde que Gran Peñón entregue toda la
        información solicitada (flujos, contactos clave, contenidos y aprobaciones). Vigencia de
        propuesta: 20 días naturales.
      </p>
    </div>
    <div class="section footer">
      <p>Fecha: {datetime.now(timezone.utc):%d de %B de %Y}</p>
      <p>Jorge Torre · Sistema Tal-IA*</p>
      <div class="footer-content">
        <div class="contact">
          <p>Cel: 4441302811</p>
          <p>Email: administracion@geoactiv.mx</p>
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
</body>
</html>
"""


async def render_propuesta_pdf() -> PropuestaDocument:
    html = _build_html()
    try:
        pdf_bytes = await asyncio.to_thread(lambda: WeasyHTML(string=html).write_pdf())
        filename = f"propuesta-tal-ia-{datetime.now(timezone.utc):%Y%m%d}.pdf"
        return PropuestaDocument(filename=filename, content=pdf_bytes)
    except Exception as exc:
        logger.exception("propuesta_pdf_render_failed", exc_info=exc)
        raise
