"""Shared lead-capture tools for assistant channels."""

from __future__ import annotations

import asyncio
from typing import Any

from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
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


def _optional_bool_argument(arguments: dict[str, Any], key: str) -> bool | None:
    if key not in arguments:
        return None
    value = arguments.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "si", "sí"}:
        return True
    if text in {"0", "false", "no"}:
        return False
    return None


def _optional_int_argument(arguments: dict[str, Any], key: str) -> int | None:
    if key not in arguments:
        return None
    value = arguments.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return max(0, parsed)


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


async def _notify_webchat_sales_if_needed(
    *,
    context: ToolRuntimeContext,
    trigger: str,
    opportunity_id: str | None,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    persona: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    if not _is_webchat_context(context):
        return
    persona_record = persona
    if not persona_record:
        try:
            persona_record = await storage.fetch_persona(context.contact_id)
        except StorageError as exc:
            logger.warning(
                "lead_tools.notify_sales_contact_fetch_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "trigger": trigger,
                    "error": str(exc),
                },
            )
            persona_record = None

    try:
        from app.channels.webchat import notifications as webchat_notifications

        await webchat_notifications.notify_sales_rep(
            context=context,
            trigger=trigger,
            persona=persona_record,
            opportunity_id=opportunity_id,
            resumen=resumen,
            notes=notes,
            email=email,
            extra=extra or {},
        )
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning(
            "lead_tools.notify_sales_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "trigger": trigger,
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
        await storage.update_persona(context.contact_id, {"nombre_completo": full_name})
        return {"status": "ok", "full_name": full_name}

    if tool_name == "set_email":
        email = _require_argument(arguments, "email").lower()
        await storage.update_persona(context.contact_id, {"correo": email})
        await storage.capture_persona_opportunity_if_ready(
            conversation_id=context.conversation_id,
            persona_id=context.contact_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        return {"status": "ok", "email": email}

    if tool_name == "set_phone_number":
        phone_number = _require_argument(arguments, "phone_number")
        await storage.update_persona(context.contact_id, {"telefono_e164": phone_number})
        await storage.capture_persona_opportunity_if_ready(
            conversation_id=context.conversation_id,
            persona_id=context.contact_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        return {"status": "ok", "phone_number": phone_number}

    if tool_name == "set_company_name":
        company_name = _require_argument(arguments, "company_name")
        await storage.update_persona(context.contact_id, {"company_name": company_name})
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
        await storage.update_persona(
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
        if tarjeta_id:
            scoring_answers = {
                key: arguments.get(key)
                for key in (
                    "financing_type",
                    "credit_preapproved",
                    "budget_range",
                    "down_payment_ready",
                    "purchase_timeline",
                    "hard_deadline",
                    "requirements_defined",
                    "comparison_mode",
                    "visited_properties",
                    "decision_authority",
                    "buyer_type",
                )
                if key in arguments
            }
            action_text = (siguiente_accion or "").lower()
            requested = any(
                token in action_text for token in ("cita", "agendar", "demo", "visita")
            )
            appointment_requested = _optional_bool_argument(arguments, "appointment_requested")
            accepted_questions = _optional_bool_argument(
                arguments, "accepted_answering_questions"
            )
            evasive_count = _optional_int_argument(arguments, "evasive_answers_count")
            response_time_bucket_raw = (
                str(arguments.get("response_time_bucket") or "").strip().lower()
            )
            response_time_bucket = (
                response_time_bucket_raw
                if response_time_bucket_raw in {"fast", "medium", "slow"}
                else None
            )
            scoring_events: dict[str, Any] = {
                "channel": context.channel or "webchat",
                "appointment_requested": (
                    appointment_requested
                    if appointment_requested is not None
                    else requested
                ),
                "accepted_answering_questions": (
                    accepted_questions
                    if accepted_questions is not None
                    else bool(scoring_answers)
                ),
            }
            if evasive_count is not None:
                scoring_events["evasive_answers_count"] = evasive_count
            if response_time_bucket is not None:
                scoring_events["response_time_bucket"] = response_time_bucket
            profiling_statuses_raw = (
                arguments.get("profiling_statuses")
                if isinstance(arguments.get("profiling_statuses"), dict)
                else arguments.get("perfilamiento_estados")
            )
            profiling_reprompt_counts_raw = (
                arguments.get("profiling_reprompt_counts")
                if isinstance(arguments.get("profiling_reprompt_counts"), dict)
                else arguments.get("perfilamiento_repregunta_counts")
            )
            profiling_statuses = (
                profiling_statuses_raw
                if isinstance(profiling_statuses_raw, dict)
                else None
            )
            profiling_reprompt_counts = (
                profiling_reprompt_counts_raw
                if isinstance(profiling_reprompt_counts_raw, dict)
                else None
            )
            try:
                await storage.apply_persona_lead_scoring(
                    conversation_id=context.conversation_id,
                    persona_id=context.contact_id,
                    opportunity_id=str(tarjeta_id),
                    answers=scoring_answers,
                    events=scoring_events,
                    profiling_statuses=profiling_statuses,
                    profiling_reprompt_counts=profiling_reprompt_counts,
                    source="close_lead",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.scoring_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
            try:
                await storage.maybe_promote_prequalified_from_scoring(
                    conversation_id=context.conversation_id,
                    contact_id=context.contact_id,
                    opportunity_id=str(tarjeta_id),
                    channel=context.channel or "webchat",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.prequalified_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        await _refresh_webchat_followup_state(context)
        persona_record = None
        if context.contact_id:
            try:
                persona_record = await storage.fetch_persona(context.contact_id)
            except StorageError:
                persona_record = None
        if tarjeta_id:
            try:
                await storage.maybe_auto_name_persona_opportunity(
                    conversation_id=context.conversation_id,
                    persona_id=context.contact_id,
                    opportunity_id=str(tarjeta_id),
                    intent=necesidad,
                    summary=notes,
                    channel=context.channel or "webchat",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.auto_name_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        await _notify_webchat_sales_if_needed(
            context=context,
            trigger="close_lead",
            opportunity_id=tarjeta_id,
            resumen=necesidad,
            notes=notes,
            email=(persona_record or {}).get("correo") if persona_record else None,
            persona=persona_record,
            extra={"source": "lead_tool_close_lead"},
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
        _, oportunidad_id = await storage.capture_persona_opportunity_if_ready(
            conversation_id=context.conversation_id,
            persona_id=context.contact_id,
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

    persona = await _fetch_persona(context.contact_id)
    persona_notes = None
    persona_need = None
    if persona:
        contact_name = str(persona.get("nombre_completo") or "").strip() or None
        contact_company = str(persona.get("company_name") or "").strip() or None
        contact_email = str(persona.get("correo") or "").strip() or None
        persona_notes = str(persona.get("notes") or "").strip() or None
        persona_need = str(persona.get("necesidad_proposito") or "").strip() or None
        if not full_name:
            full_name = contact_name
        if not company_name:
            company_name = contact_company
        if not summary:
            summary = persona_need or persona_notes
        if contact_email and contact_email.lower() != email_value.lower():
            try:
                await storage.update_persona(
                    persona.get("id") or context.contact_id, {"correo": email_value.lower()}
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.sync_contact_failed",
                    extra={
                        "contact_id": persona.get("id") or context.contact_id,
                        "error": str(exc),
                    },
                )

    mail_org_uuid = _persona_org_uuid(persona)
    mail_settings = await tenant_runtime.get_mail_runtime_settings(organizacion_id=mail_org_uuid)

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
            provider_preference="smtp",
            flow="assistant_information_email",
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
            resumen=summary or persona_notes,
            intencion=persona_need,
            siguiente_accion="informacion_enviada_email",
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    await _mark_webchat_delivery(context, reason="information_email")
    await _notify_webchat_sales_if_needed(
        context=context,
        trigger="information_email",
        opportunity_id=None,
        resumen=summary or persona_need,
        notes=persona_notes,
        email=email_value,
        persona=persona,
        extra={"source": "lead_tool_information_email", "mail_message_id": message_id},
    )

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


async def _fetch_persona(contact_id: str | None) -> dict[str, Any] | None:
    if not contact_id:
        return None
    try:
        return await storage.fetch_persona(contact_id)
    except StorageError as exc:
        logger.warning(
            "lead_tools.contact_lookup_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
    return None


def _persona_org_uuid(persona: dict[str, Any] | None) -> UUID | None:
    if not persona:
        return None
    org_value = webchat_service._extract_persona_org(persona)
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
