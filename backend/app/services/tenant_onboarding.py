"""Cálculo del avance de configuración visible para un tenant."""

from __future__ import annotations

from typing import Any, Literal


StepStatus = Literal["completado", "en_progreso", "pendiente"]


def _has_text(*values: Any) -> bool:
    return any(isinstance(value, str) and value.strip() for value in values)


def _secret_exists(secrets: list[dict[str, Any]], *parts: str) -> bool:
    normalized = tuple(part.lower() for part in parts)
    return any(
        all(part in str(row.get("clave") or "").lower() for part in normalized)
        for row in secrets
    )


def build_onboarding_progress(
    *,
    tenant: dict[str, Any],
    routes: list[dict[str, Any]],
    secrets: list[dict[str, Any]],
    preferences: dict[str, Any] | None,
) -> dict[str, Any]:
    config = tenant.get("config") if isinstance(tenant.get("config"), dict) else {}
    preferences = preferences or {}
    webchat_decision = str(preferences.get("webchat_decision") or "pendiente")
    voz_decision = str(preferences.get("voz_decision") or "pendiente")

    organization_values = (
        tenant.get("nombre_comercial") or tenant.get("nombre"),
        tenant.get("correo_contacto_principal"),
        tenant.get("telefono"),
        tenant.get("pais"),
        tenant.get("ciudad"),
        tenant.get("timezone"),
        tenant.get("idioma"),
        tenant.get("moneda"),
    )
    organization_done = all(_has_text(value) for value in organization_values)
    ai_done = _secret_exists(secrets, "openai") or _has_text(config.get("openai"))

    active_channels = {
        str(route.get("canal") or "").lower()
        for route in routes
        if route.get("activo") is True
    }
    webchat_done = webchat_decision == "no_usar" or (
        webchat_decision == "usar" and "webchat" in active_channels
    )
    voice_done = voz_decision == "no_usar" or (
        voz_decision == "usar" and ("voz" in active_channels or _secret_exists(secrets, "voice"))
    )
    whatsapp_done = "whatsapp" in active_channels or _has_text(
        (config.get("whatsapp") or {}).get("meta") if isinstance(config.get("whatsapp"), dict) else None
    )
    agenda = config.get("agenda") if isinstance(config.get("agenda"), dict) else {}
    agenda_done = _has_text(agenda.get("zona_horaria"), agenda.get("recurso"))
    correo = config.get("correo") if isinstance(config.get("correo"), dict) else {}
    correo_done = _has_text(correo.get("dominio"), correo.get("remitente"))

    definitions = [
        ("organizacion", "Datos de tu organización", organization_done),
        ("inteligencia", "Conexión de inteligencia", ai_done),
        ("webchat", "Webchat", webchat_done),
        ("whatsapp", "WhatsApp", whatsapp_done),
        ("voz", "Voz", voice_done),
        ("agenda", "Agenda", agenda_done),
        ("correo", "Correo", correo_done),
    ]
    steps: list[dict[str, Any]] = []
    for key, title, done in definitions:
        status: StepStatus = "completado" if done else "pendiente"
        steps.append({"id": key, "titulo": title, "estado": status, "completado": done})

    completed = sum(1 for step in steps if step["completado"])
    first_pending = next((step["id"] for step in steps if not step["completado"]), None)
    if first_pending:
        for step in steps:
            if step["id"] == first_pending:
                step["estado"] = "en_progreso"
                break
    return {
        "porcentaje": round(completed * 100 / len(steps)),
        "completados": completed,
        "total": len(steps),
        "paso_actual": first_pending,
        "ultimo_paso": preferences.get("ultimo_paso"),
        "completado": completed == len(steps),
        "pasos": steps,
    }
