"""Worker asíncrono para procesar envíos de prospección."""

from __future__ import annotations

import asyncio
from collections import deque
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
from app.services.high_demand_mode import high_demand_controller
from app.services import EmailSendError, send_email_detailed, storage, tenant_runtime
from app.services.metrics import metrics
from app.services.phone_utils import normalize_phone
from app.services.prospeccion_auto_promoter import auto_promote_prospecto, is_promotable_estado
from app.services.prospeccion_progress import progress_hub
from app.services.storage import StorageError

logger = get_logger("prospeccion.contact_sender")

DEFAULT_BACKOFF_SECONDS: tuple[int, ...] = (30, 120, 300, 600)
DEFAULT_SENDER_MAX_CONCURRENCY = 5
DEFAULT_SENDER_PER_MINUTE_LIMIT = 40
DEFAULT_SENDER_RATE_LIMIT_DEFER_SECONDS = 20
DEFAULT_SENDER_ERROR_WINDOW_SECONDS = 120
DEFAULT_SENDER_ERROR_THRESHOLD = 5
DEFAULT_SENDER_BACKPRESSURE_COOLDOWN_SECONDS = 60
BACKPRESSURE_TWILIO_ERROR_CODES = {"63024", "63049", "63032"}
PLACEHOLDER_PATTERN = re.compile(r"{{\s*([\w\.-]+)\s*}}")
NUMERIC_PLACEHOLDER_PATTERN = re.compile(r"{{\s*(\d+)\s*}}")
LEGACY_IMAGE_PLACEHOLDER_PATTERN = re.compile(r"{{\s*DATA:IMAGE:[^}]+}}", re.IGNORECASE)
WHATSAPP_IMAGE_PLACEHOLDER_KEYS = {
    "logo_url",
    "hero_image_url",
    "product_image_1_url",
    "product_image_2_url",
    "product_image_3_url",
    "product_image_4_url",
    "warranty_image_url",
}
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
    mensaje_id_interno: str | None = None
    retryable: bool = False


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _detail_email(detail: dict[str, Any]) -> str | None:
    for key in ("correo_principal", "correo_secundario", "email", "correo"):
        value = _clean_text(detail.get(key))
        if value:
            return value
    return None


def _detail_phone(detail: dict[str, Any]) -> str | None:
    for key in (
        "telefono_principal_e164",
        "telefono_movil_1_e164",
        "telefono_e164",
        "phone_e164",
        "phone",
        "telefono",
        "telefono_secundario_e164",
        "telefono_movil_2_e164",
    ):
        value = _clean_text(detail.get(key))
        if value:
            return value
    return None


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
    if "nombre_completo" not in context:
        person_parts = [
            _clean_text(context.get("nombre")),
            _clean_text(context.get("primer_apellido")),
            _clean_text(context.get("segundo_apellido")),
        ]
        nombre_completo = " ".join(part for part in person_parts if part)
        if nombre_completo:
            context["nombre_completo"] = nombre_completo
    if "nombre_completo_con_titulo" not in context:
        titulo = _clean_text(context.get("titulo"))
        nombre_completo = _clean_text(context.get("nombre_completo"))
        if titulo and nombre_completo:
            context["nombre_completo_con_titulo"] = f"{titulo} {nombre_completo}".strip()
    if "telefono" not in context and context.get("phone"):
        context["telefono"] = context["phone"]
    if "empresa" not in context and context.get("nombre_comercial"):
        context["empresa"] = context["nombre_comercial"]
    if "company_name" not in context and context.get("nombre_comercial"):
        context["company_name"] = context["nombre_comercial"]
    if "full_name" not in context and context.get("nombre_completo"):
        context["full_name"] = context["nombre_completo"]
    if "apellido_paterno" not in context and context.get("primer_apellido"):
        context["apellido_paterno"] = context["primer_apellido"]
    if "apellido_materno" not in context and context.get("segundo_apellido"):
        context["apellido_materno"] = context["segundo_apellido"]
    return context


def _render_template_text(template: str, context: dict[str, Any]) -> str:
    if not template:
        return ""

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = context.get(key)
        return "" if value is None else str(value)

    return PLACEHOLDER_PATTERN.sub(_replace, template)


def _build_whatsapp_meta_template_variables(*, body: str | None, context: dict[str, Any]) -> dict[str, str] | None:
    if not body:
        return None
    rendered: dict[str, str] = {}
    seen_tokens: set[str] = set()
    index = 1
    for match in PLACEHOLDER_PATTERN.finditer(body):
        token = _clean_text(match.group(1))
        if not token or token in seen_tokens or token in WHATSAPP_IMAGE_PLACEHOLDER_KEYS:
            continue
        seen_tokens.add(token)
        rendered[str(index)] = _resolve_twilio_variable_value(token, key=token, context=context)
        index += 1
    return rendered or None


