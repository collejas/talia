"""Utilidades para renderizar y enviar cotizaciones."""

from __future__ import annotations

import asyncio
from functools import lru_cache
from base64 import b64encode
from mimetypes import guess_type
import re
import textwrap
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from html import escape as html_escape
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse
from urllib.request import Request as UrlRequest, urlopen
from zoneinfo import ZoneInfo

from weasyprint import HTML as WeasyHTML

from app.core.config import settings
from app.core.logging import get_logger
from app.services import twilio as twilio_service

logger = get_logger("app.services.quotes")
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

    folio: str | None
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
    display_timezone: str | None = None
    quote_vendor_settings: dict[str, Any] | None = None
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

    def __post_init__(self) -> None:
        """Normaliza fechas que llegan desde capas externas."""

        self.valido_hasta = _coerce_date_value(self.valido_hasta)


@dataclass
class QuoteDocument:
    """Resultado de la generación del PDF."""

    filename: str
    content: bytes


class QuoteSendError(RuntimeError):
    """Errores relacionados con el envío por WhatsApp."""


def _coerce_date_value(value: Any) -> date | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return date.fromisoformat(cleaned.split("T")[0])
        except ValueError:
            return None
    return None


def _resolve_display_timezone(value: str | None) -> ZoneInfo:
    candidates = [
        value,
        settings.webchat_calendar_timezone,
        "America/Mexico_City",
    ]
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        cleaned = candidate.strip()
        if not cleaned:
            continue
        try:
            return ZoneInfo(cleaned)
        except Exception:
            continue
    return ZoneInfo("UTC")


