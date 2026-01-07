"""Helper para notificar a vendedores desde el canal webchat."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.whatsapp import service as whatsapp_service
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import storage
from app.services.storage import StorageError

logger = get_logger("app.channels.webchat.notify_sales")


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _extract_contact_email(contact: dict[str, Any] | None) -> str | None:
    if not contact:
        return None
    email = str(contact.get("correo") or "").strip()
    return email or None


def _compose_sales_notification_message(
    *,
    contact: dict[str, Any],
    trigger: str,
    resumen: str | None,
    notes: str | None,
    email: str | None,
) -> str:
    name = str(contact.get("nombre_completo") or "").strip() or "Prospecto sin nombre"
    company = str(contact.get("company_name") or "").strip()
    phone = str(contact.get("telefono_e164") or "").strip()
    lines = [
        "🚀 Tal-IA · Webchat tiene una nueva calificación lista para seguimiento.",
        f"Nombre: {name}",
    ]
    if company:
        lines.append(f"Empresa: {company}")
    if phone:
        lines.append(f"WhatsApp: {phone}")
    if email:
        lines.append(f"Correo: {email}")

    if trigger == "close_lead":
        lines.append("Acción: completó la calificación en webchat.")
    elif trigger == "webchat_escalate":
        lines.append("Acción: superó intentos de reenganche en webchat.")

    if resumen:
        lines.append(f"Necesidad: {resumen}")
    if notes and notes != resumen:
        lines.append(f"Notas: {notes}")

    lines.append("Puedes seguir la conversación desde el panel.")
    return "\n".join(lines)


def _build_template_variables(
    *,
    contact: dict[str, Any],
    resumen: str | None,
    notes: str | None,
    seller_name: str,
) -> dict[str, str]:
    name = str(contact.get("nombre_completo") or "").strip() or "Prospecto Tal-IA"
    summary = resumen or notes or "Pendiente de detalle"
    phone = str(contact.get("telefono_e164") or "").strip()
    company = str(contact.get("company_name") or "").strip()
    return {
        "1": seller_name,
        "2": name,
        "3": company or "Sin empresa",
        "4": summary,
        "5": phone or "N/D",
    }


async def notify_sales_rep(
    *,
    context: ToolRuntimeContext,
    trigger: str,
    contact: dict[str, Any] | None,
    opportunity_id: str | None,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: dict[str, Any] | None = None,
) -> None:
    contact_record = contact or await storage.fetch_contact(context.contact_id)
    if not contact_record:
        logger.warning(
            "webchat.notify_sales.contact_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    org_id = contact_record.get("organizacion_id")
    if not org_id:
        logger.warning(
            "webchat.notify_sales.org_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    opp_id = opportunity_id
    if not opp_id:
        try:
            opp_id = await storage.ensure_conversation_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                channel=context.channel or "webchat",
            )
        except StorageError as exc:
            logger.warning(
                "webchat.notify_sales.ensure_failed",
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
            "webchat.notify_sales.invalid_ids",
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
            "webchat.notify_sales.fetch_opportunity_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    if not opportunity:
        logger.warning(
            "webchat.notify_sales.opportunity_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    notifications = _ensure_dict(metadata.get("sales_notifications"))
    if notifications.get(trigger):
        logger.info(
            "webchat.notify_sales.already_sent",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    assigned = opportunity.get("asignado") or {}
    seller_id = assigned.get("id")
    seller_phone = assigned.get("telefono_e164") or assigned.get("telefono")
    if not seller_id or not seller_phone:
        logger.warning(
            "webchat.notify_sales.no_seller",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
            },
        )
        return

    seller_name = str(assigned.get("nombre_completo") or "").strip() or "Equipo Tal-IA"
    message_body = _compose_sales_notification_message(
        contact=contact_record,
        trigger=trigger,
        resumen=resumen,
        notes=notes,
        email=email,
    )

    template_sid = settings.webchat_sales_template_sid
    template_vars = None
    if template_sid:
        template_vars = _build_template_variables(
            contact=contact_record,
            resumen=resumen,
            notes=notes,
            seller_name=seller_name,
        )

    try:
        send_result = await whatsapp_service.send_manual_message(
            to_number=seller_phone,
            body=message_body if not template_sid else None,
            template_sid=template_sid,
            template_variables=template_vars,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "webchat.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    if send_result.error:
        logger.warning(
            "webchat.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": send_result.error,
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

        if seller_id:
            seller_uuid = UUID(str(seller_id))
            assignment_metadata: dict[str, Any] = {
                "reason": extra or {},
                "notification": {"trigger": trigger, "uses_template": bool(template_sid)},
            }
            await repo.insert_sales_assignment_audit(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
                vendedor_id=seller_uuid,
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                trigger=f"notify_{trigger}",
                metadata=assignment_metadata,
                notification_sid=send_result.sid,
            )
    except (CRMRepositoryError, ValueError) as exc:
        logger.warning(
            "webchat.notify_sales.metadata_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    logger.info(
        "webchat.notify_sales.sent",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "seller_id": seller_id,
        },
    )
