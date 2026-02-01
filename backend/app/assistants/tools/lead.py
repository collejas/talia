"""Shared lead-capture tools for assistant channels."""

from __future__ import annotations

import asyncio
from typing import Any

from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.webchat import notifications as webchat_notifications
from app.channels.webchat import service as webchat_service
from app.core.logging import get_logger
from app.services import send_email, storage, tenant_runtime, webchat_followups
from app.services.email import EmailSendError
from app.services.storage import StorageError

logger = get_logger("app.assistants.tools.lead")

INFORMATION_EMAIL_DEFAULT_TEMPLATE: dict[str, Any] = {
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


def _require_argument(arguments: dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if value is None:
        raise ValueError(f"{key} requerido para la función solicitada")
    text = str(value).strip()
    if not text:
        raise ValueError(f"{key} requerido para la función solicitada")
    return text


def _is_webchat_context(context: ToolRuntimeContext) -> bool:
    channel = (context.channel or "").strip().lower()
    return not channel or channel == "webchat"


async def _refresh_webchat_followup_state(context: ToolRuntimeContext) -> None:
    if not _is_webchat_context(context):
        return
    try:
        await webchat_followups.refresh_contact_followup_state(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            session_id=context.session_id,
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.followup_refresh_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "error": str(exc),
            },
        )


async def _mark_webchat_delivery(context: ToolRuntimeContext, reason: str) -> None:
    if not _is_webchat_context(context):
        return
    try:
        await webchat_followups.mark_information_delivered(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            reason=reason,
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.followup_delivery_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "reason": reason,
                "error": str(exc),
            },
        )