async def render_quote_pdf(context: QuoteRenderContext) -> QuoteDocument:
    """Genera el PDF de cotización con el formato nuevo."""

    try:
        image_cache = await _prepare_quote_image_cache(context)
        return await _render_modern_pdf(context, image_cache=image_cache)
    except Exception as exc:  # pragma: no cover - defensivo
        logger.exception("quote_modern_render_failed", exc_info=exc)
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
        font-size: 6.5pt;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        line-height: 1.22;
    }

    .meta-label-nowrap {
        white-space: nowrap;
        letter-spacing: 0;
        font-size: 6.5pt;
    }

    .meta-row {
        display: flex;
        flex-wrap: nowrap;
        align-items: baseline;
        gap: 4px;
        justify-content: flex-end;
        width: 100%;
    }

    .meta-value {
        display: block;
        margin-top: 0;
        color: #0f172a;
        font-size: 7.7pt;
        font-weight: 700;
        line-height: 1.22;
    }

    .meta-value-nowrap {
        white-space: nowrap;
    }

    .meta-value-tight {
        white-space: nowrap;
        letter-spacing: 0.08em;
        font-size: 6.5pt;
        font-weight: 400;
        color: #64748b;
        line-height: 1.22;
        text-transform: uppercase;
    }

    .info-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 10px;
    }

    .card {
        border: 1px solid #dbe3f0;
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
        width: calc(100% + 8px);
        border-collapse: collapse;
        table-layout: fixed;
        margin-left: -8px;
    }

    .items-table th,
    .items-table td {
        border-bottom: 1px solid #dbe3f0;
        padding: 8px 8px;
        vertical-align: top;
        font-size: 7.5pt;
    }

    .items-table thead th {
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 7pt;
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
        object-fit: cover;
        background: #eef2f7;
        display: block;
    }

    .item-image-fallback {
        width: 34px;
        height: 34px;
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
        width: 42%;
    }

    .item-qty {
        width: 6ch;
        text-align: center;
        white-space: nowrap;
    }

    .item-unit {
        width: 7ch;
        text-align: center;
        white-space: nowrap;
    }

    .item-price,
    .item-discount,
    .item-total {
        text-align: right;
        white-space: nowrap;
    }

    .item-price {
        width: 12ch;
    }

    .item-discount {
        width: 11ch;
    }

    .item-total {
        width: 15ch;
    }

    .item-concept-title {
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 3px;
        font-size: 7.7pt;
    }

    .item-concept-desc {
        margin: 0;
        color: #475569;
        font-size: 6.8pt;
    }

    .empty-row {
        text-align: center;
        color: #64748b;
        padding: 16px 10px;
    }

    .bottom-grid {
        display: block;
        width: 100%;
        margin-top: 14px;
    }

    .bottom-stack {
        display: grid;
        gap: 12px;
        width: 100%;
    }

    .bottom-stack > .section {
        width: 100%;
        margin-top: 0;
    }

    .prose-box,
    .note-box,
    .summary-box {
        border: 1px solid #dbe3f0;
        background: #f8fbff;
        padding: 8px 10px;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
    }

    .prose-box,
    .note-box {
        overflow: visible;
    }

    .box-title {
        margin: 0 0 8px;
        font-size: 7pt;
        line-height: 1.1;
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
        font-size: 7.5pt;
        line-height: 1.5;
    }

    .richtext p + p,
    .richtext div + div {
        margin-top: 6px;
    }

    .summary-box {
        background: #eef6ff;
        border-color: #cfe0ff;
        padding-right: 8px;
        height: auto;
        display: flex;
        flex-direction: column;
        overflow: visible;
    }

    .note-box {
        height: auto;
        overflow: visible;
        width: 100%;
        display: block;
    }

    .summary-row {
        display: flex;
        justify-content: flex-start;
        gap: 10px;
        margin-bottom: 1px;
        font-size: 7.5pt;
        line-height: 1.05;
    }

    .summary-row span {
        color: #475569;
        flex: 1 1 auto;
    }

    .summary-row strong {
        color: #0f172a;
        font-size: 8.5pt;
        margin-left: auto;
        text-align: right;
        display: block;
    }

    .summary-total {
        margin-top: 2px;
        padding-top: 3px;
        border-top: 1px solid #cfe0ff;
        font-size: 8.5pt;
        font-weight: 700;
    }

    .summary-box .box-title {
        margin-bottom: 3px;
    }

    .prose-box .proposal-details,
    .note-box .proposal-details {
        margin-top: 0;
        padding: 0;
        border: 0;
        background: transparent;
    }

    .prose-box .proposal-detail,
    .note-box .proposal-detail,
    .prose-box .proposal-detail p,
    .note-box .proposal-detail p {
        max-width: 100%;
        overflow-wrap: anywhere;
        word-break: break-word;
    }

    .prose-box .proposal-detail,
    .note-box .proposal-detail {
        margin-bottom: 8px;
    }

    .note-box .annexes-block {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid #dbe3f0;
    }

    .note-box .annexes-title {
        margin: 0 0 4px;
        font-size: 7pt;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #64748b;
    }

    .note-box .annexes-text {
        margin: 0;
        font-size: 7.5pt;
        line-height: 1.35;
        color: #334155;
        overflow-wrap: anywhere;
        word-break: break-word;
    }

    .prose-box .proposal-detail:last-child,
    .note-box .proposal-detail:last-child {
        margin-bottom: 0;
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


async def _render_modern_pdf(
    context: QuoteRenderContext,
    *,
    image_cache: dict[str, str | None] | None = None,
) -> QuoteDocument:
    html_doc = _build_modern_quote_html(context, image_cache=image_cache)
    base_url = _resolve_template_base_url()
    try:
        pdf_bytes = await asyncio.to_thread(
            lambda: WeasyHTML(string=html_doc, base_url=base_url).write_pdf()
        )
    except Exception as exc:
        logger.exception("quote_modern_weasyprint_render_failed", exc_info=exc)
        raise
    filename = _quote_pdf_filename(context.folio, context.reference)
    return QuoteDocument(filename=filename, content=pdf_bytes)


def _build_modern_quote_html(
    context: QuoteRenderContext,
    *,
    image_cache: dict[str, str | None] | None = None,
) -> str:
    folio = _safe_text(context.folio, f"Cot-{context.reference.upper()}")
    display_timezone = _resolve_display_timezone(context.display_timezone)
    issued_at = context.created_at.astimezone(display_timezone).strftime("%d/%m/%Y %H:%M")
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
    vendor_name = _title_case_name(context.vendor_assessor_name or context.issuer_name, "Sin asesor")
    vendor_phone = _safe_text(context.vendor_assessor_phone, "Sin teléfono")
    vendor_email = _safe_text(context.vendor_assessor_email, "Sin correo")
    client_name = _title_case_name(context.contact_name, "Sin cliente")
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
    quote_vendor_settings = _normalize_quote_vendor_settings(context.quote_vendor_settings)
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
    notes_html = _build_quote_vendor_notes_html(
        quote_vendor_settings,
        fallback_body=context.notes,
    )
    conditions_html = _build_quote_vendor_conditions_html(
        quote_vendor_settings,
        fallback_html=None,
    )
    validity_days_value = quote_vendor_settings.get("validityDays", 15)
    try:
        validity_days = max(1, int(str(validity_days_value).strip())) if validity_days_value is not None else 15
    except ValueError:
        validity_days = 15
    items_html = _build_modern_quote_items_html(context, image_cache=image_cache)
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
                <span class="meta-label">Cotización Folio</span>
                <span class="meta-value">{html_escape(folio)}</span>
              </div>
              <div class="meta-block">
                <span class="meta-label">Emitida</span>
                <span class="meta-value">{html_escape(issued_at)}</span>
              </div>
              <div class="meta-block">
                <div class="meta-row">
                  <span class="meta-label meta-label-nowrap">Días de Vigencia</span>
                  <span class="meta-value meta-value-tight">{html_escape(str(validity_days))}, hasta:</span>
                </div>
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
              <p>{html_escape(client_phone)}</p>
              <p>{html_escape(client_email)}</p>
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
            <div class="bottom-stack">
              <div class="section" style="margin-top:0;">
                <div class="summary-box">
                  <p class="box-title">Resumen financiero</p>
                  <div class="summary-row"><span>Subtotal</span><strong>{html_escape(subtotal)}</strong></div>
                  <div class="summary-row"><span>IVA</span><strong>{html_escape(taxes)}</strong></div>
                  <div class="summary-row summary-total"><span>Total</span><strong>{html_escape(total)}</strong></div>
                </div>
              </div>

              <div class="section" style="margin-top:0;">
                <div class="prose-box">
                  <p class="box-title">Condiciones comerciales</p>
                  <div class="richtext">{conditions_html}</div>
                </div>
              </div>

              <div class="section" style="margin-top:0;">
                <div class="note-box">
                  <p class="box-title">Notas y anexos</p>
                  <div class="richtext">{notes_html}</div>
                  <div class="annexes-block">
                    <p class="annexes-title">Anexos</p>
                    <p class="annexes-text">No hay archivos cargados todavía.</p>
                  </div>
                </div>
              </div>
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


def _normalize_quote_vendor_settings(value: Any) -> dict[str, Any]:
    default = {
        "conditionsTitle": "Condiciones comerciales",
        "conditions": [
            {
                "subtitle": "Vigencia",
                "description": "15 días naturales a partir de la fecha de emisión.",
            },
        ],
        "notesTitle": "Notas",
        "notesBody": "",
        "validityDays": 15,
    }
    if not isinstance(value, dict):
        return default

    conditions_raw = value.get("conditions")
    conditions: list[dict[str, str]] = []
    if isinstance(conditions_raw, list):
        for item in conditions_raw:
            if not isinstance(item, dict):
                continue
            subtitle = _safe_text(item.get("subtitle"), "")
            description = _safe_text(item.get("description"), "")
            if not subtitle and not description:
                continue
            conditions.append({"subtitle": subtitle, "description": description})

    if not conditions:
        conditions = list(default["conditions"])

    return {
        "conditionsTitle": _safe_text(value.get("conditionsTitle"), default["conditionsTitle"]),
        "conditions": conditions,
        "notesTitle": _safe_text(value.get("notesTitle"), default["notesTitle"]),
        "notesBody": _safe_text(value.get("notesBody"), default["notesBody"]),
        "validityDays": max(
            1,
            int(str(value.get("validityDays") or value.get("validity_days") or value.get("vigenciaDias") or default["validityDays"]).strip())
            if (value.get("validityDays") or value.get("validity_days") or value.get("vigenciaDias") or default["validityDays"]) is not None
            else default["validityDays"],
        ),
    }


def _build_quote_vendor_conditions_html(
    settings: dict[str, Any],
    *,
    fallback_html: str | None = None,
) -> str:
    items = settings.get("conditions")
    if isinstance(items, list) and items:
        pieces = ['<div class="proposal-details">']
        for item in items:
            if not isinstance(item, dict):
                continue
            subtitle = _safe_text(item.get("subtitle"), "")
            description = _safe_text(item.get("description"), "")
            if not subtitle and not description:
                continue
            pieces.append(
                '<div class="proposal-detail">'
                f"<h3>{html_escape(subtitle)}</h3>"
                f"<p>{html_escape(description)}</p>"
                "</div>"
            )
        pieces.append("</div>")
        if len(pieces) > 2:
            return "".join(pieces)
    if fallback_html:
        return fallback_html
    return '<div class="proposal-details"><div class="proposal-detail"><h3>Sin condiciones comerciales adicionales.</h3><p>—</p></div></div>'


def _build_quote_vendor_notes_html(
    settings: dict[str, Any],
    *,
    fallback_body: str | None,
) -> str:
    notes_title = _safe_text(settings.get("notesTitle"), "Notas")
    notes_body = _safe_text(settings.get("notesBody"), "")
    if not notes_body:
        notes_body = _safe_text(fallback_body, "Sin notas para el cliente.")
    return "".join(
        [
            '<div class="proposal-details">',
            f'<div class="proposal-detail"><h3>{html_escape(notes_title)}</h3><p>{html_escape(notes_body)}</p></div>',
            "</div>",
        ]
    )


def _build_modern_quote_items_html(
    context: QuoteRenderContext,
    *,
    image_cache: dict[str, str | None] | None = None,
) -> str:
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
        image_url = _item_image_src(related, image_cache=image_cache)
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


def _item_image_src(
    record: Any,
    *,
    image_cache: dict[str, str | None] | None = None,
) -> str | None:
    raw_url = _item_image_url(record)
    if not raw_url:
        return None
    if raw_url.startswith("data:"):
        return raw_url
    if image_cache is not None and raw_url in image_cache:
        return image_cache[raw_url]
    embedded = _image_url_to_data_uri(raw_url)
    return embedded or raw_url


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


@lru_cache(maxsize=256)
def _image_url_to_data_uri(image_url: str) -> str | None:
    candidate = image_url.strip()
    if not candidate:
        return None
    if candidate.startswith("data:"):
        return candidate

    parsed = urlparse(candidate)
    if parsed.scheme in {"http", "https"}:
        resolved_url = candidate
    elif candidate.startswith("/"):
        base_url = _resolve_template_base_url()
        if not base_url:
            return None
        resolved_url = urljoin(f"{base_url.rstrip('/')}/", candidate)
    else:
        repo_root = Path(__file__).resolve().parents[4]
        local_candidates = [
            repo_root / "frontend/panel/public" / candidate.lstrip("/"),
            repo_root / "backend/app/public" / candidate.lstrip("/"),
            repo_root / "backend/app/public/shared" / candidate.lstrip("/"),
        ]
        for local_candidate in local_candidates:
            if not local_candidate.exists() or not local_candidate.is_file():
                continue
            try:
                content = local_candidate.read_bytes()
            except OSError:
                continue
            mime_type, _ = guess_type(str(local_candidate))
            safe_mime = mime_type or "image/png"
            encoded = b64encode(content).decode("ascii")
            return f"data:{safe_mime};base64,{encoded}"
        return None

    try:
        request = UrlRequest(
            resolved_url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; TaliaQuotePdf/1.0)",
                "Accept": "image/*,*/*;q=0.8",
            },
        )
        with urlopen(request, timeout=4) as response:
            content = response.read()
            content_type = response.headers.get_content_type() or response.headers.get("Content-Type")
    except Exception:
        return None

    if not content:
        return None
    safe_mime = content_type or guess_type(candidate or resolved_url)[0] or "image/png"
    encoded = b64encode(content).decode("ascii")
    return f"data:{safe_mime};base64,{encoded}"


