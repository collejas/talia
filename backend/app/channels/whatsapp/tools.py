"""Funciones específicas del canal WhatsApp para resolver tool calls."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
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


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return dict(parsed)
        except json.JSONDecodeError:
            return {}
    return {}


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
        await storage.capture_opportunity_if_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
        return {"status": "ok", "email": email}

    if func == "set_phone_number":
        phone = _require(arguments, "phone_number")
        await storage.update_contact(context.contact_id, {"telefono_e164": phone})
        await storage.capture_opportunity_if_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
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

    oportunidad_id = None
    try:
        oportunidad_id = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.info_email.ensure_opportunity_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )

    await _notify_sales_rep(
        context=context,
        trigger="information_email",
        contact=contact,
        opportunity_id=oportunidad_id,
        resumen=summary or contact_need,
        notes=contact_notes,
        email=email_value,
        extra={"highlights": highlights},
    )

    return {"status": "sent", "email": email_value, "message_id": message_id}


async def _handle_close_lead(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    contact = await _resolve_contact(context.contact_id)
    notes = _require(arguments, "notes")
    necesidad = _require(arguments, "necesidad_proposito")
    siguiente_accion = str(arguments.get("siguiente_accion") or "").strip() or None
    tarjeta_id = None
    try:
        tarjeta_id = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.ensure_opportunity_failed",
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

    await _notify_sales_rep(
        context=context,
        trigger="close_lead",
        contact=contact,
        opportunity_id=tarjeta_id,
        resumen=necesidad,
        notes=notes,
        email=None,
        extra={"siguiente_accion": siguiente_accion},
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


async def _notify_sales_rep(
    *,
    context: ToolRuntimeContext,
    trigger: str,
    contact: dict[str, Any] | None,
    opportunity_id: str | None,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: dict[str, Any] | None,
) -> None:
    contact_record = contact or await _resolve_contact(context.contact_id)
    if not contact_record:
        logger.warning(
            "whatsapp.notify_sales.contact_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return
    org_id = contact_record.get("organizacion_id")
    if not org_id:
        logger.warning(
            "whatsapp.notify_sales.org_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    opp_id = opportunity_id
    if not opp_id:
        try:
            opp_id = await storage.ensure_conversation_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.notify_sales.ensure_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "trigger": trigger,
                    "error": str(exc),
                },
            )
            return

    try:
        org_uuid = UUID(str(org_id))
        opp_uuid = UUID(str(opp_id))
    except (TypeError, ValueError):
        logger.warning(
            "whatsapp.notify_sales.invalid_ids",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.notify_sales.fetch_opportunity_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    if not opportunity:
        logger.warning(
            "whatsapp.notify_sales.opportunity_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    notifications = _ensure_dict(metadata.get("sales_notifications"))
    if notifications.get(trigger):
        logger.info(
            "whatsapp.notify_sales.already_sent",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    assigned = opportunity.get("asignado") or {}
    seller_id = assigned.get("id")
    seller_phone = assigned.get("telefono_e164") or assigned.get("telefono")
    if not seller_id or not seller_phone:
        logger.warning(
            "whatsapp.notify_sales.no_seller",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    message_body = _compose_sales_notification_message(
        contact=contact_record,
        trigger=trigger,
        resumen=resumen,
        notes=notes,
        email=email,
        extra=extra,
    )

    try:
        from app.channels.whatsapp import service as whatsapp_service

        await whatsapp_service.send_manual_message(to_number=seller_phone, body=message_body)
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    notifications[trigger] = {
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
    }
    metadata["sales_notifications"] = notifications
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )

        seller_id_value = assigned.get("id")
        if seller_id_value:
            seller_uuid = UUID(str(seller_id_value))
            await repo.insert_sales_assignment_audit(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
                vendedor_id=seller_uuid,
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                trigger=f"notify_{trigger}",
                metadata={"reason": extra or {}},
            )
    except (ValueError, CRMRepositoryError) as exc:
        logger.warning(
            "whatsapp.notify_sales.metadata_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc)},
        )
        return

    logger.info(
        "whatsapp.notify_sales.sent",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "seller_id": seller_id,
        },
    )


def _compose_sales_notification_message(
    *,
    contact: dict[str, Any],
    trigger: str,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: dict[str, Any] | None,
) -> str:
    name = str(contact.get("nombre_completo") or "").strip() or "Prospecto sin nombre"
    company = str(contact.get("company_name") or "").strip()
    phone = str(contact.get("telefono_e164") or "").strip()
    correo = str(contact.get("correo") or "").strip()
    lines = [
        "🚀 Tal-IA tiene un lead listo para seguimiento.",
        f"Nombre: {name}",
    ]
    if company:
        lines.append(f"Empresa: {company}")
    if phone:
        lines.append(f"WhatsApp: {phone}")
    if correo:
        lines.append(f"Correo: {correo}")

    if trigger == "information_email":
        lines.append("Acción: solicitó información y ya se le envió por correo.")
        if email and email.lower() != correo.lower():
            lines.append(f"Correo confirmado para envío: {email}")
    elif trigger == "close_lead":
        lines.append("Acción: completó la calificación del asistente.")

    if resumen:
        lines.append(f"Necesidad: {resumen}")
    if notes and notes != resumen:
        lines.append(f"Notas: {notes}")
    siguiente = (extra or {}).get("siguiente_accion")
    if siguiente:
        lines.append(f"Siguiente paso sugerido: {siguiente}")

    lines.append("Puedes seguir la conversación desde el panel o responder por WhatsApp.")
    return "\n".join(lines)
