"""Utilidades para renderizar y enviar cotizaciones."""

from __future__ import annotations

import asyncio
import textwrap
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from html import escape as html_escape
from html.parser import HTMLParser
from typing import Any, Iterable

from weasyprint import HTML as WeasyHTML

from app.core.config import settings
from app.core.logging import get_logger
from app.services import quote_templates as quote_templates_service
from app.services import twilio as twilio_service

logger = get_logger("app.services.quotes")
RAW_HTML_TOKENS = {"tabla_conceptos", "resumen_totales", "detalles_propuesta"}
PDF_STYLE_OVERRIDES = textwrap.dedent(
    """
    @page {
        size: A4;
        margin: 12mm 10mm;
    }

    body {
        margin: 0;
        font-size: 9.5pt;
        line-height: 1.5;
    }

    .concept-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin-top: 12px;
    }

    .concept-table th,
    .concept-table td {
        border: 1px solid #d7e3f4;
        padding: 8px 10px;
        vertical-align: top;
        font-size: 8.8pt;
    }

    .concept-table th {
        background: #f8fafc;
        font-size: 7.8pt;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .concept-title {
        width: 28%;
        font-weight: 600;
    }

    .concept-unit {
        width: 12%;
        text-align: center;
        font-size: 8.8pt;
    }

    .concept-price {
        width: 18%;
        text-align: right;
        font-size: 8.8pt;
        white-space: nowrap;
    }

    .concept-qty {
        width: 12%;
        text-align: center;
        font-size: 8.8pt;
    }

    .concept-amount {
        width: 30%;
        text-align: right;
        white-space: nowrap;
        font-weight: 600;
    }

    .concept-table tfoot td {
        border-top: 2px solid #cfd8ea;
        font-weight: 600;
        font-size: 10pt;
    }

    .concept-table .totals-label {
        text-align: right;
        padding-right: 14px;
    }

    .proposal-details {
        margin-top: 16px;
        border: 1px solid #dbe3f3;
        border-radius: 12px;
        padding: 16px 18px;
        background: #f8fbff;
    }

    .proposal-detail {
        margin-bottom: 12px;
    }

    .proposal-detail:last-child {
        margin-bottom: 0;
    }

    .proposal-detail h3 {
        margin: 0 0 6px;
        font-size: 9pt;
    }

    .proposal-detail p {
        margin: 0;
        font-size: 8.8pt;
        color: #334155;
        line-height: 1.5;
    }
    """
).strip()