async def _prepare_quote_image_cache(context: QuoteRenderContext) -> dict[str, str | None]:
    raw_urls: set[str] = set()
    for item in context.items or []:
        if not isinstance(item, dict):
            continue
        raw_url = _item_image_url(item)
        if raw_url and not raw_url.startswith("data:"):
            raw_urls.add(raw_url)
    if not raw_urls:
        return {}

    async def resolve(url: str) -> tuple[str, str | None]:
        embedded = await asyncio.to_thread(_image_url_to_data_uri, url)
        return url, embedded

    resolved = await asyncio.gather(*(resolve(url) for url in raw_urls))
    return {url: embedded for url, embedded in resolved}


def _format_discount(value: Any, currency: str | None) -> str:
    amount = _coerce_float(value)
    if amount is None:
        return "—"
    if amount <= 0:
        return "0"
    if amount < 1:
        return f"{amount * 100:.0f}%"
    return _format_currency(amount, currency)


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
        f"Fecha de emisión: {context.created_at.astimezone(display_timezone).strftime('%Y-%m-%d')}"
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
    fallback_html = "".join(
        [
            "<html><head><meta charset='utf-8' />",
            "<style>",
            "@page { size: A4; margin: 12mm; }",
            "body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; color: #0f172a; }",
            "pre { white-space: pre-wrap; word-break: break-word; margin: 0; }",
            "</style></head><body><pre>",
            html_escape("\n".join(lines)),
            "</pre></body></html>",
        ]
    )
    pdf_bytes = WeasyHTML(string=fallback_html, base_url=_resolve_template_base_url()).write_pdf()
    filename = _quote_pdf_filename(context.folio, context.reference)
    return QuoteDocument(filename=filename, content=pdf_bytes)


