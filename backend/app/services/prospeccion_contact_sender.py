"""Worker asíncrono para procesar envíos de prospección."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import html as html_lib
import re
from typing import Any, Sequence
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from uuid import UUID

from app.channels.voice.service import VoiceCallResult, start_outbound_call
from app.channels.whatsapp.service import TwilioSendResult, _send_whatsapp_reply
from app.channels.whatsapp.routing import resolve_whatsapp_organizacion
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import EmailSendError, send_email, storage, tenant_runtime
from app.services.metrics import metrics
from app.services.prospeccion_auto_promoter import auto_promote_prospecto, is_promotable_estado
from app.services.prospeccion_progress import progress_hub
from app.services.storage import StorageError

logger = get_logger("prospeccion.contact_sender")

DEFAULT_BACKOFF_SECONDS: tuple[int, ...] = (30, 120, 300, 600)
PLACEHOLDER_PATTERN = re.compile(r"{{\s*([\w\.-]+)\s*}}")
NUMERIC_PLACEHOLDER_PATTERN = re.compile(r"{{\s*(\d+)\s*}}")
LEGACY_IMAGE_PLACEHOLDER_PATTERN = re.compile(r"{{\s*DATA:IMAGE:[^}]+}}", re.IGNORECASE)
EMAIL_LOGO_IMG_STYLE = "width:83.333%;height:auto;display:block;margin:0 auto;"
IMG_TAG_PATTERN = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
ANCHOR_HREF_PATTERN = re.compile(r'(<a\b[^>]*\bhref=")([^"]+)(")', re.IGNORECASE)
PLAIN_URL_PATTERN = re.compile(r"(https?://[^\s<>\")]+)", re.IGNORECASE)


@dataclass(slots=True)
class ContactEnvioResult:
    """Resultado simplificado del intento de envío."""

    estado: str
    detalle: dict[str, Any]
    error: str | None = None
    mensaje_id: str | None = None
    retryable: bool = False


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _prospecto_whatsapp_allowed(info: dict[str, Any]) -> bool:
    # Prospección en frío puede forzar intento aunque lookup no tenga carrier móvil.
    if info.get("whatsapp_force"):
        return True
    # Explicit override from lookup/business rule.
    if info.get("whatsapp_permitido") is True:
        return True
    if info.get("whatsapp_permitido") is False:
        return False
    carrier_type = _clean_text(info.get("carrier_type")) or ""
    normalized = carrier_type.lower()
    if not normalized:
        # For cold outreach we allow unknown carrier and let provider validation decide.
        return True
    return normalized == "mobile"


def _prospecto_llamada_permitida(info: dict[str, Any]) -> bool:
    if info.get("llamada_permitida"):
        return True
    carrier_type = _clean_text(info.get("carrier_type")) or ""
    return carrier_type.lower() in {"mobile", "landline"}


def _merge_detalle(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base or {})
    merged.update(extra or {})
    return merged


def _build_placeholder_context(*sources: Any) -> dict[str, Any]:
    context: dict[str, Any] = {}
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key, value in source.items():
            if value is None:
                continue
            if isinstance(value, (str, int, float)):
                context[str(key)] = value
    if "nombre" not in context and context.get("display_name"):
        context["nombre"] = context["display_name"]
    if "telefono" not in context and context.get("phone"):
        context["telefono"] = context["phone"]
    return context


def _render_template_text(template: str, context: dict[str, Any]) -> str:
    if not template:
        return ""

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = context.get(key)
        return "" if value is None else str(value)

    return PLACEHOLDER_PATTERN.sub(_replace, template)


def _normalize_email_html_template(template: str) -> str:
    """Normaliza placeholders heredados de editores web a tokens soportados en correo."""

    if not template:
        return ""
    return LEGACY_IMAGE_PLACEHOLDER_PATTERN.sub("{{logo_url}}", template)


def _extract_visible_text_from_html(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", value or "")
    normalized = re.sub(r"\s+", " ", without_tags).strip()
    return normalized


def _inject_text_fallback_into_html(*, body_text: str, body_html: str) -> str:
    """Garantiza que el HTML incluya el texto base cuando no esté presente."""

    if not body_html:
        return body_html
    raw_body_text = (body_text or "").strip()
    if not raw_body_text:
        return body_html
    compact_body = re.sub(r"\s+", " ", raw_body_text).strip().lower()
    visible_html = _extract_visible_text_from_html(body_html)
    if visible_html:
        html_compact = visible_html.lower()
        body_compact = compact_body
        # Si el texto principal ya está contenido en el HTML, no duplicar.
        if body_compact in html_compact:
            return body_html
        # Fallback tolerante: compara inicio del cuerpo para cubrir variaciones menores.
        body_head = body_compact[:120]
        if body_head and body_head in html_compact:
            return body_html
    escaped = html_lib.escape(raw_body_text).replace("\n", "<br/>")
    if not escaped.strip():
        return body_html
    return f"<p>{escaped}</p>\n{body_html}"


def _build_basic_html_from_text(*, body_text: str, logo_url: str | None = None) -> str | None:
    """Construye una versión HTML mínima desde texto plano para mejorar render en clientes de correo."""

    normalized_text = (body_text or "").strip()
    if not normalized_text:
        return None
    escaped = html_lib.escape(normalized_text).replace("\n", "<br/>")
    if logo_url:
        safe_logo_url = html_lib.escape(logo_url, quote=True)
        escaped_logo = html_lib.escape(logo_url)
        logo_tag = f'<img src="{safe_logo_url}" alt="Logo" style="{EMAIL_LOGO_IMG_STYLE}" />'
        if escaped_logo in escaped:
            escaped = escaped.replace(escaped_logo, logo_tag)
        else:
            escaped = f"{logo_tag}<br/>{escaped}"
    return f"<p>{escaped}</p>"


def _sanitize_tracking_keyword(value: Any) -> str:
    text = _clean_text(value) or ""
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", text).strip("-").lower()
    return (normalized or "general")[:80]


def _build_email_tracking_url(
    *,
    context: dict[str, Any],
    payload: dict[str, Any],
    envio_id: Any | None = None,
    prospecto_id: Any | None = None,
) -> str:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    keyword = _sanitize_tracking_keyword(
        metadata.get("tracking_keyword")
        or metadata.get("template_slug")
        or context.get("segmento")
        or context.get("fuente")
        or "general"
    )
    base_url = _clean_text(metadata.get("tracking_base_url")) or "https://talia.mx/"
    parsed = urlparse(base_url)
    existing = dict(parse_qsl(parsed.query, keep_blank_values=True))
    campana_id = _clean_text(metadata.get("campana_id"))
    template_id = _clean_text(metadata.get("template_id"))
    envio_id_value = _clean_text(envio_id)
    prospecto_id_value = _clean_text(prospecto_id)
    existing.update(
        {
            "utm_source": existing.get("utm_source") or "prospeccion",
            "utm_medium": existing.get("utm_medium") or "email",
            "utm_campaign": existing.get("utm_campaign") or "cold_outreach",
            "utm_content": existing.get("utm_content") or "image",
            "kw": keyword,
            **({"cid": campana_id} if campana_id else {}),
            **({"tid": template_id} if template_id else {}),
            **({"eid": envio_id_value} if envio_id_value else {}),
            **({"pid": prospecto_id_value} if prospecto_id_value else {}),
        }
    )
    query = urlencode(existing, doseq=True)
    return urlunparse((parsed.scheme or "https", parsed.netloc or "talia.mx", parsed.path or "/", "", query, ""))


def _resolve_tracking_base_url(payload: dict[str, Any]) -> str:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    base_url = _clean_text(metadata.get("tracking_base_url")) or "https://talia.mx/"
    parsed = urlparse(base_url)
    return urlunparse((parsed.scheme or "https", parsed.netloc or "talia.mx", parsed.path or "/", "", "", ""))


def _wrap_images_with_tracking_link(body_html: str, tracking_url: str) -> str:
    if not body_html:
        return body_html
    chunks: list[str] = []
    cursor = 0
    for match in IMG_TAG_PATTERN.finditer(body_html):
        start, end = match.span()
        image_tag = match.group(0)
        chunks.append(body_html[cursor:start])
        last_anchor_open = body_html.rfind("<a", 0, start)
        last_anchor_close = body_html.rfind("</a>", 0, start)
        inside_anchor = last_anchor_open != -1 and last_anchor_open > last_anchor_close
        if inside_anchor:
            chunks.append(image_tag)
        else:
            safe_url = html_lib.escape(tracking_url, quote=True)
            chunks.append(f'<a href="{safe_url}" target="_blank" rel="noopener noreferrer">{image_tag}</a>')
        cursor = end
    chunks.append(body_html[cursor:])
    return "".join(chunks)


def _append_tracking_params_to_anchor_hrefs(body_html: str, tracking_url: str) -> str:
    if not body_html:
        return body_html
    parsed_tracking = urlparse(tracking_url)
    tracking_params = dict(parse_qsl(parsed_tracking.query, keep_blank_values=True))
    if not tracking_params:
        return body_html

    def _replace(match: re.Match[str]) -> str:
        prefix, href, suffix = match.groups()
        parsed_href = urlparse(href)
        if parsed_href.scheme not in {"http", "https"}:
            return match.group(0)
        current = dict(parse_qsl(parsed_href.query, keep_blank_values=True))
        changed = False
        for key, value in tracking_params.items():
            if key not in current and value:
                current[key] = value
                changed = True
        if not changed:
            return match.group(0)
        query = urlencode(current, doseq=True)
        patched_href = urlunparse(
            (
                parsed_href.scheme,
                parsed_href.netloc,
                parsed_href.path,
                parsed_href.params,
                query,
                parsed_href.fragment,
            )
        )
        return f"{prefix}{html_lib.escape(patched_href, quote=True)}{suffix}"

    return ANCHOR_HREF_PATTERN.sub(_replace, body_html)


def _append_tracking_params_to_plain_urls(body_text: str, tracking_url: str) -> str:
    if not body_text:
        return body_text
    parsed_tracking = urlparse(tracking_url)
    tracking_params = dict(parse_qsl(parsed_tracking.query, keep_blank_values=True))
    if not tracking_params:
        return body_text

    def _replace(match: re.Match[str]) -> str:
        raw_url = match.group(1)
        parsed_href = urlparse(raw_url)
        if parsed_href.scheme not in {"http", "https"}:
            return raw_url
        current = dict(parse_qsl(parsed_href.query, keep_blank_values=True))
        changed = False
        for key, value in tracking_params.items():
            if key not in current and value:
                current[key] = value
                changed = True
        if not changed:
            return raw_url
        query = urlencode(current, doseq=True)
        return urlunparse(
            (
                parsed_href.scheme,
                parsed_href.netloc,
                parsed_href.path,
                parsed_href.params,
                query,
                parsed_href.fragment,
            )
        )

    return PLAIN_URL_PATTERN.sub(_replace, body_text)


def _render_twilio_variables(definition: Any, context: dict[str, Any]) -> dict[str, str] | None:
    if not isinstance(definition, dict):
        return None
    rendered: dict[str, str] = {}
    for key, raw_value in definition.items():
        if raw_value is None:
            continue
        raw_text = str(raw_value).strip()
        if "{{" in raw_text and "}}" in raw_text:
            text = _render_template_text(raw_text, context).strip()
        else:
            text = _resolve_twilio_variable_value(raw_text, key=str(key), context=context)
        rendered[str(key)] = text
    return rendered or None


def _find_blank_twilio_variables(variables: dict[str, str] | None) -> list[str]:
    if not variables:
        return []
    missing: list[str] = []
    for key, value in variables.items():
        if not str(value or "").strip():
            missing.append(str(key))
    return missing


def _normalize_context_key(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return normalized


def _context_get_first(context: dict[str, Any], *candidates: str) -> str | None:
    for candidate in candidates:
        value = context.get(candidate)
        text = _clean_text(value)
        if text:
            return text
    return None


def _resolve_twilio_variable_value(raw_value: str, *, key: str, context: dict[str, Any]) -> str:
    value = _clean_text(raw_value) or ""
    if not value:
        return ""

    direct = _clean_text(context.get(value))
    if direct:
        return direct

    normalized = _normalize_context_key(value)
    direct_normalized = _clean_text(context.get(normalized))
    if direct_normalized:
        return direct_normalized

    if normalized in {"nombre", "name", "display_name", "full_name"}:
        return _context_get_first(context, "nombre", "display_name", "full_name", "name") or ""
    if normalized in {"nombre_ia", "nombre_asesor", "asesor", "assistant_name", "seller_name"}:
        return _context_get_first(context, "nombre_ia", "assistant_name", "asesor_nombre", "seller_name") or "Tal-IA"
    if normalized in {"empresa", "company", "company_name", "organizacion", "organization_name", "brand_name"}:
        return _context_get_first(context, "empresa", "company_name", "organizacion_nombre", "brand_name") or "Tal-IA"
    if normalized in {"segmento", "giro", "industry", "actividad"}:
        return _context_get_first(context, "segmento", "giro", "actividad", "industry") or "tu negocio"
    if normalized in {"beneficio", "benefit", "propuesta_valor", "value_prop"}:
        return _context_get_first(context, "beneficio", "benefit", "propuesta_valor") or "más citas"

    if key == "1":
        return _context_get_first(context, "nombre", "display_name", "full_name", "name") or ""
    if key == "2":
        return _context_get_first(context, "nombre_ia", "assistant_name", "asesor_nombre", "seller_name") or "Tal-IA"
    if key == "3":
        return _context_get_first(context, "empresa", "company_name", "organizacion_nombre", "brand_name") or "Tal-IA"
    if key == "4":
        return _context_get_first(context, "segmento", "giro", "actividad", "industry") or "tu negocio"
    if key == "5":
        return _context_get_first(context, "beneficio", "benefit", "propuesta_valor") or "más citas"

    return ""


def _build_twilio_numeric_variables_from_body(*, body: str | None, context: dict[str, Any]) -> dict[str, str] | None:
    if not body:
        return None
    keys = sorted({match.group(1) for match in NUMERIC_PLACEHOLDER_PATTERN.finditer(body)}, key=int)
    if not keys:
        return None
    rendered: dict[str, str] = {}
    for key in keys:
        rendered[key] = _resolve_twilio_variable_value(key, key=key, context=context)
    return rendered


def _build_contact_log_entry(
    *,
    organizacion_id: Any | None = None,
    prospecto_id: Any,
    canal: str,
    estado: str,
    detalle: dict[str, Any],
    error: str | None = None,
    batch_id: Any | None = None,
    envio_id: Any | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "prospecto_id": str(prospecto_id),
        "canal": canal,
        "estado": estado,
        "detalle": detalle,
    }
    if organizacion_id:
        entry["organizacion_id"] = str(organizacion_id)
    if error:
        entry["error"] = error
    if batch_id:
        entry["batch_id"] = str(batch_id)
    if envio_id:
        entry["envio_id"] = str(envio_id)
    return entry


async def _log_whatsapp_inbox_message(
    *,
    repo: CRMRepository,
    envio: dict[str, Any],
    detalle: dict[str, Any],
    payload: dict[str, Any],
    result: ContactEnvioResult,
) -> None:
    contact_id = await _resolve_contact_id_for_prospecto(repo=repo, prospecto_id=envio.get("prospecto_id"))
    if not contact_id:
        return
    conversation_id = await _ensure_whatsapp_conversation(repo=repo, contact_id=contact_id)
    if not conversation_id:
        return
    telefono = _clean_text(detalle.get("phone"))
    if not telefono:
        return
    detalle_meta = result.detalle if isinstance(result.detalle, dict) else {}
    body_preview = _clean_text(detalle_meta.get("body_preview"))
    if not body_preview:
        body_preview = _clean_text(payload.get("body"))
    if not body_preview and detalle_meta.get("template_sid"):
        body_preview = f"[Plantilla {detalle_meta.get('template_sid')}]"
    metadata_payload: dict[str, Any] = {
        "source": "prospeccion",
        "envio_id": str(envio.get("id")) if envio.get("id") else None,
        "batch_id": str(envio.get("batch_id")) if envio.get("batch_id") else None,
        "delivery_status": detalle_meta.get("status"),
    }
    if detalle_meta.get("template_sid"):
        metadata_payload["twilio_content_sid"] = detalle_meta.get("template_sid")
    if detalle_meta.get("twilio_variables"):
        metadata_payload["twilio_variables"] = detalle_meta.get("twilio_variables")
    metadata_payload = {k: v for k, v in metadata_payload.items() if v not in (None, "", {})}

    contact_record: dict[str, Any] | None = None
    try:
        contact_record = await storage.fetch_contact(contact_id)
    except StorageError:
        contact_record = None
    organizacion_hint = await resolve_whatsapp_organizacion(contact=contact_record)
    try:
        await storage.register_whatsapp_message(
            direction="saliente",
            wa_id=None,
            phone_e164=telefono,
            body=body_preview,
            message_sid=result.mensaje_id,
            conversation_id=conversation_id,
            contact_id=contact_id,
            metadata=metadata_payload,
            organizacion_id=organizacion_hint,
        )
    except StorageError as exc:
        log_event(
            logger,
            "prospeccion.sender_inbox_record_failed",
            envio_id=str(envio.get("id")),
            error=str(exc),
        )


async def _resolve_contact_id_for_prospecto(
    *,
    repo: CRMRepository,
    prospecto_id: Any,
) -> str | None:
    if not prospecto_id:
        return None
    try:
        prospecto_uuid = UUID(str(prospecto_id))
    except (TypeError, ValueError):
        return None
    try:
        prospecto = await repo.worker_get_prospecto(prospecto_id=prospecto_uuid)
    except CRMRepositoryError:
        return None
    if not prospecto:
        return None
    metadata = prospecto.get("metadata") if isinstance(prospecto.get("metadata"), dict) else {}
    contact_id = metadata.get("crm_contacto_id")
    return str(contact_id) if contact_id else None


async def _ensure_whatsapp_conversation(
    *,
    repo: CRMRepository,
    contact_id: str,
) -> str | None:
    try:
        existing = await repo.get_latest_whatsapp_conversation(contact_id=contact_id)
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "prospeccion.sender_inbox_fetch_conversation_failed",
            contact_id=contact_id,
            error=str(exc),
        )
        existing = None
    if existing and existing.get("id"):
        return str(existing.get("id"))
    try:
        contact_uuid = UUID(str(contact_id))
    except (TypeError, ValueError):
        return None
    try:
        conversation = await repo.create_conversation(contacto_id=contact_uuid, canal="whatsapp")
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "prospeccion.sender_inbox_create_conversation_failed",
            contact_id=contact_id,
            error=str(exc),
        )
        return None
    conversation_id = conversation.get("id") if isinstance(conversation, dict) else None
    return str(conversation_id) if conversation_id else None


async def _broadcast_batch_event(batch_id: Any, payload: dict[str, Any]) -> None:
    """Envía eventos de actualización a los suscriptores SSE."""

    if not batch_id:
        return
    enriched = dict(payload)
    enriched.setdefault("batch_id", str(batch_id))
    await progress_hub.publish(str(batch_id), enriched)


async def _send_whatsapp_message(
    to_number: str,
    body: str | None,
    *,
    content_sid: str | None = None,
    content_variables: dict[str, str] | None = None,
    organizacion_id: UUID | None = None,
) -> TwilioSendResult:
    if not body and not content_sid:
        return TwilioSendResult(sid=None, status="skipped", error="empty_body")
    return await _send_whatsapp_reply(
        to_number=to_number,
        body=body or "",
        content_sid=content_sid,
        content_variables=content_variables,
        organizacion_id=organizacion_id,
    )


async def _run_envio_correo(
    envio: dict[str, Any],
    payload: dict[str, Any],
    *,
    organizacion_id: UUID | None = None,
) -> ContactEnvioResult:
    email_value = _clean_text(envio.get("email"))
    if not email_value:
        return ContactEnvioResult(
            estado="omitido",
            detalle={"reason": "sin_correo"},
        )
    subject_template = _clean_text(payload.get("subject"))
    body_template = payload.get("body")
    body_html_template = payload.get("body_html")
    if not subject_template or not body_template:
        return ContactEnvioResult(
            estado="error",
            detalle={"reason": "correo_payload_incompleto"},
            error="correo_payload_incompleto",
        )
    context = _build_placeholder_context(envio, payload, payload.get("metadata"))
    tracking_url = _build_email_tracking_url(
        context=context,
        payload=payload,
        envio_id=envio.get("id"),
        prospecto_id=envio.get("prospecto_id"),
    )
    context["tracking_url"] = tracking_url
    context["website_url"] = _resolve_tracking_base_url(payload)
    subject = _render_template_text(subject_template, context).strip()
    body = _render_template_text(str(body_template), context).strip()
    body_html = None
    logo_url = _clean_text(context.get("logo_url"))
    if isinstance(body_html_template, str) and body_html_template.strip():
        normalized_html_template = _normalize_email_html_template(body_html_template)
        body_html = _render_template_text(normalized_html_template, context).strip() or None
    if body_html:
        body_html = _inject_text_fallback_into_html(body_text=body, body_html=body_html)
    elif logo_url and (
        "{{logo_url}}" in str(body_template or "")
        or "{{DATA:IMAGE:" in str(body_template or "")
    ):
        body_html = _build_basic_html_from_text(body_text=body, logo_url=logo_url)
    if body_html:
        body_html = _wrap_images_with_tracking_link(body_html, tracking_url)
        body_html = _append_tracking_params_to_anchor_hrefs(body_html, tracking_url)
    if not subject or not body:
        return ContactEnvioResult(
            estado="error",
            detalle={"reason": "correo_payload_incompleto"},
            error="correo_payload_incompleto",
        )
    mail_settings = None
    brevo_settings = None
    if organizacion_id:
        try:
            mail_settings, brevo_settings = await asyncio.gather(
                tenant_runtime.get_mail_runtime_settings(organizacion_id=organizacion_id),
                tenant_runtime.get_brevo_runtime_settings(organizacion_id=organizacion_id),
            )
        except Exception as exc:  # pragma: no cover - fallback a settings globales
            log_event(
                logger,
                "prospeccion.sender_mail_runtime_fallback",
                organizacion_id=str(organizacion_id),
                error=str(exc),
            )
    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text=body,
            body_html=body_html,
            recipients=[email_value],
            mail_settings=mail_settings,
            brevo_settings=brevo_settings,
        )
    except EmailSendError as exc:
        return ContactEnvioResult(
            estado="error",
            detalle={"email": email_value},
            error=str(exc),
            retryable=True,
        )
    return ContactEnvioResult(
        estado="enviado",
        detalle={
            "email": email_value,
            "tracking_url": tracking_url,
        },
        mensaje_id=message_id,
    )


async def _run_envio_whatsapp(
    detalle: dict[str, Any],
    payload: dict[str, Any],
    *,
    organizacion_id: UUID | None = None,
) -> ContactEnvioResult:
    telefono = _clean_text(detalle.get("phone"))
    if not telefono or not _prospecto_whatsapp_allowed(detalle):
        return ContactEnvioResult(
            estado="omitido",
            detalle={"reason": "whatsapp_no_permitido"},
        )
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    template_sid = _clean_text(metadata.get("twilio_content_sid") or payload.get("twilio_content_sid"))
    variables_def = metadata.get("twilio_variables") or metadata.get("twilio_content_variables")
    context = _build_placeholder_context(detalle, metadata, payload)
    rendered_vars: dict[str, str] | None = None

    wa_result: TwilioSendResult
    preview_text: str | None = None
    if template_sid:
        rendered_vars = _render_twilio_variables(variables_def, context)
        if not rendered_vars:
            rendered_vars = _build_twilio_numeric_variables_from_body(
                body=_clean_text(payload.get("body")) or "",
                context=context,
            )
        missing_vars = _find_blank_twilio_variables(rendered_vars)
        if missing_vars:
            return ContactEnvioResult(
                estado="error",
                detalle={
                    "reason": "whatsapp_template_variables_incompletas",
                    "template_sid": template_sid,
                    "missing_variables": missing_vars,
                },
                error="whatsapp_template_variables_incompletas",
            )
        preview_text = _render_template_text(_clean_text(payload.get("body")) or "", context).strip()
        wa_result = await _send_whatsapp_message(
            to_number=telefono,
            body=None,
            content_sid=template_sid,
            content_variables=rendered_vars,
            organizacion_id=organizacion_id,
        )
        fallback_used = False
        fallback_error: str | None = None
        if wa_result.error and preview_text:
            fallback_result = await _send_whatsapp_message(
                to_number=telefono,
                body=preview_text,
                organizacion_id=organizacion_id,
            )
            if not fallback_result.error:
                wa_result = fallback_result
                fallback_used = True
            else:
                fallback_error = fallback_result.error
    else:
        rendered_body = _render_template_text(_clean_text(payload.get("body")) or "", context).strip()
        if not rendered_body:
            return ContactEnvioResult(
                estado="error",
                detalle={"reason": "whatsapp_payload_incompleto"},
                error="whatsapp_payload_incompleto",
        )
        wa_result = await _send_whatsapp_message(
            to_number=telefono,
            body=rendered_body,
            organizacion_id=organizacion_id,
        )
        preview_text = rendered_body
        fallback_used = False
        fallback_error = None
    estado = "enviado" if not wa_result.error else "error"
    return ContactEnvioResult(
        estado=estado,
        detalle={
            "status": wa_result.status,
            "sid": wa_result.sid,
            "template_sid": template_sid,
            "twilio_variables": rendered_vars if template_sid else None,
            "body_preview": preview_text,
            "fallback_plaintext_used": fallback_used,
            "fallback_error": fallback_error,
        },
        error=wa_result.error,
        mensaje_id=wa_result.sid,
        retryable=bool(wa_result.error),
    )


async def _run_envio_llamada(envio: dict[str, Any], payload: dict[str, Any]) -> ContactEnvioResult:
    telefono = _clean_text(envio.get("phone"))
    if not telefono or not _prospecto_llamada_permitida(envio):
        return ContactEnvioResult(
            estado="omitido",
            detalle={"reason": "llamada_no_permitida"},
        )
    message = _clean_text(payload.get("message")) or "Llamada programada desde Tal IA."
    call_result: VoiceCallResult = await start_outbound_call(
        to_number=telefono,
        message=message,
    )
    if call_result.error:
        return ContactEnvioResult(
            estado="error",
            detalle={"status": call_result.status},
            error=call_result.error,
            retryable=True,
        )
    status_value = (call_result.status or "").lower()
    estado = (
        "enviado"
        if status_value in {"queued", "ringing", "in-progress"}
        else (call_result.status or "enviado")
    )
    return ContactEnvioResult(
        estado=estado,
        detalle={"status": call_result.status, "sid": call_result.sid},
        mensaje_id=call_result.sid,
    )


class ProspeccionContactSender:
    """Procesa envíos pendientes de forma asíncrona."""

    def __init__(
        self,
        *,
        poll_interval: float = 5.0,
        batch_size: int = 25,
        retry_backoff: Sequence[int] = DEFAULT_BACKOFF_SECONDS,
    ) -> None:
        self._poll_interval = poll_interval
        self._batch_size = batch_size
        self._retry_backoff = tuple(int(value) for value in retry_backoff if value > 0) or (
            DEFAULT_BACKOFF_SECONDS
        )
        self._wake_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._enabled = True

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.supabase_url or not settings.supabase_service_role:
            self._enabled = False
            log_event(
                logger,
                "prospeccion.sender_disabled",
                reason="supabase_config_missing",
            )
            return
        self._enabled = True
        self._stop_event.clear()
        self._wake_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="prospeccion-contact-sender")
        log_event(logger, "prospeccion.sender_started")

    async def shutdown(self) -> None:
        if not self._task:
            return
        self._stop_event.set()
        self._wake_event.set()
        try:
            await self._task
        finally:
            self._task = None
        log_event(logger, "prospeccion.sender_stopped")

    def notify_new_envios(self) -> None:
        """Despierta el worker para procesar de inmediato."""
        if not self._task or not self._enabled:
            return
        self._wake_event.set()

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            processed = False
            try:
                processed = await self._process_pending_envios()
            except CRMRepositoryError as exc:
                log_event(logger, "prospeccion.sender_repo_error", error=str(exc))
                processed = False
            except Exception as exc:  # pragma: no cover - fallos inesperados
                logger.exception("prospeccion.sender_unhandled", extra={"error": str(exc)})
                processed = False

            wait_timeout = 0 if processed else self._poll_interval
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=wait_timeout)
            except asyncio.TimeoutError:
                continue
            finally:
                self._wake_event.clear()

    async def _process_pending_envios(self) -> bool:
        repo = CRMRepository()
        envios = await repo.worker_list_pending_envios(limit=self._batch_size)
        if not envios:
            return False

        for envio in envios:
            try:
                await self._process_envio(repo, envio)
            except CRMRepositoryError:
                raise
            except Exception as exc:  # pragma: no cover - protección adicional
                logger.exception(
                    "prospeccion.sender_envio_failed",
                    extra={"envio_id": envio.get("id"), "error": str(exc)},
                )
        return len(envios) >= self._batch_size

    async def _process_envio(self, repo: CRMRepository, envio: dict[str, Any]) -> None:
        envio_id_value = envio.get("id")
        try:
            envio_id = UUID(str(envio_id_value))
        except (TypeError, ValueError):
            log_event(logger, "prospeccion.sender_invalid_envio_id", envio_id=envio_id_value)
            return

        intento_actual = int(envio.get("intento_actual") or 0) + 1
        max_reintentos = max(int(envio.get("max_reintentos") or 1), 1)
        claimed = await repo.worker_mark_envio_processing(
            envio_id=envio_id,
            attempt=intento_actual,
        )
        if not claimed:
            return

        canal = _clean_text(envio.get("canal")) or ""
        detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
        payload = envio.get("payload") if isinstance(envio.get("payload"), dict) else {}

        org_value = envio.get("organizacion_id")
        org_uuid: UUID | None = None
        try:
            org_uuid = UUID(str(org_value)) if org_value else None
        except (TypeError, ValueError):
            org_uuid = None
        prospecto_uuid: UUID | None = None
        raw_prospecto_id = envio.get("prospecto_id")
        if raw_prospecto_id:
            try:
                prospecto_uuid = UUID(str(raw_prospecto_id))
            except (TypeError, ValueError):
                prospecto_uuid = None

        correo_context = _merge_detalle(
            detalle,
            {
                "id": envio.get("id"),
                "prospecto_id": envio.get("prospecto_id"),
            },
        )

        if org_uuid and canal in {"correo", "whatsapp", "llamada"}:
            suppression = await repo.worker_find_active_contact_suppression(
                organizacion_id=org_uuid,
                canal=canal,
                prospecto_id=prospecto_uuid,
                email=_clean_text(detalle.get("email")),
                phone_e164=_clean_text(detalle.get("phone")),
            )
            if suppression:
                result = ContactEnvioResult(
                    estado="omitido",
                    detalle={
                        "reason": "opt_out",
                        "suppression_id": suppression.get("id"),
                        "suppression_canal": suppression.get("canal"),
                        "suppression_motivo": suppression.get("motivo"),
                        "suppression_origen": suppression.get("origen"),
                    },
                    error=None,
                    retryable=False,
                )
            elif canal == "correo":
                result = await _run_envio_correo(
                    correo_context,
                    payload,
                    organizacion_id=org_uuid,
                )
            elif canal == "whatsapp":
                result = await _run_envio_whatsapp(
                    detalle,
                    payload,
                    organizacion_id=org_uuid,
                )
            else:
                result = await _run_envio_llamada(detalle, payload)
        elif canal == "correo":
            result = await _run_envio_correo(
                correo_context,
                payload,
                organizacion_id=org_uuid,
            )
        elif canal == "whatsapp":
            result = await _run_envio_whatsapp(
                detalle,
                payload,
                organizacion_id=org_uuid,
            )
        elif canal == "llamada":
            result = await _run_envio_llamada(detalle, payload)
        else:
            result = ContactEnvioResult(
                estado="omitido",
                detalle={"reason": "canal_no_soportado"},
                error="canal_no_soportado",
            )

        update_payload = self._build_envio_update_payload(
            envio=envio,
            envio_id=envio_id,
            result=result,
            intento=intento_actual,
            max_reintentos=max_reintentos,
        )
        await repo.worker_complete_envio(envio_id=envio_id, payload=update_payload)

        await _broadcast_batch_event(
            batch_id=envio.get("batch_id"),
            payload={
                "type": "envio",
                "envio_id": str(envio_id),
                "estado": update_payload["estado"],
            },
        )
        metrics.increment(canal or "desconocido", update_payload["estado"])

        log_entry = _build_contact_log_entry(
            organizacion_id=envio.get("organizacion_id"),
            prospecto_id=envio.get("prospecto_id"),
            canal=canal,
            estado=result.estado if update_payload["estado"] != "pendiente" else "reintento",
            detalle=result.detalle,
            error=result.error,
            batch_id=envio.get("batch_id"),
            envio_id=envio_id,
        )
        await repo.worker_insert_contact_logs([log_entry])

        if is_promotable_estado(update_payload.get("estado")):
            await auto_promote_prospecto(
                prospecto_id=envio.get("prospecto_id"),
                canal=canal,
                estado=update_payload.get("estado"),
                repo=repo,
            )
            if canal == "whatsapp" and result.mensaje_id:
                await _log_whatsapp_inbox_message(
                    repo=repo,
                    envio=envio,
                    detalle=detalle,
                    payload=payload,
                    result=result,
                )

        batch_id = envio.get("batch_id")
        batch_state: str | None = None
        if batch_id:
            try:
                batch_state = await repo.worker_sync_batch_status(batch_id=UUID(str(batch_id)))
            except (ValueError, CRMRepositoryError):
                log_event(logger, "prospeccion.sender_batch_sync_failed", batch_id=batch_id)
        if batch_state:
            await _broadcast_batch_event(
                batch_id=batch_id,
                payload={
                    "type": "batch",
                    "estado": batch_state,
                },
            )

    def _build_envio_update_payload(
        self,
        *,
        envio: dict[str, Any],
        envio_id: UUID,
        result: ContactEnvioResult,
        intento: int,
        max_reintentos: int,
    ) -> dict[str, Any]:
        now_iso = datetime.now(timezone.utc).isoformat()
        current_detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
        merged_detalle = _merge_detalle(current_detalle, result.detalle)

        payload: dict[str, Any] = {
            "estado": result.estado,
            "detalle": merged_detalle,
            "procesado_en": now_iso,
            "error": result.error,
        }
        if result.mensaje_id:
            payload["mensaje_id"] = result.mensaje_id

        should_retry = result.estado == "error" and result.retryable and intento < max_reintentos
        if should_retry:
            payload["estado"] = "pendiente"
            backoff_seconds = self._next_backoff(intento)
            payload["programado_en"] = (
                datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)
            ).isoformat()
        return payload

    def _next_backoff(self, intento: int) -> int:
        index = max(0, intento - 1)
        if index >= len(self._retry_backoff):
            return self._retry_backoff[-1]
        return self._retry_backoff[index]


contact_sender = ProspeccionContactSender()

__all__ = [
    "ContactEnvioResult",
    "ProspeccionContactSender",
    "contact_sender",
]
