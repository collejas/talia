"""Helpers compartidos para construir notificaciones comerciales."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from app.core.config import settings


def _contact_name(contact: Mapping[str, Any]) -> str:
    return str(contact.get("nombre_completo") or "").strip() or "No dio nombre"


def _extract_contact_location(contact: Mapping[str, Any]) -> str:
    raw_data = contact.get("contacto_datos") or {}
    if isinstance(raw_data, str):
        try:
            raw_data = json.loads(raw_data)
        except json.JSONDecodeError:
            raw_data = {}
    ubicacion = raw_data.get("ubicacion") or {}
    if isinstance(ubicacion, str):
        try:
            ubicacion = json.loads(ubicacion)
        except json.JSONDecodeError:
            ubicacion = {}
    parts: list[str] = []
    for field in ("nom_mun", "nom_ent"):
        candidate = ubicacion.get(field)
        if isinstance(candidate, str):
            candidate = candidate.strip()
        if candidate:
            parts.append(candidate)
    if not parts:
        fallback = raw_data.get("formatted_address") or raw_data.get("direccion")
        if fallback:
            parts.append(str(fallback).strip())
    if not parts:
        return "Pendiente de confirmación"
    return ", ".join(parts)


def _extract_model_description(contact: Mapping[str, Any]) -> str:
    for key in ("notes", "necesidad_proposito"):
        candidate = contact.get(key)
        if isinstance(candidate, str):
            cleaned = candidate.strip()
            if cleaned:
                return cleaned.split("\n", 1)[0]
    return "Modelo pendiente"


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _format_booking_datetime(value: datetime | None) -> tuple[str, str]:
    if not value:
        return "Pendiente", "Pendiente"
    tz_name = settings.webchat_calendar_timezone or "UTC"
    try:
        target_tz = ZoneInfo(tz_name)
    except Exception:
        target_tz = timezone.utc
    localized = value.astimezone(target_tz)
    return localized.strftime("%d/%m/%Y"), localized.strftime("%H:%M")


def compose_sales_notification_message(
    *,
    contact: Mapping[str, Any],
    trigger: str,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: Mapping[str, Any] | None,
) -> str:
    company = str(contact.get("company_name") or "").strip()
    phone = str(contact.get("telefono_e164") or contact.get("telefono") or "").strip()
    correo = str(email or contact.get("correo") or "").strip()

    lines = [
        "🚀 Tal-IA tiene un lead listo para seguimiento.",
        f"Nombre: {_contact_name(contact)}",
    ]
    if company:
        lines.append(f"Empresa: {company}")
    if phone:
        lines.append(f"WhatsApp: {phone}")
    if correo:
        lines.append(f"Correo: {correo}")

    action_map = {
        "information_email": "Acción: solicitó información por correo.",
        "close_lead": "Acción: completó la calificación del asistente.",
        "booking_confirmed": "Acción: agendó una cita.",
        "booking_canceled": "Acción: canceló la cita.",
        "webchat_escalate": "Acción: superó intentos de reenganche.",
        "webchat_session_closed": "Acción: cerró sesión en webchat con lead pendiente.",
        "followup_escalate": "Acción: superó intentos de reenganche.",
    }
    action_text = action_map.get(trigger)
    if action_text:
        lines.append(action_text)

    reason = str((extra or {}).get("reason") or "").strip()
    if trigger == "booking_canceled" and reason:
        lines.append(f"Motivo: {reason}")

    if resumen:
        lines.append(f"Necesidad: {resumen}")
    if notes and notes != resumen:
        lines.append(f"Notas: {notes}")

    profile_summary = str((extra or {}).get("profile_summary") or "").strip()
    if profile_summary:
        lines.append(f"Perfilamiento: {profile_summary}")

    next_action = str((extra or {}).get("siguiente_accion") or "").strip()
    if next_action:
        lines.append(f"Siguiente paso sugerido: {next_action}")

    lines.append("Puedes seguir la conversación desde el panel.")
    return "\n".join(lines)


def build_sales_template_variables(
    *,
    contact: Mapping[str, Any],
    resumen: str | None,
    notes: str | None,
    extra: Mapping[str, Any] | None,
    seller_name: str,
    email: str | None,
) -> dict[str, str]:
    summary_text = resumen or notes or "Pendiente de detalle"
    next_action = str((extra or {}).get("siguiente_accion") or "").strip()
    phone = str(contact.get("telefono_e164") or contact.get("telefono") or "").strip()
    company = str(contact.get("company_name") or "").strip()
    email_value = str(email or contact.get("correo") or "").strip()
    return {
        "1": seller_name,
        "2": _contact_name(contact),
        "3": summary_text,
        "4": next_action or "Contacta y confirma próximos pasos.",
        "5": phone or "N/D",
        "6": email_value or "N/D",
        "7": company or "Sin empresa",
    }


def build_booking_template_variables(
    *,
    contact: Mapping[str, Any],
    seller_name: str,
    extra: Mapping[str, Any] | None,
    include_reason: bool = False,
) -> dict[str, str]:
    slot_iso = (extra or {}).get("slot_start")
    date_text, time_text = _format_booking_datetime(_parse_iso_datetime(slot_iso))
    model = _extract_model_description(contact)
    profile_summary = str((extra or {}).get("profile_summary") or "").strip()
    if profile_summary:
        model = f"{model}. {profile_summary}"
        if len(model) > 500:
            model = model[:499].rstrip() + "…"
    location = _extract_contact_location(contact)
    phone = str(contact.get("telefono_e164") or contact.get("telefono") or "N/D").strip() or "N/D"
    variables = {
        "1": seller_name,
        "2": _contact_name(contact),
        "3": date_text,
        "4": time_text,
        "5": model,
        "6": location,
        "7": phone,
    }
    if include_reason:
        reason = str((extra or {}).get("reason") or "").strip() or "Sin motivo especificado"
        variables["8"] = reason
    return variables
