"""Funciones específicas del canal WhatsApp para resolver tool calls."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.assistants.tool_runtime import ToolRuntimeContext
from app.core.logging import get_logger
from app.services import send_email, storage
from app.services.email import EmailSendError
from app.services.storage import StorageError

logger = get_logger("app.channels.whatsapp.tools")

INFORMATION_EMAIL_TEMPLATE: dict[str, Any] = {
    "intro": "Gracias por tu interés en Tal-IA. Te comparto un resumen con la información que platicamos:",
    "highlights": [
        "Automatiza la atención 24/7 en webchat, WhatsApp y voz con un solo asistente.",
        "Califica prospectos y agenda demos o recordatorios sin cargar al equipo comercial.",
        "Centraliza conversaciones, métricas y tareas en el panel de Tal-IA para dar seguimiento inteligente.",
    ],
    "resources": [
        {"label": "Sitio de Tal-IA", "url": "https://talia.mx/"},
        {"label": "Geoactiv · Casos y soluciones", "url": "https://geoactiv.ai/"},
    ],
    "closing": "Cuando quieras, puedo ayudarte a agendar una demo personalizada o resolver cualquier duda por este medio.",
    "use_summary": True,
    "use_highlights": True,
    "use_resources": True,
}


def _require(arguments: dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if value is None:
        raise ValueError(f"{key} requerido")
    text = str(value).strip()
    if not text:
        raise ValueError(f"{key} requerido")
    return text


async def execute_tool(
    name: str | None, arguments: Any, context: ToolRuntimeContext
) -> dict[str, Any]:
    if not name:
        raise ValueError("Nombre de función ausente")

    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except json.JSONDecodeError as exc:  # type: ignore[name-defined]
            raise ValueError(f"Arguments inválidos: {arguments!r}") from exc
    elif not isinstance(arguments, dict):
        raise ValueError(f"Tipo de argumentos no soportado: {type(arguments)!r}")

    func = name.strip()
    if func == "set_full_name":
        full_name = _require(arguments, "full_name")
        await storage.update_contact(context.contact_id, {"nombre_completo": full_name})
        return {"status": "ok", "full_name": full_name}

    if func == "set_email":
        email = _require(arguments, "email").lower()
        await storage.update_contact(context.contact_id, {"correo": email})
        return {"status": "ok", "email": email}

    if func == "set_phone_number":
        phone = _require(arguments, "phone_number")
        await storage.update_contact(context.contact_id, {"telefono_e164": phone})
        return {"status": "ok", "phone_number": phone}

    if func == "set_company_name":
        company = _require(arguments, "company_name")
        await storage.update_contact(context.contact_id, {"company_name": company})
        return {"status": "ok", "company_name": company}

    if func == "send_information_email":
        return await _handle_information_email(arguments, context)

    if func == "close_lead":
        return await _handle_close_lead(arguments, context)

    raise ValueError(f"La función '{func}' no está disponible en WhatsApp")


def _clone_template() -> dict[str, Any]:
    template = INFORMATION_EMAIL_TEMPLATE
    return {
        "intro": template["intro"],
        "highlights": list(template["highlights"]),
        "resources": [dict(resource) for resource in template["resources"]],
        "closing": template["closing"],
        "use_summary": template.get("use_summary", True),
        "use_highlights": template.get("use_highlights", True),
        "use_resources": template.get("use_resources", True),
    }


async def _handle_information_email(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    email_value = _require(arguments, "email")
    full_name = str(arguments.get("full_name") or "").strip() or None
    company_name = str(arguments.get("company_name") or "").strip() or None
    summary = str(arguments.get("summary") or "").strip() or None

    highlights: list[str] = []
    for item in arguments.get("highlights", []) or []:
        if isinstance(item, str) and item.strip():
            highlights.append(item.strip())

    resources: list[dict[str, str]] = []
    for item in arguments.get("resources", []) or []:
        if isinstance(item, dict):
            label = str(item.get("label") or "").strip()
            url = str(item.get("url") or "").strip()
            if label and url:
                resources.append({"label": label, "url": url})

    contact = await _resolve_contact(context.contact_id)
    contact_notes = None
    contact_need = None
    if contact:
        contact_name = str(contact.get("nombre_completo") or "").strip() or None
        contact_company = str(contact.get("company_name") or "").strip() or None
        contact_email = str(contact.get("correo") or "").strip() or None
        contact_notes = str(contact.get("notes") or "").strip() or None
        contact_need = str(contact.get("necesidad_proposito") or "").strip() or None
        if not full_name:
            full_name = contact_name
        if not company_name:
            company_name = contact_company
        if not summary:
            summary = contact_need or contact_notes
        if contact_email and contact_email.lower() != email_value.lower():
            try:
                await storage.update_contact(
                    contact.get("id") or context.contact_id, {"correo": email_value.lower()}
                )
            except StorageError as exc:
                logger.warning(
                    "whatsapp.info_email.sync_failed",
                    extra={
                        "contact_id": contact.get("id") or context.contact_id,
                        "error": str(exc),
                    },
                )

    template = _clone_template()
    include_summary = bool(template.get("use_summary", True))
    include_highlights = bool(template.get("use_highlights", True))
    include_resources = bool(template.get("use_resources", True))

    if not include_highlights:
        highlights = []
    elif not highlights:
        highlights = list(template["highlights"])

    if not include_resources:
        resources = []
    elif not resources:
        resources = [dict(resource) for resource in template["resources"]]

    subject_target = company_name or full_name
    subject = (
        f"Tal-IA · Información para {subject_target}"
        if subject_target
        else "Tal-IA · Información solicitada"
    )

    body_lines = [f"Hola {full_name}," if full_name else "Hola,", "", template["intro"]]
    if include_summary and summary:
        body_lines.extend(["", summary])
    if include_highlights and highlights:
        body_lines.append("")
        body_lines.append("Puntos clave para tu equipo:")
        for item in highlights:
            body_lines.append(f"- {item}")
    if include_resources and resources:
        body_lines.append("")
        body_lines.append("Recursos para profundizar:")
        for resource in resources:
            body_lines.append(f"- {resource['label']}: {resource['url']}")
    body_lines.extend(["", template["closing"], "", "Saludos,", "Equipo Geoactiv · Tal-IA"])

    body_text = "\n".join(body_lines)

    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text=body_text,
            recipients=[email_value],
            body_html=None,
            attachments=None,
        )
    except EmailSendError as exc:
        logger.error(
            "whatsapp.info_email.send_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
        raise ValueError(
            "No se pudo enviar el correo en este momento. Inténtalo nuevamente más tarde."
        ) from exc
    except Exception as exc:  # pragma: no cover
        logger.exception(
            "whatsapp.info_email.send_unexpected",
            extra={"conversation_id": context.conversation_id},
        )
        raise ValueError("Ocurrió un error inesperado al enviar el correo.") from exc

    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=summary or contact_notes,
            intencion=contact_need,
            siguiente_accion="informacion_enviada_email",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.info_email.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )

    return {"status": "sent", "email": email_value, "message_id": message_id}


async def _handle_close_lead(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    notes = _require(arguments, "notes")
    necesidad = _require(arguments, "necesidad_proposito")
    siguiente_accion = str(arguments.get("siguiente_accion") or "").strip() or None
    tarjeta_id = None
    try:
        tarjeta_id = await storage.ensure_lead_tarjeta(
            tarjeta_id=None,
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.ensure_tarjeta_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    await storage.update_contact(
        context.contact_id,
        {"notes": notes, "necesidad_proposito": necesidad},
    )
    try:
        await storage.update_conversation(context.conversation_id, {"estado": "pendiente"})
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.conversation_update_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=notes,
            intencion=necesidad,
            siguiente_accion=siguiente_accion,
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )

    return {
        "status": "ok",
        "notes": notes,
        "necesidad_proposito": necesidad,
        "siguiente_accion": siguiente_accion,
        "tarjeta_id": tarjeta_id,
    }


async def _resolve_contact(contact_id: str | None) -> dict[str, Any] | None:
    if not contact_id:
        return None
    try:
        return await storage.fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "whatsapp.tools.contact_lookup_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        return None