def _render_whatsapp_template_preview(*, body: str | None, context: dict[str, Any]) -> str:
    if not body:
        return ""
    preview_context = dict(context)
    for key in WHATSAPP_IMAGE_PLACEHOLDER_KEYS:
        preview_context[key] = ""
    return _render_template_text(body, preview_context)


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


def _preserve_html_line_breaks(body_html: str) -> str:
    """Preserva saltos de línea cuando el usuario escribe texto plano en el campo HTML."""

    if not body_html:
        return body_html
    normalized = body_html.replace("\r\n", "\n")
    if "\n" not in normalized:
        return body_html

    # Si no hay markup, tratarlo como texto y convertir saltos a <br/>.
    if "<" not in normalized and ">" not in normalized:
        escaped = html_lib.escape(normalized).replace("\n", "<br/>\n")
        return escaped

    # Si ya tiene etiquetas de bloque/salto, respetar tal cual.
    if re.search(r"<\s*(br|p|div|li|ul|ol|h[1-6]|table|tr|td|section|article)\b", normalized, re.IGNORECASE):
        return normalized

    # Caso mixto (ej. texto + <a>): preservar saltos de línea.
    return normalized.replace("\n", "<br/>\n")


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


def _apply_tenant_public_base_url_defaults(
    payload: dict[str, Any],
    public_base_url: str | None,
) -> dict[str, Any]:
    if not public_base_url:
        return payload
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}
    merged_metadata = dict(metadata)
    merged_metadata.setdefault("tracking_base_url", public_base_url)
    merged_metadata.setdefault("booking_base_url", public_base_url)
    merged_metadata.setdefault("website_url", public_base_url)
    merged_metadata.setdefault("dominio_principal", public_base_url)
    merged_metadata.setdefault("sitio_web", public_base_url)
    if merged_metadata is metadata:
        return payload
    merged_payload = dict(payload)
    merged_payload["metadata"] = merged_metadata
    return merged_payload


def _build_booking_url(
    *,
    context: dict[str, Any],
    payload: dict[str, Any],
    tracking_url: str | None = None,
    envio_id: Any | None = None,
    prospecto_id: Any | None = None,
) -> str:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    booking_base = (
        _clean_text(metadata.get("booking_base_url"))
        or _clean_text(metadata.get("booking_url"))
        or _clean_text(metadata.get("agenda_url"))
        or _clean_text(metadata.get("demo_url"))
        or "https://talia.mx/demo.html"
    )
    parsed_booking = urlparse(booking_base)
    booking_query = dict(parse_qsl(parsed_booking.query, keep_blank_values=True))

    effective_tracking_url = tracking_url or _build_email_tracking_url(
        context=context,
        payload=payload,
        envio_id=envio_id,
        prospecto_id=prospecto_id,
    )
    parsed_tracking = urlparse(effective_tracking_url)
    tracking_params = dict(parse_qsl(parsed_tracking.query, keep_blank_values=True))
    for key, value in tracking_params.items():
        if key not in booking_query and value:
            booking_query[key] = value
    tenant_alias = _clean_text(metadata.get("tenant_alias") or context.get("tenant_alias"))
    organizacion_id = _clean_text(metadata.get("organizacion_id") or context.get("organizacion_id"))
    if tenant_alias and "tenant_alias" not in booking_query and "ta" not in booking_query:
        booking_query["ta"] = tenant_alias
    if organizacion_id and "organizacion_id" not in booking_query and "oid" not in booking_query:
        booking_query["oid"] = organizacion_id
    booking_query.setdefault("utm_content", "booking_link")
    booking_query.setdefault("intent", "demo_booking")

    return urlunparse(
        (
            parsed_booking.scheme or "https",
            parsed_booking.netloc or "talia.mx",
            parsed_booking.path or "/demo.html",
            "",
            urlencode(booking_query, doseq=True),
            "",
        )
    )


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
            text = _resolve_twilio_variable_value(
                raw_text,
                key=str(key),
                context=context,
                literal_fallback=str(key) == "6",
            )
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


def _resolve_twilio_variable_value(
    raw_value: str,
    *,
    key: str,
    context: dict[str, Any],
    literal_fallback: bool = False,
) -> str:
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

    if literal_fallback:
        return value
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


