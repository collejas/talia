"""Contabilización de mensajes para el ledger de cobro por tenant."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.repositories.crm import CRMRepository


def _text(value: Any) -> str | None:
    value = str(value or "").strip()
    return value or None


def _provider_from_payload(*, metadata: dict[str, Any], webhook_payload: dict[str, Any] | None) -> str:
    configured = _text(metadata.get("provider"))
    if configured in {"meta", "twilio"}:
        return configured
    raw = webhook_payload or {}
    # Los webhooks Cloud API contienen entry/change/value; no se registra el
    # payload en billing, solo se usa para identificar el proveedor.
    if isinstance(raw, dict) and ("entry" in raw or "change" in raw or "value" in raw):
        return "meta"
    return "twilio"


def _meta_message_fields(
    *, metadata: dict[str, Any], webhook_payload: dict[str, Any] | None
) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "categoria_meta": _text(metadata.get("categoria_meta")) or "unknown",
        "tipo_pricing_meta": _text(metadata.get("tipo_pricing_meta")),
        "billable_meta": metadata.get("billable_meta")
        if isinstance(metadata.get("billable_meta"), bool)
        else None,
        "es_plantilla": bool(metadata.get("es_plantilla", False)),
        "nombre_plantilla": _text(metadata.get("nombre_plantilla") or metadata.get("template_name")),
        "idioma_plantilla": _text(metadata.get("idioma_plantilla") or metadata.get("template_language")),
    }
    raw_message = (webhook_payload or {}).get("message") if isinstance(webhook_payload, dict) else None
    if isinstance(raw_message, dict) and raw_message.get("type") == "template":
        fields["es_plantilla"] = True
    return fields


async def register_message_consumption(
    *,
    repo: CRMRepository,
    organizacion_id: str | None,
    mensaje_id: str | None,
    proveedor_mensaje_id: str | None,
    direccion: str,
    metadata: dict[str, Any] | None = None,
    webhook_payload: dict[str, Any] | None = None,
    fecha_evento: datetime | None = None,
) -> dict[str, Any] | None:
    """Contabiliza un mensaje aceptado sin duplicarlo.

    La función no lanza errores de negocio de billing al flujo de mensajería:
    el caller registra el incidente y conserva la persistencia del mensaje.
    """
    if not organizacion_id or not mensaje_id or not proveedor_mensaje_id:
        return None
    metadata_payload = dict(metadata or {})
    provider = _provider_from_payload(metadata=metadata_payload, webhook_payload=webhook_payload)
    fields = _meta_message_fields(metadata=metadata_payload, webhook_payload=webhook_payload)
    result = await repo.register_billing_message(
        organizacion_id=str(organizacion_id),
        mensaje_id=str(mensaje_id),
        proveedor=provider,
        canal="whatsapp",
        proveedor_mensaje_id=str(proveedor_mensaje_id),
        estado_proveedor=_text(metadata_payload.get("delivery_status")) or "accepted",
        fuente_registro="whatsapp_message_registration",
        fecha_evento=fecha_evento,
        **fields,
    )
    return result


def extract_meta_pricing_fields(raw_payload: dict[str, Any] | None) -> dict[str, Any]:
    """Extrae únicamente las columnas de pricing del status de Meta."""
    status = (raw_payload or {}).get("status") if isinstance(raw_payload, dict) else None
    pricing = status.get("pricing") if isinstance(status, dict) else None
    if not isinstance(pricing, dict):
        return {}
    category = _text(pricing.get("category"))
    pricing_model = _text(pricing.get("pricing_model"))
    billable = pricing.get("billable")
    return {
        "categoria_meta": category,
        "tipo_pricing_meta": pricing_model,
        "billable_meta": billable if isinstance(billable, bool) else None,
    }