@dataclass
class QuoteRenderContext:
    """Información requerida para renderizar PDF y mensajes."""

    lead_label: str
    reference: str
    issuer_name: str
    issuer_email: str | None
    contact_name: str | None
    contact_company: str | None
    contact_email: str | None
    contact_phone: str | None
    conceptos: list[dict[str, Any]]
    subtotal: float | None
    impuestos: float | None
    total: float | None
    moneda: str
    valido_hasta: date | None
    descripcion: str | None = None
    notes: str | None = None
    items: list[dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    economic_details_html: str | None = None
    vendor_company_name: str | None = None
    vendor_razon_social: str | None = None
    vendor_assessor_name: str | None = None
    vendor_assessor_phone: str | None = None
    vendor_assessor_email: str | None = None
    logo_url: str | None = None
    organization_name: str | None = None
    organization_slogan: str | None = None
    organization_razon_social: str | None = None
    organization_rfc: str | None = None
    organization_street: str | None = None
    organization_exterior_number: str | None = None
    organization_interior_number: str | None = None
    organization_colonia: str | None = None
    organization_postal_code: str | None = None
    organization_state: str | None = None
    organization_city: str | None = None
    organization_country: str | None = None
    organization_website: str | None = None


@dataclass
class QuoteDocument:
    """Resultado de la generación del PDF."""

    filename: str
    content: bytes


class QuoteSendError(RuntimeError):
    """Errores relacionados con el envío por WhatsApp."""


async def render_quote_pdf(context: QuoteRenderContext) -> QuoteDocument:
    """Genera el PDF de cotización con el formato nuevo y un fallback legado."""

    try:
        return await _render_modern_pdf(context)
    except Exception as exc:  # pragma: no cover - defensivo
        logger.exception("quote_modern_render_failed", exc_info=exc)
        try:
            template = await quote_templates_service.fetch_active_template()
            return await _render_template_based_pdf(context, template)
        except quote_templates_service.QuoteTemplateError as template_exc:
            logger.warning("quote_template_unavailable: %s", template_exc)
        except Exception as template_exc:  # pragma: no cover - defensivo
            logger.exception("quote_template_render_failed", exc_info=template_exc)
    return _render_plaintext_pdf(context)


MODERN_QUOTE_PDF_STYLE = textwrap.dedent(
    """
    @page {
        size: A4;
        margin: 10mm 11mm 12mm;
    }

    * {
        box-sizing: border-box;
    }

    body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        background: #f3f6fb;
        font-size: 9.5pt;
        line-height: 1.45;
    }

    .sheet {
        background: #ffffff;
        border: 1px solid #dbe3f0;
        border-radius: 16px;
        padding: 18px;
    }

    .topbar {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 2px;
        border-bottom: 1px solid #dbe3f0;
        margin-bottom: 12px;
        align-items: flex-start;
    }

    .brand-stack {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 18px;
        flex: 1 1 auto;
        max-width: 100%;
    }

    .brand-left {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }

    .brand-head {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 14px;
        min-width: 0;
    }

    .brand-logo {
        width: 59px;
        height: 59px;
        object-fit: contain;
        border-radius: 14px;
        border: 1px solid #dbe3f0;
        background: #ffffff;
        padding: 8px;
    }

    .eyebrow {
        margin: 0;
        color: #64748b;
        font-size: 7.2pt;
        letter-spacing: 0.26em;
        text-transform: uppercase;
    }

    .title {
        margin: 0;
        font-size: 12.6pt;
        line-height: 1.08;
        font-weight: 700;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .subtitle {
        margin: 2px 0 0;
        color: #475569;
        font-size: 9pt;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .brand-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
        flex: 0 1 auto;
        min-width: 0;
        min-height: 66px;
        max-width: 460px;
    }

    .brand-lines {
        display: grid;
        gap: 2px;
        margin-top: 4px;
        color: #334155;
        font-size: 7.2pt;
        line-height: 1.18;
    }

    .brand-lines p {
        margin: 0;
    }

    .brand-lines strong {
        color: #0f172a;
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
        font-size: 7.2pt;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        line-height: 1.22;
    }

    .meta-value {
        display: block;
        margin-top: 0;
        color: #0f172a;
        font-size: 8.55pt;
        font-weight: 700;
        line-height: 1.22;
    }

    .info-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 10px;
    }

    .card {
        border: 1px solid #dbe3f0;
        border-radius: 14px;
        background: #f8fbff;
        padding: 10px;
    }

    .card h3 {
        margin: 0 0 6px;
        font-size: 8.1pt;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #64748b;
    }

    .card p {
        margin: 0 0 2px;
        color: #334155;
        line-height: 1.14;
        font-size: 7.74pt;
    }

    .card p strong {
        color: #0f172a;
        font-size: 7.74pt;
    }

    .card-secondary p:not(:first-of-type) {
        text-transform: lowercase;
    }

    .section {
        margin-top: 14px;
    }

    .section-head {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #dbe3f0;
        margin-bottom: 10px;
    }

    .section-head h2 {
        margin: 0;
        font-size: 12pt;
        font-weight: 700;
        color: #0f172a;
    }

    .section-head span {
        font-size: 8.5pt;
        color: #64748b;
    }

    .items-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }

    .items-table th,
    .items-table td {
        border-bottom: 1px solid #dbe3f0;
        padding: 8px 8px;
        vertical-align: top;
        font-size: 8.8pt;
    }

    .items-table thead th {
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 7.8pt;
        padding-top: 6px;
        padding-bottom: 6px;
        background: #f8fbff;
        border-top: 1px solid #dbe3f0;
    }

    .item-image-cell {
        width: 40px;
    }

    .item-image {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid #dbe3f0;
        background: #eef2f7;
        display: block;
    }

    .item-image-fallback {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        border: 1px dashed #cbd5e1;
        background: #f8fafc;
        color: #94a3b8;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 7pt;
        text-transform: uppercase;
        text-align: center;
        line-height: 1.1;
    }

    .item-concept {
        width: 34%;
    }

    .item-qty {
        width: 9%;
        text-align: center;
        white-space: nowrap;
    }

    .item-unit {
        width: 9%;
        text-align: center;
        white-space: nowrap;
    }

    .item-price,
    .item-discount,
    .item-total {
        width: 15%;
        text-align: right;
        white-space: nowrap;
    }

    .item-concept-title {
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 3px;
        font-size: 9pt;
    }

    .item-concept-desc {
        margin: 0;
        color: #475569;
        font-size: 8pt;
    }

    .empty-row {
        text-align: center;
        color: #64748b;
        padding: 16px 10px;
    }

    .bottom-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 280px;
        gap: 12px;
        margin-top: 14px;
    }

    .prose-box,
    .note-box,
    .summary-box {
        border: 1px solid #dbe3f0;
        border-radius: 14px;
        background: #f8fbff;
        padding: 12px;
    }

    .box-title {
        margin: 0 0 8px;
        font-size: 9pt;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #64748b;
    }

    .richtext,
    .richtext p,
    .richtext li,
    .richtext div,
    .richtext span {
        margin: 0;
        color: #334155;
        font-size: 8.8pt;
        line-height: 1.5;
    }

    .richtext p + p,
    .richtext div + div {
        margin-top: 6px;
    }

    .summary-box {
        background: #eef6ff;
        border-color: #cfe0ff;
    }

    .summary-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        font-size: 9pt;
    }

    .summary-row span {
        color: #475569;
    }

    .summary-row strong {
        color: #0f172a;
        font-size: 10pt;
    }

    .summary-total {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #cfe0ff;
        font-size: 12pt;
        font-weight: 700;
    }

    .footer {
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid #dbe3f0;
        color: #64748b;
        font-size: 8.5pt;
        display: flex;
        justify-content: space-between;
        gap: 12px;
    }
    """
).strip()


async def _render_modern_pdf(context: QuoteRenderContext) -> QuoteDocument:
    template_config: dict[str, Any] | None = None
    try:
        template = await quote_templates_service.fetch_active_template()
        template_config = template.config if isinstance(template.config, dict) else None
    except quote_templates_service.QuoteTemplateError as exc:
        logger.warning("quote_template_unavailable: %s", exc)
    except Exception as exc:  # pragma: no cover - defensivo
        logger.exception("quote_template_load_failed", exc_info=exc)

    html_doc = _build_modern_quote_html(context, template_config=template_config)
    base_url = _resolve_template_base_url()
    try:
        pdf_bytes = await asyncio.to_thread(
            lambda: WeasyHTML(string=html_doc, base_url=base_url).write_pdf()
        )
    except Exception as exc:
        logger.exception("quote_modern_weasyprint_render_failed", exc_info=exc)
        raise
    filename = f"cotizacion-{context.reference}-{context.created_at:%Y%m%d%H%M%S}.pdf"
    return QuoteDocument(filename=filename, content=pdf_bytes)


def _build_modern_quote_html(
    context: QuoteRenderContext,
    template_config: dict[str, Any] | None = None,
) -> str:
    folio = f"COT-{context.reference.upper()}"
    issued_at = context.created_at.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M")
    valid_until = context.valido_hasta.isoformat() if context.valido_hasta else "Sin vigencia"
    currency = _safe_text(context.moneda, "MXN")
    vendor_company = _safe_text(context.vendor_company_name or context.issuer_name, "Sin empresa")
    vendor_razon_social = _safe_text(
        context.vendor_razon_social or context.vendor_company_name or context.issuer_name,
        "Sin razón social",
    )
    organization_name = _safe_text(
        context.organization_name or context.vendor_company_name or context.issuer_name,
        "Sin organización",
    )
    organization_slogan = _safe_text(context.organization_slogan, "")
    organization_razon_social = _safe_text(
        context.organization_razon_social or context.vendor_razon_social or context.vendor_company_name,
        "Sin razón social",
    )
    organization_rfc = _safe_text(context.organization_rfc, "—")
    organization_street = _safe_text(context.organization_street, "Sin calle")
    organization_exterior_number = _safe_text(context.organization_exterior_number, "S/N")
    organization_interior_number = _safe_text(context.organization_interior_number, "S/N")
    organization_colonia = _safe_text(context.organization_colonia, "Sin colonia")
    organization_postal_code = _safe_text(context.organization_postal_code, "—")
    organization_state = _safe_text(context.organization_state, "Sin estado")
    organization_city = _safe_text(context.organization_city, "Sin ciudad")
    organization_country = _safe_text(context.organization_country, "Sin país")
    organization_website = _safe_text(context.organization_website, "Sin sitio web")
    vendor_name = _safe_text(context.vendor_assessor_name or context.issuer_name, "Sin asesor")
    vendor_phone = _safe_text(context.vendor_assessor_phone, "Sin teléfono")
    vendor_email = _safe_text(context.vendor_assessor_email, "Sin correo")
    client_name = _safe_text(context.contact_name, "Sin cliente")
    client_company = _safe_text(context.contact_company, "Sin razón social")
    client_email = _safe_text(context.contact_email, "Sin email")
    client_phone = _safe_text(context.contact_phone, "Sin teléfono")
    project_name = _safe_text(context.lead_label, "Sin proyecto")
    project_description = _safe_text(context.descripcion, "")
    logo_url = _safe_text(context.logo_url, "")
    logo_html = (
        f'<div><img class="brand-logo" src="{html_escape(logo_url, quote=True)}" alt="Logo de la empresa" /></div>'
        if logo_url
        else ""
    )
    organization_details_html = "".join(
        [
            '<div class="brand-lines">',
            (
                "<p><strong>"
                f"{html_escape(organization_razon_social)}"
                "</strong> · RFC "
                f"{html_escape(organization_rfc)}"
                "</p>"
            ),
            (
                "<p>"
                f"{html_escape(organization_street)}, # {html_escape(organization_exterior_number)}"
                + (
                    f" {html_escape(organization_interior_number)}"
                    if organization_interior_number != "S/N"
                    else ""
                )
                + f", Colonia: {html_escape(organization_colonia)}"
                + "</p>"
            ),
            (
                "<p>"
                f"CP {html_escape(organization_postal_code)}, "
                f"{html_escape(organization_state)}, {html_escape(organization_city)}, {html_escape(organization_country)}"
                "</p>"
            ),
            f"<p>{html_escape(organization_website)}</p>",
            "</div>",
        ]
    )
    notes_html = _build_quote_rich_text_block(context.notes, "Sin notas para el cliente.")
    conditions_html = _build_quote_conditions_html(template_config, context.economic_details_html)
    items_html = _build_modern_quote_items_html(context)
    subtotal = _format_currency(context.subtotal, context.moneda, include_currency_code=False)
    taxes = _format_currency(context.impuestos, context.moneda, include_currency_code=False)
    total = _format_currency(_resolve_total(context), context.moneda, include_currency_code=False)

    return f"""
    <html>
      <head>
        <meta charset="utf-8" />
        <style>{MODERN_QUOTE_PDF_STYLE}</style>
      </head>
      <body>
        <div class="sheet">
          <div class="topbar">
            <div class="brand-stack">
              <div class="brand-left">
                <div class="brand-head">
                  {logo_html}
                  <div class="brand-copy">
                    <h1 class="title">{html_escape(organization_name)}</h1>
                    <p class="subtitle">{html_escape(organization_slogan)}</p>
                  </div>
                </div>
                {organization_details_html}
              </div>
            </div>
            <div class="top-meta">
              <div class="meta-block">
                <span class="meta-label">Folio</span>
                <span class="meta-value">{html_escape(folio)}</span>
              </div>
              <div class="meta-block">
                <span class="meta-label">Emitida</span>
                <span class="meta-value">{html_escape(issued_at)}</span>
              </div>
              <div class="meta-block">
                <span class="meta-label">Vigencia</span>
                <span class="meta-value">{html_escape(valid_until)}</span>
              </div>
              <div class="meta-block">
                <span class="meta-label">Moneda</span>
                <span class="meta-value">{html_escape(currency)}</span>
              </div>
            </div>
          </div>

          <div class="info-grid">
            <div class="card card-secondary">
              <h3>Cliente</h3>
              <p><strong>{html_escape(client_company)}</strong></p>
              <p>{html_escape(client_name)}</p>
              <p>{html_escape(client_email)}</p>
              <p>{html_escape(client_phone)}</p>
            </div>
            <div class="card">
              <h3>Proyecto</h3>
              <p><strong>{html_escape(project_name)}</strong></p>
              <p><strong>{html_escape(project_description or "Sin necesidades")}</strong></p>
            </div>
            <div class="card card-secondary">
              <h3>Vendedor</h3>
              <p><strong>{html_escape(vendor_company)}</strong></p>
              <p>{html_escape(vendor_name)}</p>
              <p>{html_escape(vendor_phone)}</p>
              <p>{html_escape(vendor_email)}</p>
            </div>
          </div>

          <div class="section">
            <table class="items-table">
              <thead>
                <tr>
                  <th class="item-image-cell">Img.</th>
                  <th class="item-concept">Concepto</th>
                  <th class="item-qty">Cant.</th>
                  <th class="item-unit">Unidad</th>
                  <th class="item-price">Precio</th>
                  <th class="item-discount">Desc.</th>
                  <th class="item-total">Total</th>
                </tr>
              </thead>
              <tbody>{items_html}</tbody>
            </table>
          </div>

          <div class="bottom-grid">
            <div class="section" style="margin-top:0;">
              <div class="prose-box">
                <p class="box-title">Condiciones comerciales</p>
                <div class="richtext">{conditions_html}</div>
              </div>
              <div class="note-box" style="margin-top:12px;">
                <p class="box-title">Notas y anexos</p>
                <div class="richtext">{notes_html}</div>
                <div class="richtext" style="margin-top:10px;color:#64748b;">
                  Anexos: no hay archivos cargados todavía.
                </div>
              </div>
            </div>

            <div class="summary-box">
              <p class="box-title">Resumen financiero</p>
              <div class="summary-row"><span>Subtotal</span><strong>{html_escape(subtotal)}</strong></div>
              <div class="summary-row"><span>IVA</span><strong>{html_escape(taxes)}</strong></div>
              <div class="summary-row summary-total"><span>Total</span><strong>{html_escape(total)}</strong></div>
            </div>
          </div>

          <div class="footer">
            <span>Documento generado por <a href="https://talia.mx">talia.mx</a>.</span>
            <span>{html_escape(folio)}</span>
          </div>
        </div>
      </body>
    </html>
    """


def _build_quote_conditions_html(
    template_config: dict[str, Any] | None,
    fallback_html: str | None,
) -> str:
    if isinstance(template_config, dict):
        notes_title = _safe_text(template_config.get("notesTitle"), "Notas")
        notes_body = _safe_text(template_config.get("notesBody"), "")
        terms_title = _safe_text(template_config.get("termsTitle"), "Términos")
        terms_body = _safe_text(template_config.get("termsBody"), "")
        pieces = [
            '<div class="proposal-details">',
            f'<div class="proposal-detail"><h3>{html_escape(notes_title)}</h3><p>{html_escape(notes_body)}</p></div>',
            f'<div class="proposal-detail"><h3>{html_escape(terms_title)}</h3><p>{html_escape(terms_body)}</p></div>',
            "</div>",
        ]
        return "".join(pieces)
    return _build_quote_rich_text_block(
        fallback_html,
        "Sin condiciones comerciales adicionales.",
    )


def _build_modern_quote_items_html(context: QuoteRenderContext) -> str:
    concepts = context.conceptos or []
    items = context.items or []
    if not concepts and not items:
        return '<tr><td class="empty-row" colspan="7">Todavía no hay partidas para previsualizar.</td></tr>'

    rows: list[str] = []
    max_items = max(len(concepts), len(items))
    for idx in range(max_items):
        concept = concepts[idx] if idx < len(concepts) and isinstance(concepts[idx], dict) else {}
        related = items[idx] if idx < len(items) and isinstance(items[idx], dict) else {}
        title = html_escape(_concept_title_for_display(concept, idx + 1))
        desc_value = (
            _record_value(concept, "descripcion")
            or _record_value(concept, "detalle")
            or _record_value(related, "descripcion")
            or _record_value(related, "detalle")
            or related.get("descripcion")
            or concept.get("descripcion")
        )
        desc = _normalize_detail_text(desc_value)
        quantity_value = _record_value(concept, "cantidad") or _record_value(related, "cantidad")
        quantity = html_escape(_format_quantity(quantity_value))
        unit_source = (
            _record_value(concept, "unidad")
            or _record_value(related, "unidad")
            or related.get("unidad")
            or concept.get("unidad")
        )
        unit = html_escape(_format_unit(unit_source))
        amount_value = _concept_total(concept)
        if amount_value is None:
            amount_value = _item_total(related)
        price_value = _resolve_unit_price(concept, related, amount_value, _coerce_float(quantity_value))
        price = html_escape(_format_currency(price_value, context.moneda, include_currency_code=False))
        discount_value = _record_value(concept, "descuento") or _record_value(related, "descuento")
        discount = html_escape(_format_discount(discount_value, context.moneda))
        total_value = amount_value
        if total_value is None:
            total_value = _item_total(related)
        total = html_escape(_format_currency(total_value, context.moneda, include_currency_code=False))
        image_url = _item_image_url(related)
        image_html = (
            f'<img class="item-image" src="{html_escape(image_url, quote=True)}" alt="Producto" />'
            if image_url
            else '<div class="item-image-fallback">Sin img</div>'
        )
        rows.append(
            "<tr>"
            f'<td class="item-image-cell">{image_html}</td>'
            f'<td class="item-concept"><p class="item-concept-title">{title}</p><p class="item-concept-desc">{desc}</p></td>'
            f'<td class="item-qty">{quantity}</td>'
            f'<td class="item-unit">{unit}</td>'
            f'<td class="item-price">{price}</td>'
            f'<td class="item-discount">{discount}</td>'
            f'<td class="item-total">{total}</td>'
            "</tr>"
        )
    return "".join(rows)


def _build_quote_rich_text_block(value: str | None, fallback: str) -> str:
    sanitized = _sanitize_html_fragment(value)
    if sanitized:
        return sanitized
    return f"<p>{html_escape(fallback)}</p>"


def _item_image_url(record: Any) -> str | None:
    if not isinstance(record, dict):
        return None
    for key in ("fotoUrl", "foto_url", "image_url", "image"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    metadata = record.get("metadatos") or record.get("metadata")
    if isinstance(metadata, dict):
        for key in ("fotoUrl", "foto_url", "image_url", "url"):
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        media = metadata.get("media")
        if isinstance(media, list):
            for media_item in media:
                if not isinstance(media_item, dict):
                    continue
                media_url = media_item.get("url")
                if isinstance(media_url, str) and media_url.strip():
                    return media_url.strip()
    return None


def _format_discount(value: Any, currency: str | None) -> str:
    amount = _coerce_float(value)
    if amount is None:
        return "—"
    if amount <= 0:
        return "0"
    if amount < 1:
        return f"{amount * 100:.0f}%"
    return _format_currency(amount, currency)


async def _render_template_based_pdf(
    context: QuoteRenderContext, template: quote_templates_service.QuoteTemplate
) -> QuoteDocument:
    """Construye el PDF usando la información declarativa almacenada en Supabase."""

    replacements = _build_replacements(context)
    filled_html = _replace_tokens(template.html, replacements)
    final_html = _inject_styles(filled_html, template.css)
    base_url = _resolve_template_base_url()

    try:
        pdf_bytes = await asyncio.to_thread(
            lambda: WeasyHTML(string=final_html, base_url=base_url).write_pdf()
        )
    except Exception as exc:
        logger.exception("weasyprint_render_failed", exc_info=exc)
        return _render_plaintext_pdf(context)

    filename = f"cotizacion-{context.reference}-{context.created_at:%Y%m%d%H%M%S}.pdf"
    return QuoteDocument(filename=filename, content=pdf_bytes)


def _render_plaintext_pdf(context: QuoteRenderContext) -> QuoteDocument:
    """Fallback original basado en texto plano."""

    lines: list[str] = []
    divider = "=" * 80
    sub_divider = "-" * 80

    lines.append("Tal-IA · Geoactiv")
    lines.append("Documento de cotización")
    lines.append(divider)

    lines.append(
        f"Organización: {_safe_text(context.organization_name or context.vendor_company_name, '—')}"
    )
    lines.append(f"Eslogan: {_safe_text(context.organization_slogan, '—')}")
    lines.append(
        "Razón social / RFC: "
        f"{_safe_text(context.organization_razon_social or context.vendor_razon_social or context.vendor_company_name, '—')} · "
        f"{_safe_text(context.organization_rfc, '—')}"
    )
    lines.append(
        "Dirección fiscal: "
        f"{_safe_text(context.organization_street, '—')} "
        f"{_safe_text(context.organization_exterior_number, '')}"
        f"{', ' + _safe_text(context.organization_interior_number, '') if context.organization_interior_number else ''}"
    )
    lines.append(
        "Ubicación: "
        f"{_safe_text(context.organization_colonia, '—')} · CP {_safe_text(context.organization_postal_code, '—')} · "
        f"{_safe_text(context.organization_state, '—')} · {_safe_text(context.organization_city, '—')} · {_safe_text(context.organization_country, '—')}"
    )
    lines.append(f"Sitio web: {_safe_text(context.organization_website, '—')}")
    lines.append(f"Lead / Proyecto: {context.lead_label}")
    lines.append(
        f"Fecha de emisión: {context.created_at.astimezone(timezone.utc).strftime('%Y-%m-%d')}"
    )
    lines.append("")

    lines.append("Datos del contacto")
    lines.append(sub_divider)
    lines.append(f"Nombre: {context.contact_name or '—'}")
    lines.append(f"Empresa: {context.contact_company or '—'}")
    lines.append(f"Correo: {context.contact_email or '—'}")
    lines.append(f"Teléfono: {context.contact_phone or '—'}")
    lines.append("")

    if context.descripcion:
        lines.append("Proyecto")
        lines.append(sub_divider)
        lines.extend(_wrap_text(context.descripcion))
        lines.append("")

    lines.append("Vendedor")
    lines.append(sub_divider)
    lines.append(f"Empresa: {context.vendor_company_name or context.issuer_name or '—'}")
    lines.append(f"Razón Social: {context.vendor_razon_social or context.vendor_company_name or '—'}")
    lines.append(f"Asesor: {context.vendor_assessor_name or context.issuer_name or '—'}")
    lines.append(f"Teléfono, Asesor: {context.vendor_assessor_phone or '—'}")
    lines.append("")

    if context.notes:
        lines.append("Notas")
        lines.append(sub_divider)
        lines.extend(_wrap_text(context.notes))
        lines.append("")

    lines.append("Detalle de conceptos")
    lines.append(sub_divider)
    concept_rows = context.conceptos or []
    if not concept_rows:
        lines.append("· Pendiente de definir.")
    else:
        for idx, concept in enumerate(concept_rows, start=1):
            title = _clean_concept_title(concept, idx)
            lines.append(f"{idx}. {title}")
            desc = (
                concept.get("descripcion") or concept.get("description") or concept.get("detalle")
            )
            if desc:
                lines.extend([f"   {part}" for part in _wrap_text(str(desc))])
            monto = _concept_total(concept)
            if monto is not None:
                lines.append(f"   Total: {_format_currency(monto, context.moneda)}")
            lines.append("")

    lines.append("Emitido por")
    lines.append(sub_divider)
    lines.append(f"Ejecutivo: {context.issuer_name}")
    if context.issuer_email:
        lines.append(f"Correo de contacto: {context.issuer_email}")
    lines.append("")
    lines.append(divider)
    lines.append(
        "Tal-IA automatiza ventas y soporte omnicanal. Esta cotización es referencial "
        "y puede ajustarse según necesidades específicas."
    )

    pdf_bytes = _build_pdf_from_lines(lines)
    filename = f"cotizacion-{context.reference}-{context.created_at:%Y%m%d%H%M%S}.pdf"
    return QuoteDocument(filename=filename, content=pdf_bytes)


def _build_concepts_block(context: QuoteRenderContext) -> list[str]:
    concept_rows = context.conceptos or []
    if not concept_rows:
        return ["· Pendiente de definir."]

    lines: list[str] = []
    for idx, concept in enumerate(concept_rows, start=1):
        title = _clean_concept_title(concept, idx)
        lines.append(f"{idx}. {title}")
        desc = concept.get("descripcion") or concept.get("description") or concept.get("detalle")
        if desc:
            lines.extend([f"   {part}" for part in _wrap_text(str(desc))])
        monto = _concept_total(concept)
        if monto is not None:
            lines.append(f"   Importe: {_format_currency(monto, context.moneda)}")
        lines.append("")
    return lines


def _build_totals_block(context: QuoteRenderContext) -> list[str]:
    lines = [
        f"Subtotal: {_format_currency(context.subtotal, context.moneda, include_currency_code=False)}",
        f"Impuestos: {_format_currency(context.impuestos, context.moneda, include_currency_code=False)}",
        f"Total estimado: {_format_currency(_resolve_total(context), context.moneda, include_currency_code=False)}",
    ]
    return lines


def _build_replacements(context: QuoteRenderContext) -> dict[str, str]:
    tabla_html = _build_concepts_html(context)
    user_details = _sanitize_html_fragment(context.economic_details_html)
    if user_details:
        detalles_html = f'<div class="proposal-details">{user_details}</div>'
    else:
        detalles_html = _build_default_proposal_details(context)
    resumen_html = _build_totals_html(context)
    vigencia = context.valido_hasta.isoformat() if context.valido_hasta else "-"

    values = {
        "cliente.nombre": _safe_text(context.contact_name),
        "cliente.empresa": _safe_text(context.contact_company),
        "cliente.correo": _safe_text(context.contact_email),
        "cliente.telefono": _safe_text(context.contact_phone),
        "lead.nombre": _safe_text(context.lead_label, "Proyecto"),
        "organizacion.nombre": _safe_text(
            context.organization_name or context.vendor_company_name,
            "Organización",
        ),
        "organizacion.eslogan_empresa": _safe_text(context.organization_slogan, ""),
        "organizacion.razon_social": _safe_text(
            context.organization_razon_social or context.vendor_razon_social or context.vendor_company_name,
            "Razón social",
        ),
        "organizacion.rfc": _safe_text(context.organization_rfc, "—"),
        "organizacion.direccion_fiscal_calle": _safe_text(context.organization_street, ""),
        "organizacion.direccion_fiscal_numero_exterior": _safe_text(
            context.organization_exterior_number, ""
        ),
        "organizacion.direccion_fiscal_numero_interior": _safe_text(
            context.organization_interior_number, ""
        ),
        "organizacion.direccion_fiscal_colonia": _safe_text(context.organization_colonia, ""),
        "organizacion.codigo_postal": _safe_text(context.organization_postal_code, "—"),
        "organizacion.estado": _safe_text(context.organization_state, ""),
        "organizacion.ciudad": _safe_text(context.organization_city, ""),
        "organizacion.pais": _safe_text(context.organization_country, ""),
        "organizacion.sitio_web": _safe_text(context.organization_website, ""),
        "cotizacion.referencia": context.reference,
        "cotizacion.fecha": context.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d"),
        "cotizacion.descripcion": _safe_text(context.descripcion, ""),
        "cotizacion.vigencia": vigencia,
        "tabla_conceptos": tabla_html,
        "detalles_propuesta": detalles_html,
        "resumen_totales": resumen_html,
        "ejecutivo.nombre": context.issuer_name,
        "ejecutivo.correo": context.issuer_email or "",
        "empresa.nombre": "Tal-IA",
    }
    return values


def _replace_tokens(text: str, replacements: dict[str, str]) -> str:
    if not text:
        return ""
    result = text
    for key, value in replacements.items():
        replacement = value if key in RAW_HTML_TOKENS else html_escape(value)
        result = result.replace(f"{{{{{key}}}}}", replacement)
    return result


def _safe_text(value: str | None, fallback: str = "—") -> str:
    if value is None:
        return fallback
    trimmed = value.strip()
    return trimmed if trimmed else fallback


def _build_concepts_html(context: QuoteRenderContext) -> str:
    """Renderiza la tabla de conceptos incluyendo precio unitario."""

    concepts = context.conceptos or []
    rows: list[str] = []
    items = context.items or []
    if not concepts:
        rows.append('<tr><td class="concept-title" colspan="5">Pendiente de definir.</td></tr>')
    else:
        for idx, concept in enumerate(concepts, start=1):
            related = items[idx - 1] if idx - 1 < len(items) else {}
            title = html_escape(_concept_title_for_display(concept, idx))
            unit_source = (
                _record_value(concept, "unidad")
                or _record_value(related, "unidad")
                or related.get("unidad")
                or concept.get("unidad")
            )
            qty_source = (
                _record_value(concept, "cantidad")
                or _record_value(related, "cantidad")
                or related.get("cantidad")
                or concept.get("cantidad")
            )
            amount_value = _concept_total(concept)
            if amount_value is None:
                amount_value = _item_total(related)

            quantity_value = _coerce_float(qty_source)
            price_value = _resolve_unit_price(concept, related, amount_value, quantity_value)
            if amount_value is None and price_value is not None and quantity_value is not None:
                amount_value = price_value * quantity_value

            unit = html_escape(_format_unit(unit_source))
            price = html_escape(_format_currency(price_value, context.moneda, include_currency_code=False))
            qty = html_escape(_format_quantity(qty_source))
            amount = html_escape(_format_currency(amount_value, context.moneda, include_currency_code=False))
            rows.append(
                "<tr>"
                f'<td class="concept-title">{title}</td>'
                f'<td class="concept-unit">{unit}</td>'
                f'<td class="concept-price">{price}</td>'
                f'<td class="concept-qty">{qty}</td>'
                f'<td class="concept-amount">{amount}</td>'
                "</tr>"
            )

    totals = [
        ("Subtotal", _format_currency(context.subtotal, context.moneda, include_currency_code=False)),
        ("IVA", _format_currency(context.impuestos, context.moneda, include_currency_code=False)),
        ("Total", _format_currency(_resolve_total(context), context.moneda, include_currency_code=False)),
    ]
    totals_rows = [
        "<tr>"
        f'<td colspan="4" class="totals-label">{html_escape(label)}</td>'
        f'<td class="concept-amount">{html_escape(value)}</td>'
        "</tr>"
        for label, value in totals
    ]
    tfoot_html = f"<tfoot>{''.join(totals_rows)}</tfoot>"

    table = (
        '<table class="concept-table">'
        "<thead><tr><th>Concepto</th><th>Unidad</th><th>Precio unitario</th><th>Cantidad</th><th>Importe</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        f"{tfoot_html}"
        "</table>"
    )
    return table


def _build_default_proposal_details(context: QuoteRenderContext) -> str:
    concepts = context.conceptos or []
    if not concepts:
        return '<div class="proposal-details"><p>Sin detalles adicionales.</p></div>'
    blocks: list[str] = []
    items = context.items or []
    for idx, concept in enumerate(concepts, start=1):
        related = items[idx - 1] if idx - 1 < len(items) else {}
        title = html_escape(_concept_title_for_display(concept, idx))
        desc_value = (
            _record_value(concept, "descripcion")
            or _record_value(concept, "detalle")
            or _record_value(related, "descripcion")
            or _record_value(related, "detalle")
            or related.get("descripcion")
            or concept.get("descripcion")
        )
        desc = _normalize_detail_text(desc_value)
        blocks.append('<div class="proposal-detail">' f"<h3>{title}</h3>" f"<p>{desc}</p>" "</div>")
    return f"<div class=\"proposal-details\">{''.join(blocks)}</div>"


def _format_unit(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or "—"
    return str(value)


def _format_quantity(value: Any) -> str:
    number = _coerce_float(value)
    if number is None:
        return "—"
    formatted = f"{number:.2f}"
    formatted = formatted.rstrip("0").rstrip(".")
    return formatted or "0"


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def _normalize_detail_text(value: Any) -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned:
            return html_escape(cleaned).replace("\n", "<br />")
    return "Sin descripción adicional."


def _item_total(record: Any) -> float | None:
    if not isinstance(record, dict):
        return None
    for key in ("total", "subtotal", "importe", "monto"):
        value = record.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    cantidad = _coerce_float(record.get("cantidad"))
    precio = _coerce_float(record.get("precio_unitario"))
    if cantidad is not None and precio is not None:
        descuento = _coerce_float(record.get("descuento")) or 0.0
        return max(cantidad * precio - descuento, 0.0)
    return None


def _resolve_unit_price(
    concept: dict[str, Any],
    related: dict[str, Any],
    amount: float | None,
    quantity: float | None,
) -> float | None:
    """Obtiene el precio unitario declarado o lo calcula a partir del total y la cantidad."""

    price_keys = (
        "precio_unitario",
        "precioUnitario",
        "unitPrice",
        "unit_price",
        "precio unitario",
    )
    for record in (concept, related):
        for key in price_keys:
            price_value = _record_value(record, key)
            price = _coerce_float(price_value)
            if price is not None:
                return price
    if amount is not None and quantity:
        if quantity > 0:
            return amount / quantity
    return None


def _record_value(record: Any, key: str) -> Any:
    if not isinstance(record, dict):
        return None
    if key in record:
        value = record.get(key)
        if value is not None:
            return value
    metadata = record.get("metadata") or record.get("metadatos")
    if isinstance(metadata, dict):
        return metadata.get(key)
    return None


_ALLOWED_RICH_TEXT_TAGS = {
    "p",
    "br",
    "div",
    "span",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "a",
    "blockquote",
    "h3",
    "h4",
    "h5",
    "hr",
}
_SELF_CLOSING_TAGS = {"br", "hr"}
_ALLOWED_RICH_TEXT_ATTRS = {"a": {"href", "title"}}


def _sanitize_html_fragment(value: str | None) -> str | None:
    if not value:
        return None
    parser = _QuoteHTMLSanitizer()
    parser.feed(value)
    parser.close()
    sanitized = parser.get_html().strip()
    return sanitized or None


class _QuoteHTMLSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag not in _ALLOWED_RICH_TEXT_TAGS:
            return
        attr_text = ""
        allowed_attrs = _ALLOWED_RICH_TEXT_ATTRS.get(tag, set())
        for attr, raw_value in attrs:
            if attr in allowed_attrs and raw_value is not None:
                if attr == "href" and not _is_safe_href(raw_value):
                    continue
                attr_text += f' {attr}="{html_escape(raw_value, quote=True)}"'
        if tag in _SELF_CLOSING_TAGS:
            self._parts.append(f"<{tag}{attr_text} />")
        else:
            self._parts.append(f"<{tag}{attr_text}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in _ALLOWED_RICH_TEXT_TAGS and tag not in _SELF_CLOSING_TAGS:
            self._parts.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if data:
            escaped = html_escape(data).replace("\n", "<br />")
            self._parts.append(escaped)

    def handle_entityref(self, name: str) -> None:
        self._parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self._parts.append(f"&#{name};")

    def get_html(self) -> str:
        return "".join(self._parts)


def _is_safe_href(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered:
        return False
    return lowered.startswith(("http://", "https://", "mailto:", "tel:", "#")) or value.startswith(
        "/"
    )


def _build_totals_html(context: QuoteRenderContext) -> str:
    subtotal = _format_currency(context.subtotal, context.moneda, include_currency_code=False)
    impuestos = _format_currency(context.impuestos, context.moneda, include_currency_code=False)
    total = _format_currency(_resolve_total(context), context.moneda, include_currency_code=False)
    blocks = [
        ("Subtotal", subtotal),
        ("Impuestos", impuestos),
        ("Total estimado", total),
    ]
    items = [
        f'<div class="totals-item"><span>{html_escape(label)}</span><strong>{html_escape(value)}</strong></div>'
        for label, value in blocks
    ]
    return f"<div class=\"totals-grid\">{''.join(items)}</div>"


def _inject_styles(html_doc: str, css: str) -> str:
    style_blocks = [css.strip(), PDF_STYLE_OVERRIDES]
    combined_css = "\n\n".join(block for block in style_blocks if block)
    combined_cm = combined_css.strip()
    if not combined_cm:
        return html_doc
    style_tag = f"<style>{combined_cm}</style>"
    if "</head>" in html_doc:
        return html_doc.replace("</head>", f"{style_tag}</head>", 1)
    if "<head>" in html_doc:
        return html_doc.replace("<head>", f"<head>{style_tag}", 1)
    return f"{style_tag}{html_doc}"


def _resolve_template_base_url() -> str | None:
    candidates = [
        getattr(settings, "cliente_portal_base_url", None),
        settings.supabase_url,
    ]
    for candidate in candidates:
        if candidate:
            return candidate.rstrip("/")
    return None


def compose_email_subject(context: QuoteRenderContext) -> str:
    lead = context.lead_label or "tu proyecto"
    return f"Cotización Tal-IA · {lead}"


def compose_email_body(context: QuoteRenderContext, custom_message: str | None) -> str:
    """Genera el cuerpo del correo acompañante."""

    lines = [f"Hola {context.contact_name or 'equipo'},", ""]
    if custom_message:
        lines.extend(_wrap_text(custom_message))
    else:
        lines.append(
            "Te comparto la cotización actualizada con los servicios solicitados. "
            "Puedes responder este correo si necesitas un ajuste."
        )
    lines.append("")
    lines.append(f"Total estimado: {_format_currency(_resolve_total(context), context.moneda)}")
    if context.valido_hasta:
        lines.append(f"Vigente hasta: {context.valido_hasta.isoformat()}")
    lines.append("")
    lines.append("Equipo Tal-IA")
    return "\n".join(lines)


def compose_whatsapp_body(context: QuoteRenderContext, custom_message: str | None) -> str:
    summary = custom_message or (
        "Te comparto la cotización de Tal-IA; cualquier ajuste lo podemos ver por este medio."
    )
    total_text = _format_currency(_resolve_total(context), context.moneda)
    return f"{summary}\nTotal estimado: {total_text}"


async def send_whatsapp_message(
    *,
    to_number: str,
    body: str,
    media_url: str | None = None,
) -> None:
    """Envía el mensaje vía Twilio con el PDF adjunto."""

    if not settings.twilio_phone_number or not settings.twilio_account_sid:
        raise QuoteSendError("whatsapp_not_configured")

    normalized_to = (
        to_number if to_number.lower().startswith("whatsapp:") else f"whatsapp:{to_number}"
    )
    normalized_from = (
        settings.twilio_phone_number
        if settings.twilio_phone_number.lower().startswith("whatsapp:")
        else f"whatsapp:{settings.twilio_phone_number}"
    )

    client = twilio_service.get_twilio_client()

    def _send() -> None:
        kwargs: dict[str, Any] = {
            "to": normalized_to,
            "from_": normalized_from,
            "body": body,
        }
        if media_url:
            kwargs["media_url"] = [media_url]
        client.messages.create(**kwargs)

    try:
        await asyncio.to_thread(_send)
    except Exception as exc:  # pragma: no cover - errores del SDK
        logger.exception("quotes.whatsapp_send_failed", extra={"error": str(exc)})
        raise QuoteSendError("whatsapp_send_failed") from exc


def _resolve_total(context: QuoteRenderContext) -> float | None:
    if context.total is not None:
        return context.total
    if context.subtotal is None:
        return None
    if context.impuestos is None:
        return context.subtotal
    return context.subtotal + context.impuestos


def _concept_total(concept: dict[str, Any]) -> float | None:
    for key in ("total", "importe", "monto", "price"):
        value = concept.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return None


def _concept_title_for_display(concept: dict[str, Any], idx: int) -> str:
    for key in ("titulo", "title", "nombre", "name"):
        value = concept.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return f"Concepto {idx}"


def _clean_concept_title(concept: dict[str, Any], idx: int) -> str:
    return _sanitize_text(_concept_title_for_display(concept, idx))


def _wrap_text(value: str, width: int = 90) -> list[str]:
    sanitized = _sanitize_text(value)
    return textwrap.wrap(sanitized, width=width) or [sanitized]


def _sanitize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if ord(ch) < 128)


def _format_currency(
    value: float | None,
    currency: str | None,
    include_currency_code: bool = True,
) -> str:
    if value is None:
        return "-"
    if include_currency_code:
        code = (currency or "MXN").upper()
        return f"{code} {value:,.2f}"
    return f"$ {value:,.2f}"


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_pdf_from_lines(lines: Iterable[str]) -> bytes:
    escaped_lines = [_pdf_escape(_sanitize_text(line)) for line in lines]
    commands = ["BT", "/F1 12 Tf"]
    y = 800
    for line in escaped_lines:
        commands.append(f"1 0 0 1 50 {y} Tm ({line}) Tj")
        y -= 14
        if y < 60:
            break  # Evita desbordar la página
    commands.append("ET")
    stream_text = "\n".join(commands)
    stream_bytes = stream_text.encode("latin-1", "ignore")

    parts: list[bytes] = [b"%PDF-1.4\n"]
    offsets: list[int] = [0]
    current = len(parts[0])

    def add_object(obj_id: int, body: str) -> None:
        nonlocal current
        chunk = f"{obj_id} 0 obj\n{body}\nendobj\n".encode("latin-1")
        offsets.append(current)
        parts.append(chunk)
        current += len(chunk)

    add_object(1, "<< /Type /Catalog /Pages 2 0 R >>")
    add_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    add_object(
        3,
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    )
    add_object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    add_object(
        5,
        f"<< /Length {len(stream_bytes)} >>\nstream\n{stream_text}\nendstream",
    )

    xref_offset = current
    xref_lines = ["xref", f"0 {len(offsets)}"]
    xref_lines.append("0000000000 65535 f ")
    for offset in offsets[1:]:
        xref_lines.append(f"{offset:010} 00000 n ")
    xref_section = "\n".join(xref_lines)

    trailer = f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"

    parts.extend(
        [
            xref_section.encode("latin-1"),
            trailer.encode("latin-1"),
        ]
    )
    return b"".join(parts)