def _compose_twilio_template_variables(
    *,
    definition: Any,
    body: str | None,
    context: dict[str, Any],
) -> dict[str, str] | None:
    explicit_vars = _render_twilio_variables(definition, context)
    inferred_vars = _build_twilio_numeric_variables_from_body(body=body, context=context)
    if explicit_vars and inferred_vars:
        merged = dict(inferred_vars)
        merged.update(explicit_vars)
        return merged
    return explicit_vars or inferred_vars


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
) -> str | None:
    telefono = normalize_phone(_clean_text(detalle.get("phone")))
    if not telefono:
        return None
    prospecto_id = envio.get("prospecto_id")
    if prospecto_id:
        try:
            await auto_promote_prospecto(
                prospecto_id=prospecto_id,
                canal="whatsapp",
                estado="respondido",
                repo=repo,
                force=True,
            )
        except Exception as exc:  # pragma: no cover - defensivo, no debe bloquear el log
            log_event(
                logger,
                "prospeccion.sender_force_promote_failed",
                prospecto_id=str(prospecto_id),
                envio_id=str(envio.get("id")),
                error=str(exc),
            )

    persona_id = await _resolve_persona_id_for_prospecto(repo=repo, prospecto_id=prospecto_id)
    conversation_id = await _ensure_whatsapp_conversation(repo=repo, persona_id=persona_id) if persona_id else None
    detalle_meta = result.detalle if isinstance(result.detalle, dict) else {}
    body_preview = _clean_text(detalle_meta.get("body_preview"))
    if not body_preview:
        body_preview = _clean_text(payload.get("body"))
    if not body_preview and detalle_meta.get("template_sid"):
        body_preview = f"[Plantilla {detalle_meta.get('template_sid')}]"
    template_name_value = _clean_text(
        detalle_meta.get("template_name") or detalle_meta.get("meta_template_name")
    )
    if not body_preview and template_name_value:
        template_label = template_name_value
        if template_label:
            body_preview = f"[Plantilla {template_label}]"
    payload_meta = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    metadata_payload: dict[str, Any] = {
        "source": "prospeccion",
        "envio_id": str(envio.get("id")) if envio.get("id") else None,
        "batch_id": str(envio.get("batch_id")) if envio.get("batch_id") else None,
        "campana_id": (
            str(envio.get("campana_id"))
            if envio.get("campana_id")
            else _clean_text(payload_meta.get("campana_id"))
        ),
        "delivery_status": detalle_meta.get("status"),
    }
    if detalle_meta.get("template_sid"):
        metadata_payload["twilio_content_sid"] = detalle_meta.get("template_sid")
    if detalle_meta.get("twilio_variables"):
        metadata_payload["twilio_variables"] = detalle_meta.get("twilio_variables")
    if template_name_value:
        metadata_payload["meta_template_name"] = template_name_value
    template_language_value = _clean_text(
        detalle_meta.get("template_language") or detalle_meta.get("meta_template_language")
    )
    if template_language_value:
        metadata_payload["meta_template_language"] = template_language_value
    meta_category_value = _clean_text(
        detalle_meta.get("meta_category")
        or payload.get("meta_category")
        or payload_meta.get("meta_category")
        or payload_meta.get("whatsapp_meta_category_snapshot")
    )
    if meta_category_value:
        metadata_payload["categoria_meta_configurada"] = meta_category_value
    metadata_payload = {k: v for k, v in metadata_payload.items() if v not in (None, "", {})}

    persona_record: dict[str, Any] | None = None
    if persona_id:
        try:
            persona_record = await storage.fetch_persona(persona_id)
        except StorageError:
            persona_record = None
    organizacion_hint = await resolve_whatsapp_organizacion(contact=persona_record)
    if not organizacion_hint:
        organizacion_hint = _clean_text(envio.get("organizacion_id"))
    try:
        storage_result = await storage.register_whatsapp_message(
            direction="saliente",
            wa_id=None,
            phone_e164=telefono,
            body=body_preview,
            message_sid=result.mensaje_id,
            conversation_id=conversation_id,
            contact_id=persona_id,
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
        return None

    resolved_conversation_id = _clean_text(storage_result.get("conversation_id"))
    if resolved_conversation_id:
        inbox_context_patch: dict[str, Any] = {
            "source": "prospeccion",
            "batch_id": metadata_payload.get("batch_id"),
            "campana_id": metadata_payload.get("campana_id"),
            "template_id": _clean_text(payload_meta.get("template_id")),
            "template_slug": _clean_text(payload_meta.get("template_slug")),
            "template_label": _clean_text(
                payload_meta.get("template_label")
                or payload_meta.get("template_nombre")
                or payload_meta.get("template_name")
            ),
            "meta_template_name": _clean_text(payload_meta.get("meta_template_name")),
            "meta_template_language": _clean_text(payload_meta.get("meta_template_language")),
        }
        try:
            await storage.merge_conversation_inbox_context(
                resolved_conversation_id,
                inbox_context_patch,
            )
        except StorageError as exc:
            log_event(
                logger,
                "prospeccion.sender_inbox_context_snapshot_failed",
                envio_id=str(envio.get("id")),
                conversation_id=resolved_conversation_id,
                error=str(exc),
            )
    if prospecto_id and resolved_conversation_id:
        await _bind_prospecto_opportunity_conversation(
            repo=repo,
            prospecto_id=prospecto_id,
            conversation_id=resolved_conversation_id,
            batch_id=metadata_payload.get("batch_id"),
            campana_id=metadata_payload.get("campana_id"),
        )
    return resolved_conversation_id


async def _resolve_persona_id_for_prospecto(
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
    persona_id = metadata.get("crm_contacto_id")
    return str(persona_id) if persona_id else None


async def _ensure_whatsapp_conversation(
    *,
    repo: CRMRepository,
    persona_id: str,
) -> str | None:
    try:
        existing = await repo.get_latest_whatsapp_conversation(persona_id=persona_id)
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "prospeccion.sender_inbox_fetch_conversation_failed",
            persona_id=persona_id,
            error=str(exc),
        )
        existing = None
    if existing and existing.get("id"):
        return str(existing.get("id"))
    try:
        persona_uuid = UUID(str(persona_id))
    except (TypeError, ValueError):
        return None
    try:
        conversation = await repo.create_conversation(contacto_id=persona_uuid, canal="whatsapp")
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "prospeccion.sender_inbox_create_conversation_failed",
            persona_id=persona_id,
            error=str(exc),
        )
        return None
    conversation_id = conversation.get("id") if isinstance(conversation, dict) else None
    return str(conversation_id) if conversation_id else None


