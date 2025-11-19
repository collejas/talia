"""Utilidades para renderizar y enviar cotizaciones."""

from __future__ import annotations

import asyncio
import textwrap
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Iterable

from app.core.config import settings
from app.core.logging import get_logger
from app.services import twilio as twilio_service

logger = get_logger("app.services.quotes")


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
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class QuoteDocument:
    """Resultado de la generación del PDF."""

    filename: str
    content: bytes


class QuoteSendError(RuntimeError):
    """Errores relacionados con el envío por WhatsApp."""


def render_quote_pdf(context: QuoteRenderContext) -> QuoteDocument:
    """Construye un PDF simple con el resumen de la cotización."""

    lines: list[str] = []
    lines.append("Tal-IA · Cotización")
    lines.append(f"Emitida: {context.created_at.astimezone(timezone.utc).strftime('%Y-%m-%d')}")
    lines.append(f"Lead: {context.lead_label}")
    if context.contact_name:
        lines.append(f"Contacto: {context.contact_name}")
    if context.contact_company:
        lines.append(f"Empresa: {context.contact_company}")
    lines.append("")

    if context.descripcion:
        lines.append("Resumen del proyecto:")
        lines.extend(_wrap_text(context.descripcion))
        lines.append("")

    if context.notes:
        lines.append("Notas relevantes:")
        lines.extend(_wrap_text(context.notes))
        lines.append("")

    lines.append("Conceptos incluidos:")
    for idx, concept in enumerate(context.conceptos or [], start=1):
        title = _clean_concept_title(concept, idx)
        lines.append(f"{idx}. {title}")
        desc = concept.get("descripcion") or concept.get("description") or concept.get("detalle")
        if desc:
            lines.extend([f"   {part}" for part in _wrap_text(str(desc))])
        monto = _concept_total(concept)
        if monto is not None:
            lines.append(f"   Total: {_format_currency(monto, context.moneda)}")
    if not context.conceptos:
        lines.append("- Detalle pendiente")
    lines.append("")

    lines.append("Totales:")
    lines.append(f"   Subtotal: {_format_currency(context.subtotal, context.moneda)}")
    lines.append(f"   Impuestos: {_format_currency(context.impuestos, context.moneda)}")
    lines.append(f"   Total: {_format_currency(_resolve_total(context), context.moneda)}")
    if context.valido_hasta:
        lines.append(f"   Vigencia: {context.valido_hasta.isoformat()}")
    lines.append("")

    lines.append(f"Emitido por: {context.issuer_name}")
    if context.issuer_email:
        lines.append(f"Contacto: {context.issuer_email}")

    pdf_bytes = _build_pdf_from_lines(lines)
    filename = f"cotizacion-{context.reference}-{context.created_at:%Y%m%d%H%M%S}.pdf"
    return QuoteDocument(filename=filename, content=pdf_bytes)


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
        kwargs: dict[str, Any] = {"to": normalized_to, "from_": normalized_from, "body": body}
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


def _clean_concept_title(concept: dict[str, Any], idx: int) -> str:
    for key in ("titulo", "title", "nombre", "name"):
        value = concept.get(key)
        if value:
            return _sanitize_text(str(value))
    return f"Concepto {idx}"


def _wrap_text(value: str, width: int = 90) -> list[str]:
    sanitized = _sanitize_text(value)
    return textwrap.wrap(sanitized, width=width) or [sanitized]


def _sanitize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if ord(ch) < 128)


def _format_currency(value: float | None, currency: str | None) -> str:
    if value is None:
        return "-"
    code = (currency or "MXN").upper()
    return f"{code} {value:,.2f}"


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