async def try_execute_lead_tool(
    name: str | None,
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any] | None:
    if not name:
        return None
    tool_name = name.strip()
    if tool_name == "set_full_name":
        full_name = _require_argument(arguments, "full_name")
        await storage.update_contact(context.contact_id, {"nombre_completo": full_name})
        return {"status": "ok", "full_name": full_name}

    if tool_name == "set_email":
        email = _require_argument(arguments, "email").lower()
        await storage.update_contact(context.contact_id, {"correo": email})
        await storage.capture_opportunity_if_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        return {"status": "ok", "email": email}

    if tool_name == "set_phone_number":
        phone_number = _require_argument(arguments, "phone_number")
        await storage.update_contact(context.contact_id, {"telefono_e164": phone_number})
        await storage.capture_opportunity_if_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        return {"status": "ok", "phone_number": phone_number}

    if tool_name == "set_company_name":
        company_name = _require_argument(arguments, "company_name")
        await storage.update_contact(context.contact_id, {"company_name": company_name})
        await _refresh_webchat_followup_state(context)
        return {"status": "ok", "company_name": company_name}

    if tool_name == "send_information_email":
        return await _handle_information_email(arguments, context)

    if tool_name == "close_lead":
        notes = _require_argument(arguments, "notes")
        necesidad = _require_argument(arguments, "necesidad_proposito")
        siguiente_accion = str(arguments.get("siguiente_accion") or "").strip() or None
        tarjeta_id: str | None = None
        contact_ready = await webchat_followups.ensure_contact_ready_for_assignment(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
        )
        if contact_ready:
            try:
                tarjeta_id = await storage.ensure_conversation_opportunity(
                    conversation_id=context.conversation_id,
                    contact_id=context.contact_id,
                    channel=context.channel,
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.ensure_opportunity_failed",
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
                "lead_tools.conversation_update_failed",
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
                "lead_tools.insights_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
        await _refresh_webchat_followup_state(context)
        contact_record = None
        if context.contact_id:
            try:
                contact_record = await storage.fetch_contact(context.contact_id)
            except StorageError:
                contact_record = None
        try:
            await webchat_notifications.notify_sales_rep(
                context=context,
                trigger="close_lead",
                contact=contact_record,
                opportunity_id=str(tarjeta_id) if tarjeta_id else None,
                resumen=necesidad,
                notes=notes,
                email=None,
                extra={"siguiente_accion": siguiente_accion},
            )
        except Exception:
            logger.warning(
                "lead_tools.notify_sales_failed",
                extra={"conversation_id": context.conversation_id, "contact_id": context.contact_id},
            )
        return {
            "status": "ok",
            "notes": notes,
            "necesidad_proposito": necesidad,
            "siguiente_accion": siguiente_accion,
            "tarjeta_id": tarjeta_id,
        }

    if tool_name == "mark_contact_ready":
        ready = await webchat_followups.ensure_contact_ready_for_assignment(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
        )
        if not ready:
            raise ValueError("No hay teléfono ni correo para marcar contacto listo")
        _, oportunidad_id = await storage.capture_opportunity_if_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        return {
            "status": "ok",
            "contact_ready": True,
            "oportunidad_id": oportunidad_id,
        }

    if tool_name == "restart_conversation_cycle":
        return await _handle_restart_conversation_cycle(arguments, context)

    return None


async def _handle_information_email(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    email_value = _require_argument(arguments, "email")
    full_name = str(arguments.get("full_name") or "").strip() or None
    company_name = str(arguments.get("company_name") or "").strip() or None
    summary = str(arguments.get("summary") or "").strip() or None

    highlight_lines: list[str] = []
    highlights_raw = arguments.get("highlights")
    if isinstance(highlights_raw, list):
        for item in highlights_raw:
            if isinstance(item, str):
                trimmed = item.strip()
                if trimmed:
                    highlight_lines.append(trimmed)

    resources: list[dict[str, str]] = []
    resources_raw = arguments.get("resources")
    if isinstance(resources_raw, list):
        for item in resources_raw:
            if isinstance(item, dict):
                label = str(item.get("label") or "").strip()
                url = str(item.get("url") or "").strip()
                if label and url:
                    resources.append({"label": label, "url": url})

    contact = await _fetch_contact(context.contact_id)
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
                    "lead_tools.sync_contact_failed",
                    extra={
                        "contact_id": contact.get("id") or context.contact_id,
                "error": str(exc),
            },
        )

    mail_org_uuid = _contact_org_uuid(contact)
    mail_settings = await tenant_runtime.get_mail_runtime_settings(organizacion_id=mail_org_uuid)
    brevo_settings = await tenant_runtime.get_brevo_runtime_settings(organizacion_id=mail_org_uuid)

    template_row: dict[str, Any] | None = None
    try:
        template_row = await storage.fetch_email_template()
    except StorageError as exc:
        logger.warning(
            "lead_tools.template_fetch_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    template_data = _resolve_information_email_template(template_row)

    include_highlights = bool(template_data.get("use_highlights", True))
    include_resources = bool(template_data.get("use_resources", True))

    if not include_highlights:
        highlight_lines = []
    elif not highlight_lines:
        highlight_lines = list(template_data["highlights"])

    if not include_resources:
        resources = []
    elif not resources:
        resources = [dict(resource) for resource in template_data["resources"]]

    subject_target = company_name or full_name
    subject = (
        f"Tal-IA · Información para {subject_target}"
        if subject_target
        else "Tal-IA · Información solicitada"
    )

    body_text = _build_information_email_body(
        template_data=template_data,
        full_name=full_name,
        summary=summary,
        highlights=highlight_lines,
        resources=resources,
    )

    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text=body_text,
            recipients=[email_value],
            body_html=None,
            attachments=None,
            mail_settings=mail_settings,
            brevo_settings=brevo_settings,
        )
    except EmailSendError as exc:
        logger.error(
            "lead_tools.send_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
        raise ValueError(
            "No se pudo enviar el correo en este momento. Inténtalo nuevamente más tarde."
        ) from exc
    except Exception as exc:  # pragma: no cover - errores inesperados
        logger.exception(
            "lead_tools.send_unexpected",
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
            "lead_tools.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    await _mark_webchat_delivery(context, reason="information_email")

    return {
        "status": "sent",
        "email": email_value,
        "message_id": message_id,
    }


async def _handle_restart_conversation_cycle(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    """Crea un nuevo ciclo de conversación cuando el asistente detecta un cambio de tema."""
    reason = str(arguments.get("reason") or "").strip()
    channel = context.channel or "messenger"
    try:
        ensure_payload = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=channel,
            force_new_opportunity_on_restart=True,
            include_restart_metadata=True,
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.restart_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "error": str(exc),
            },
        )
        raise ValueError("No fue posible reiniciar la conversación en este momento.") from exc

    restart_created = False
    restart_sequence = 1
    oportunidad_id: str | None = None
    if isinstance(ensure_payload, dict):
        restart_created = bool(ensure_payload.get("restart_created"))
        restart_sequence = int(ensure_payload.get("restart_sequence") or 1)
        oportunidad_id = ensure_payload.get("oportunidad_id")
    else:
        oportunidad_id = ensure_payload

    if restart_created:
        logger.info(
            "lead_tools.restart_created",
            extra={
                "conversation_id": context.conversation_id,
                "reason": reason,
                "restart_sequence": restart_sequence,
            },
        )

    return {
        "status": "ok",
        "restart_created": restart_created,
        "restart_sequence": restart_sequence,
        "oportunidad_id": oportunidad_id,
        "reason": reason,
    }


async def _fetch_contact(contact_id: str | None) -> dict[str, Any] | None:
    if not contact_id:
        return None
    try:
        return await storage.fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "lead_tools.contact_lookup_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
    return None


def _contact_org_uuid(contact: dict[str, Any] | None) -> UUID | None:
    if not contact:
        return None
    org_value = webchat_service._extract_contact_org(contact)
    if not org_value:
        return None
    resolved = webchat_service._resolve_org_uuid(org_value)
    if not resolved:
        return None
    try:
        return UUID(resolved)
    except ValueError:
        return None


def _clone_information_email_template() -> dict[str, Any]:
    template = INFORMATION_EMAIL_DEFAULT_TEMPLATE
    return {
        "intro": template["intro"],
        "highlights": list(template["highlights"]),
        "resources": [dict(resource) for resource in template["resources"]],
        "closing": template["closing"],
        "use_summary": bool(template.get("use_summary", True)),
        "use_highlights": bool(template.get("use_highlights", True)),
        "use_resources": bool(template.get("use_resources", True)),
    }


def _resolve_information_email_template(custom: dict[str, Any] | None) -> dict[str, Any]:
    template = _clone_information_email_template()
    if not custom:
        return template

    intro = custom.get("intro")
    if isinstance(intro, str) and intro.strip():
        template["intro"] = intro.strip()

    closing = custom.get("closing")
    if isinstance(closing, str) and closing.strip():
        template["closing"] = closing.strip()

    salutation = custom.get("signature_salutation")
    if isinstance(salutation, str) and salutation.strip():
        template["signature_salutation"] = salutation.strip()

    signature_body = custom.get("signature")
    if isinstance(signature_body, str) and signature_body.strip():
        template["signature"] = signature_body.strip()

    highlights = custom.get("highlights")
    if isinstance(highlights, list):
        sanitized: list[str] = []
        for item in highlights:
            if isinstance(item, str):
                trimmed = item.strip()
                if trimmed:
                    sanitized.append(trimmed)
        if sanitized:
            template["highlights"] = sanitized

    resources = custom.get("resources")
    if isinstance(resources, list):
        sanitized_resources: list[dict[str, str]] = []
        for entry in resources:
            if not isinstance(entry, dict):
                continue
            label = str(entry.get("label") or "").strip()
            url = str(entry.get("url") or "").strip()
            if label and url:
                sanitized_resources.append({"label": label, "url": url})
        if sanitized_resources:
            template["resources"] = sanitized_resources

    for key, default in (
        ("use_summary", True),
        ("use_highlights", True),
        ("use_resources", True),
    ):
        value = custom.get(key)
        if isinstance(value, bool):
            template[key] = value
        elif value in {"true", "false"}:
            template[key] = value == "true"

    return template


def _build_information_email_body(
    *,
    template_data: dict[str, Any],
    full_name: str | None,
    summary: str | None,
    highlights: list[str],
    resources: list[dict[str, str]],
) -> str:
    greeting = f"Hola {full_name}," if full_name else "Hola,"
    body_lines = [greeting, "", template_data["intro"]]
    if template_data.get("use_summary", True) and summary:
        body_lines.extend(["", summary])
    if template_data.get("use_highlights", True) and highlights:
        body_lines.append("")
        body_lines.append("Puntos clave para tu equipo:")
        for item in highlights:
            body_lines.append(f"- {item}")
    if template_data.get("use_resources", True) and resources:
        body_lines.append("")
        body_lines.append("Recursos para profundizar:")
        for resource in resources:
            body_lines.append(f"- {resource['label']}: {resource['url']}")
    body_lines.extend(["", template_data["closing"], ""])

    salutation_text = template_data.get("signature_salutation") or "Saludos,"
    if isinstance(salutation_text, str) and salutation_text.strip():
        body_lines.append(salutation_text.strip())

    signature_text = template_data.get("signature") or ""
    signature_lines = []
    if isinstance(signature_text, str):
        signature_lines = [line.strip() for line in signature_text.splitlines() if line.strip()]
    if not signature_lines:
        signature_lines = ["Equipo Geoactiv · Tal-IA"]
    body_lines.extend(signature_lines)
    return "\n".join(body_lines)