async def _bind_prospecto_opportunity_conversation(
    *,
    repo: CRMRepository,
    prospecto_id: Any,
    conversation_id: str,
    batch_id: str | None = None,
    campana_id: str | None = None,
) -> None:
    try:
        prospecto_uuid = UUID(str(prospecto_id))
    except (TypeError, ValueError):
        return
    try:
        prospecto = await repo.worker_get_prospecto(prospecto_id=prospecto_uuid)
    except CRMRepositoryError:
        return
    if not isinstance(prospecto, dict):
        return
    try:
        org_uuid = UUID(str(prospecto.get("organizacion_id")))
    except (TypeError, ValueError):
        return

    metadata = prospecto.get("metadata") if isinstance(prospecto.get("metadata"), dict) else {}
    opportunity_id_value = metadata.get("crm_oportunidad_id")
    opportunity: dict[str, Any] | None = None
    if opportunity_id_value:
        opportunity = {
            "id": opportunity_id_value,
            "organizacion_id": str(org_uuid),
            "metadata": {},
        }
    else:
        try:
            opportunity = await repo.worker_find_opportunity_by_prospecto(
                organizacion_id=org_uuid,
                prospecto_id=prospecto_uuid,
            )
        except CRMRepositoryError:
            opportunity = None
    if not isinstance(opportunity, dict):
        return
    try:
        opportunity_uuid = UUID(str(opportunity.get("id")))
    except (TypeError, ValueError):
        return
    opportunity_metadata = (
        opportunity.get("metadata") if isinstance(opportunity.get("metadata"), dict) else {}
    )
    existing_conversation_id = _clean_text(
        opportunity_metadata.get("conversation_id") or opportunity_metadata.get("conversacion_id")
    )
    if existing_conversation_id == conversation_id:
        return
    patched_metadata = dict(opportunity_metadata)
    patched_metadata["conversation_id"] = conversation_id
    if "conversacion_id" in patched_metadata:
        patched_metadata["conversacion_id"] = conversation_id
    if batch_id and not _clean_text(patched_metadata.get("batch_id")):
        patched_metadata["batch_id"] = batch_id
    if campana_id and not _clean_text(patched_metadata.get("campana_id")):
        patched_metadata["campana_id"] = campana_id
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opportunity_uuid,
            payload={"metadata": patched_metadata},
        )
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "prospeccion.sender_bind_opportunity_conversation_failed",
            prospecto_id=str(prospecto_uuid),
            oportunidad_id=str(opportunity_uuid),
            conversation_id=conversation_id,
            error=str(exc),
        )


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
    template_name: str | None = None,
    template_language: str | None = None,
    header_image_url: str | None = None,
    organizacion_id: UUID | None = None,
) -> TwilioSendResult:
    if not body and not content_sid and not template_name:
        return TwilioSendResult(sid=None, status="skipped", error="empty_body")
    return await _send_whatsapp_reply(
        to_number=to_number,
        body=body or "",
        content_sid=content_sid,
        content_variables=content_variables,
        template_name=template_name,
        template_language=template_language,
        header_image_url=header_image_url,
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
    effective_payload = payload
    if organizacion_id:
        try:
            public_base_url = await tenant_runtime.get_org_public_base_url(organizacion_id=organizacion_id)
        except Exception as exc:  # pragma: no cover - fallback a metadata/valores globales
            log_event(
                logger,
                "prospeccion.sender_public_url_fallback",
                organizacion_id=str(organizacion_id),
                error=str(exc),
            )
            public_base_url = None
        effective_payload = _apply_tenant_public_base_url_defaults(payload, public_base_url)
        template_id_raw = _clean_text(effective_payload.get("template_id"))
        if template_id_raw:
            try:
                image_context = await CRMRepository().list_contact_template_image_context(
                    organizacion_id=organizacion_id,
                    template_id=UUID(template_id_raw),
                )
            except (CRMRepositoryError, TypeError, ValueError) as exc:
                log_event(
                    logger,
                    "prospeccion.sender_template_images_unavailable",
                    organizacion_id=str(organizacion_id),
                    template_id=template_id_raw,
                    error=str(exc),
                )
            else:
                if image_context:
                    merged_metadata = (
                        dict(effective_payload.get("metadata"))
                        if isinstance(effective_payload.get("metadata"), dict)
                        else {}
                    )
                    merged_metadata.update(image_context)
                    effective_payload = {**effective_payload, "metadata": merged_metadata}
    context = _build_placeholder_context(envio, effective_payload, effective_payload.get("metadata"))
    tracking_url = _build_email_tracking_url(
        context=context,
        payload=effective_payload,
        envio_id=envio.get("id"),
        prospecto_id=envio.get("prospecto_id"),
    )
    booking_url = _build_booking_url(
        context=context,
        payload=effective_payload,
        tracking_url=tracking_url,
        envio_id=envio.get("id"),
        prospecto_id=envio.get("prospecto_id"),
    )
    context["tracking_url"] = tracking_url
    context["website_url"] = _resolve_tracking_base_url(effective_payload)
    context["booking_url"] = booking_url
    subject = _render_template_text(subject_template, context).strip()
    body = _render_template_text(str(body_template), context).strip()
    body_html = None
    logo_url = _clean_text(context.get("logo_url"))
    if isinstance(body_html_template, str) and body_html_template.strip():
        normalized_html_template = _normalize_email_html_template(body_html_template)
        body_html = _render_template_text(normalized_html_template, context).strip() or None
    if body_html:
        body_html = _preserve_html_line_breaks(body_html)
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
        headers: dict[str, str] | None = None
        reply_to = _clean_text(getattr(mail_settings, "reply_to", None)) if mail_settings else None
        if reply_to:
            headers = {"Reply-To": reply_to}
        email_result = await asyncio.to_thread(
            send_email_detailed,
            subject=subject,
            body_text=body,
            body_html=body_html,
            recipients=[email_value],
            headers=headers,
            mail_settings=mail_settings,
            brevo_settings=brevo_settings,
            provider_preference="brevo",
            flow="prospeccion_contacto",
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
            "booking_url": booking_url,
            "email_provider": email_result.provider,
            "provider_message_id": email_result.provider_message_id,
            "local_message_id": email_result.local_message_id,
        },
        mensaje_id=email_result.provider_message_id,
        mensaje_id_interno=email_result.local_message_id,
    )