def _safe_text(value: str | None, fallback: str = "—") -> str:
    if value is None:
        return fallback
    trimmed = value.strip()
    return trimmed if trimmed else fallback


def _quote_pdf_filename(folio: str | None, reference: str) -> str:
    candidate = _safe_text(folio, "")
    if not candidate:
        candidate = f"Cot-{reference.upper()}"
    candidate = Path(candidate).name
    candidate = unicodedata.normalize("NFKC", candidate)
    candidate = re.sub(r"[^\w.-]+", "-", candidate, flags=re.UNICODE)
    candidate = re.sub(r"-{2,}", "-", candidate).strip("._-")
    if not candidate:
        candidate = f"Cot-{reference.upper()}"
    if not candidate.lower().endswith(".pdf"):
        candidate = f"{candidate}.pdf"
    return candidate


def _title_case_name(value: str | None, fallback: str = "—") -> str:
    text = _safe_text(value, fallback)
    if text == fallback:
        return fallback
    words = []
    for raw_word in text.split():
        if not raw_word:
            continue
        if raw_word.isupper() and len(raw_word) <= 4:
            words.append(raw_word)
            continue
        parts = raw_word.split("-")
        titled_parts = [part[:1].upper() + part[1:].lower() if part else part for part in parts]
        words.append("-".join(titled_parts))
    return " ".join(words) if words else fallback


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


def _record_value(record: Any, key: str) -> Any:
    if not isinstance(record, dict):
        return None
    if key in record:
        return record.get(key)
    normalized_key = key.replace(" ", "_")
    if normalized_key in record:
        return record.get(normalized_key)
    for candidate_key, value in record.items():
        if not isinstance(candidate_key, str):
            continue
        normalized_candidate = candidate_key.replace(" ", "_")
        if normalized_candidate == normalized_key:
            return value
    return None


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


def _normalize_detail_text(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, str):
        cleaned = " ".join(value.split())
        return cleaned or "—"
    text = str(value).strip()
    return text or "—"


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