async def _run_envio_whatsapp(
    detalle: dict[str, Any],
    payload: dict[str, Any],
    *,
    organizacion_id: UUID | None = None,
) -> ContactEnvioResult:
    telefono = _detail_phone(detalle)
    if not telefono or not _prospecto_whatsapp_allowed(detalle):
        return ContactEnvioResult(
            estado="omitido",
            detalle={"reason": "whatsapp_no_permitido"},
        )
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    template_sid = _clean_text(metadata.get("twilio_content_sid") or payload.get("twilio_content_sid"))
    meta_template_name = _clean_text(
        metadata.get("meta_template_name")
        or payload.get("meta_template_name")
        or metadata.get("template_name")
        or payload.get("template_name")
    )
    meta_template_language = _clean_text(
        metadata.get("meta_template_language")
        or payload.get("meta_template_language")
        or metadata.get("template_language")
        or payload.get("template_language")
    )
    meta_category = _clean_text(
        payload.get("meta_category")
        or metadata.get("meta_category")
        or metadata.get("whatsapp_meta_category_snapshot")
    )
    variables_def = metadata.get("twilio_variables") or metadata.get("twilio_content_variables")
    context = _build_placeholder_context(detalle, metadata, payload)
    image_context: dict[str, str] = {}
    if organizacion_id:
        template_id_raw = _clean_text(payload.get("template_id"))
        if template_id_raw:
            try:
                image_context = await CRMRepository().list_contact_template_image_context(
                    organizacion_id=organizacion_id,
                    template_id=UUID(template_id_raw),
                )
            except (CRMRepositoryError, TypeError, ValueError) as exc:
                log_event(
                    logger,
                    "prospeccion.sender_template_images_unavailable",
                    organizacion_id=str(organizacion_id),
                    template_id=template_id_raw,
                    error=str(exc),
                )
            else:
                if image_context:
                    merged_metadata = (
                        dict(metadata)
                        if isinstance(metadata, dict)
                        else {}
                    )
                    merged_metadata.update(image_context)
                    metadata = merged_metadata
                    context = _build_placeholder_context(detalle, metadata, payload)
    header_image_url = _clean_text(
        image_context.get("logo_url")
        or image_context.get("hero_image_url")
        or image_context.get("image_url")
        or (metadata.get("media_url_base") if isinstance(metadata, dict) else None)
        or (metadata.get("media_url_tracked") if isinstance(metadata, dict) else None)
        or (metadata.get("logo_url") if isinstance(metadata, dict) else None)
    )
    if not header_image_url and image_context:
        for value in image_context.values():
            header_image_url = _clean_text(value)
            if header_image_url:
                break
    rendered_vars: dict[str, str] | None = None
    body_template = _clean_text(payload.get("body")) or ""
    whatsapp_meta_variables = _build_whatsapp_meta_template_variables(body=body_template, context=context)
    if template_sid or meta_template_name:
        rendered_vars = _compose_twilio_template_variables(
            definition=variables_def,
            body=body_template,
            context=context,
        )
        if meta_template_name and not rendered_vars:
            rendered_vars = whatsapp_meta_variables
        missing_vars = _find_blank_twilio_variables(rendered_vars)
        if missing_vars:
            return ContactEnvioResult(
                estado="error",
                detalle={
                    "reason": "whatsapp_template_variables_incompletas",
                    "template_sid": template_sid,
                    "template_name": meta_template_name,
                    "missing_variables": missing_vars,
                },
                error="whatsapp_template_variables_incompletas",
            )

    wa_result: TwilioSendResult
    preview_text: str | None = None
    if template_sid:
        preview_text = _render_template_text(body_template, context).strip()
        wa_result = await _send_whatsapp_message(
            to_number=telefono,
            body=preview_text,
            content_sid=template_sid,
            content_variables=rendered_vars,
            template_name=meta_template_name,
            template_language=meta_template_language,
            header_image_url=header_image_url,
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
        rendered_body = _render_whatsapp_template_preview(body=body_template, context=context).strip()
        if not rendered_body and not meta_template_name:
            return ContactEnvioResult(
                estado="error",
                detalle={"reason": "whatsapp_payload_incompleto"},
                error="whatsapp_payload_incompleto",
            )
        wa_result = await _send_whatsapp_message(
            to_number=telefono,
            body=rendered_body or None,
            content_variables=rendered_vars,
            template_name=meta_template_name,
            template_language=meta_template_language,
            header_image_url=header_image_url,
            organizacion_id=organizacion_id,
        )
        preview_text = rendered_body or None
        fallback_used = False
        fallback_error = None
    estado = "enviado" if not wa_result.error else "error"
    return ContactEnvioResult(
        estado=estado,
        detalle={
            "status": wa_result.status,
            "sid": wa_result.sid,
            "template_sid": template_sid,
            "template_name": meta_template_name,
            "template_language": meta_template_language,
            "meta_template_name": meta_template_name,
            "meta_template_language": meta_template_language,
            "meta_category": meta_category,
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
    telefono = _detail_phone(envio)
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
        max_concurrency: int = DEFAULT_SENDER_MAX_CONCURRENCY,
        per_minute_limit: int = DEFAULT_SENDER_PER_MINUTE_LIMIT,
        rate_limit_defer_seconds: int = DEFAULT_SENDER_RATE_LIMIT_DEFER_SECONDS,
        error_window_seconds: int = DEFAULT_SENDER_ERROR_WINDOW_SECONDS,
        error_threshold: int = DEFAULT_SENDER_ERROR_THRESHOLD,
        backpressure_cooldown_seconds: int = DEFAULT_SENDER_BACKPRESSURE_COOLDOWN_SECONDS,
    ) -> None:
        self._poll_interval = poll_interval
        self._batch_size = batch_size
        self._max_concurrency = max(1, int(max_concurrency))
        self._per_minute_limit = max(1, int(per_minute_limit))
        self._rate_limit_defer_seconds = max(5, int(rate_limit_defer_seconds))
        self._error_window_seconds = max(30, int(error_window_seconds))
        self._error_threshold = max(1, int(error_threshold))
        self._backpressure_cooldown_seconds = max(10, int(backpressure_cooldown_seconds))
        self._retry_backoff = tuple(int(value) for value in retry_backoff if value > 0) or (
            DEFAULT_BACKOFF_SECONDS
        )
        self._wake_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._enabled = True
        self._throttle_lock = asyncio.Lock()
        self._send_events: dict[tuple[str, str, str], deque[float]] = {}
        self._error_events: dict[tuple[str, str, str], deque[float]] = {}
        self._cooldown_until: dict[tuple[str, str, str], float] = {}

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
        log_event(
            logger,
            "prospeccion.sender_started",
            batch_size=self._batch_size,
            max_concurrency=self._max_concurrency,
            per_minute_limit=self._per_minute_limit,
            rate_limit_defer_seconds=self._rate_limit_defer_seconds,
            error_window_seconds=self._error_window_seconds,
            error_threshold=self._error_threshold,
            backpressure_cooldown_seconds=self._backpressure_cooldown_seconds,
        )

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
        (
            effective_batch_size,
            effective_concurrency,
            high_demand_details,
        ) = await high_demand_controller.get_sender_limits(
            base_batch_size=self._batch_size,
            base_max_concurrency=self._max_concurrency,
        )
        envios = await repo.worker_list_pending_envios(limit=effective_batch_size)
        if not envios:
            return False

        semaphore = asyncio.Semaphore(effective_concurrency)
        if high_demand_details.get("high_demand_mode"):
            log_event(logger, "prospeccion.sender_high_demand_profile", **high_demand_details)
        tasks: list[asyncio.Task[Exception | None]] = []

        async def _run_one(envio: dict[str, Any]) -> Exception | None:
            async with semaphore:
                try:
                    await self._process_envio(repo, envio)
                    return None
                except CRMRepositoryError as exc:
                    return exc
                except Exception as exc:  # pragma: no cover - protección adicional
                    logger.exception(
                        "prospeccion.sender_envio_failed",
                        extra={"envio_id": envio.get("id"), "error": str(exc)},
                    )
                    return None

        for envio in envios:
            tasks.append(asyncio.create_task(_run_one(envio)))
        results = await asyncio.gather(*tasks)
        for maybe_error in results:
            if isinstance(maybe_error, CRMRepositoryError):
                raise maybe_error

        return len(envios) >= effective_batch_size

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

        throttle_key: tuple[str, str, str] | None = None
        if canal in {"correo", "whatsapp", "llamada"}:
            throttle_key = self._throttle_key_for_envio(
                organizacion_id=org_uuid,
                canal=canal,
                detalle=detalle,
            )
            if throttle_key is not None:
                allowed, reason = await self._acquire_send_slot(throttle_key)
                if not allowed:
                    defer_until = (
                        datetime.now(timezone.utc) + timedelta(seconds=self._rate_limit_defer_seconds)
                    ).isoformat()
                    current_detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
                    throttled_detalle = _merge_detalle(
                        current_detalle,
                        {
                            "reason": reason,
                            "throttle_scope": f"{throttle_key[0]}:{throttle_key[1]}:{throttle_key[2]}",
                        },
                    )
                    await repo.worker_complete_envio(
                        envio_id=envio_id,
                        payload={
                            "estado": "pendiente",
                            "programado_en": defer_until,
                            "error": "rate_limited",
                            "detalle": throttled_detalle,
                            "procesado_en": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    log_event(
                        logger,
                        "prospeccion.sender_rate_limited",
                        envio_id=str(envio_id),
                        canal=canal,
                        organizacion_id=str(org_uuid) if org_uuid else None,
                        recipient_scope=throttle_key[2],
                        reason=reason,
                        defer_seconds=self._rate_limit_defer_seconds,
                    )
                    return

        if org_uuid and canal in {"correo", "whatsapp", "llamada"}:
            suppression = await repo.worker_find_active_contact_suppression(
                organizacion_id=org_uuid,
                canal=canal,
                prospecto_id=prospecto_uuid,
                email=_clean_text(detalle.get("email")),
                phone_e164=normalize_phone(_clean_text(detalle.get("phone"))),
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
            extra_backoff_seconds=self._extra_backoff_seconds(result),
        )
        await repo.worker_complete_envio(envio_id=envio_id, payload=update_payload)
        if canal in {"correo", "whatsapp", "llamada"} and throttle_key is not None:
            await self._register_backpressure_signal(throttle_key, result)

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

        # Flujo prospección WhatsApp (outbound): no crear inbox/conversación/oportunidad
        # hasta que exista interacción inbound real del prospecto.
        if is_promotable_estado(update_payload.get("estado")):
            await auto_promote_prospecto(
                prospecto_id=envio.get("prospecto_id"),
                canal=canal,
                estado=update_payload.get("estado"),
                repo=repo,
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
        extra_backoff_seconds: int = 0,
    ) -> dict[str, Any]:
        now_iso = datetime.now(timezone.utc).isoformat()
        current_detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
        merged_detalle = _merge_detalle(current_detalle, result.detalle)
        terminal_ok_states = {"enviado", "entregado", "leido", "completado", "respondido"}
        if result.estado in terminal_ok_states:
            # Limpia marcas transitorias de rate limit cuando el envío ya avanzó correctamente.
            reason = _clean_text(merged_detalle.get("reason"))
            if reason in {"per_minute_limit", "cooldown"}:
                merged_detalle.pop("reason", None)
                merged_detalle.pop("throttle_scope", None)

        payload: dict[str, Any] = {
            "estado": result.estado,
            "detalle": merged_detalle,
            "procesado_en": now_iso,
            "error": result.error,
        }
        if result.mensaje_id:
            payload["mensaje_id"] = result.mensaje_id
        if result.mensaje_id_interno:
            payload["mensaje_id_interno"] = result.mensaje_id_interno

        should_retry = result.estado == "error" and result.retryable and intento < max_reintentos
        if should_retry:
            payload["estado"] = "pendiente"
            backoff_seconds = max(self._next_backoff(intento), max(0, int(extra_backoff_seconds)))
            payload["programado_en"] = (
                datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)
            ).isoformat()
        return payload

    def _next_backoff(self, intento: int) -> int:
        index = max(0, intento - 1)
        if index >= len(self._retry_backoff):
            return self._retry_backoff[-1]
        return self._retry_backoff[index]

    @staticmethod
    def _normalize_recipient_scope(canal: str, detalle: dict[str, Any]) -> str | None:
        canal_key = (canal or "").strip().lower()
        if canal_key == "correo":
            email = _detail_email(detalle)
            return email.lower() if email else None
        if canal_key in {"whatsapp", "llamada"}:
            phone_raw = _detail_phone(detalle)
            if not phone_raw:
                return None
            digits = "".join(ch for ch in phone_raw if ch.isdigit())
            return digits or phone_raw
        return None

    def _throttle_key_for_envio(
        self,
        *,
        organizacion_id: UUID | None,
        canal: str,
        detalle: dict[str, Any],
    ) -> tuple[str, str, str] | None:
        recipient_key = self._normalize_recipient_scope(canal, detalle)
        if not recipient_key:
            return None
        org_key = str(organizacion_id) if organizacion_id else "global"
        channel_key = (canal or "desconocido").strip().lower() or "desconocido"
        return org_key, channel_key, recipient_key

    async def _acquire_send_slot(self, key: tuple[str, str, str]) -> tuple[bool, str]:
        now = asyncio.get_running_loop().time()
        async with self._throttle_lock:
            cooldown_until = self._cooldown_until.get(key, 0.0)
            if cooldown_until > now:
                return False, "cooldown"

            bucket = self._send_events.setdefault(key, deque())
            window_start = now - 60.0
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            if len(bucket) >= self._per_minute_limit:
                return False, "per_minute_limit"
            bucket.append(now)
            return True, "ok"

    async def _register_backpressure_signal(
        self,
        key: tuple[str, str, str],
        result: ContactEnvioResult,
    ) -> None:
        error_signature = self._extract_error_signature(result)
        if not error_signature:
            return

        now = asyncio.get_running_loop().time()
        async with self._throttle_lock:
            bucket = self._error_events.setdefault(key, deque())
            window_start = now - float(self._error_window_seconds)
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            bucket.append(now)
            if len(bucket) < self._error_threshold:
                return
            self._cooldown_until[key] = now + float(self._backpressure_cooldown_seconds)

        log_event(
            logger,
            "prospeccion.sender_backpressure_activated",
            organizacion_scope=key[0],
            canal=key[1],
            recipient_scope=key[2],
            error_signature=error_signature,
            cooldown_seconds=self._backpressure_cooldown_seconds,
            threshold=self._error_threshold,
            window_seconds=self._error_window_seconds,
        )

    @staticmethod
    def _extract_error_signature(result: ContactEnvioResult) -> str | None:
        detail = result.detalle if isinstance(result.detalle, dict) else {}
        reason = _clean_text(detail.get("reason")) or _clean_text(result.error)
        if reason == "whatsapp_template_variables_incompletas":
            return reason
        error_text = (_clean_text(result.error) or "").lower()
        for code in BACKPRESSURE_TWILIO_ERROR_CODES:
            if code in error_text:
                return f"twilio_error_{code}"
        return None

    @staticmethod
    def _extra_backoff_seconds(result: ContactEnvioResult) -> int:
        detail = result.detalle if isinstance(result.detalle, dict) else {}
        reason = _clean_text(detail.get("reason")) or _clean_text(result.error) or ""
        if reason == "whatsapp_template_variables_incompletas":
            return 300
        error_text = (_clean_text(result.error) or "").lower()
        for code in BACKPRESSURE_TWILIO_ERROR_CODES:
            if code in error_text:
                return 180
        return 0


contact_sender = ProspeccionContactSender(
    batch_size=getattr(settings, "prospeccion_sender_batch_size", 25),
    max_concurrency=getattr(settings, "prospeccion_sender_max_concurrency", DEFAULT_SENDER_MAX_CONCURRENCY),
    per_minute_limit=getattr(settings, "prospeccion_sender_per_minute_limit", DEFAULT_SENDER_PER_MINUTE_LIMIT),
    rate_limit_defer_seconds=getattr(
        settings, "prospeccion_sender_rate_limit_defer_seconds", DEFAULT_SENDER_RATE_LIMIT_DEFER_SECONDS
    ),
    error_window_seconds=getattr(
        settings, "prospeccion_sender_error_window_seconds", DEFAULT_SENDER_ERROR_WINDOW_SECONDS
    ),
    error_threshold=getattr(settings, "prospeccion_sender_error_threshold", DEFAULT_SENDER_ERROR_THRESHOLD),
    backpressure_cooldown_seconds=getattr(
        settings,
        "prospeccion_sender_backpressure_cooldown_seconds",
        DEFAULT_SENDER_BACKPRESSURE_COOLDOWN_SECONDS,
    ),
)

__all__ = [
    "ContactEnvioResult",
    "ProspeccionContactSender",
    "contact_sender",
]
