"""Helper para notificar a vendedores desde el canal webchat."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.whatsapp import service as whatsapp_service
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.scoring_contract import (
    build_profile_summary_text as shared_build_profile_summary_text,
)
from app.services.scoring_contract import (
    normalize_required_fields_for_answers as shared_normalize_required_fields_for_answers,
)
from app.services.sales_notifications import (
    build_booking_template_variables as shared_build_booking_template_variables,
)
from app.services.sales_notifications import (
    build_sales_template_variables as shared_build_sales_template_variables,
)
from app.services.sales_notifications import (
    compose_sales_notification_message as shared_compose_sales_notification_message,
)
from app.services import storage, tenant_runtime
from app.services.storage import StorageError

logger = get_logger("app.channels.webchat.notify_sales")

_DEFAULT_REQUIRED_CASE_A_FIELDS: tuple[str, ...] = (
    "financing_type",
    "budget_range",
    "purchase_timeline",
    "decision_authority",
)


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _has_text(value: Any) -> bool:
    return bool(str(value or "").strip())


def _is_answered_scoring_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized not in {"", "unknown", "refused"}
    return True


def _normalize_required_fields_for_answers(
    required_fields: list[str],
    answers: Mapping[str, Any],
) -> list[str]:
    return shared_normalize_required_fields_for_answers(required_fields, answers)


def _extract_scoring_answers(
    *,
    persona: dict[str, Any] | None,
    opportunity_metadata: dict[str, Any],
) -> dict[str, Any]:
    scoring = _ensure_dict(opportunity_metadata.get("lead_scoring"))
    answers = _ensure_dict(scoring.get("answers"))
    if answers:
        return answers
    if not persona:
        return {}
    persona_data = _ensure_dict(persona.get("contacto_datos"))
    persona_scoring = _ensure_dict(persona_data.get("lead_scoring"))
    return _ensure_dict(persona_scoring.get("answers"))


def _extract_profiling_questions(
    *,
    opportunity_metadata: Mapping[str, Any],
    channel: str = "webchat",
) -> dict[str, Any]:
    scoring = _ensure_dict(opportunity_metadata.get("lead_scoring"))
    profiling_by_channel = _ensure_dict(scoring.get("profiling_by_channel"))
    channel_payload = _ensure_dict(profiling_by_channel.get(channel))
    if not channel_payload:
        channel_payload = _ensure_dict(scoring.get("profiling"))
    return _ensure_dict(channel_payload.get("questions"))


def _is_profile_field_answered(
    *,
    field: str,
    answers: Mapping[str, Any],
    profiling_questions: Mapping[str, Any] | None = None,
) -> bool:
    if _is_answered_scoring_value(answers.get(field)):
        return True
    profiling_questions = profiling_questions or {}
    field_payload = _ensure_dict(profiling_questions.get(field))
    status_value = str(field_payload.get("estado_respuesta") or "").strip().lower()
    return status_value in {"answered", "unknown", "refused", "skipped_max_retries"}


def _extract_required_case_a_fields_from_metadata(
    *,
    opportunity_metadata: Mapping[str, Any],
) -> list[str]:
    scoring = _ensure_dict(opportunity_metadata.get("lead_scoring"))
    fields_raw = scoring.get("critical_fields")
    if not isinstance(fields_raw, list):
        return []
    fields: list[str] = []
    for item in fields_raw:
        field = str(item or "").strip()
        if field and field not in fields:
            fields.append(field)
    return fields


async def _load_required_case_a_questions(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    channel: str,
) -> list[str]:
    if not await tenant_runtime.is_profiling_enabled(
        organizacion_id=organizacion_id,
        channel=channel if channel in {"whatsapp", "webchat"} else "webchat",
    ):
        logger.warning(
            "profiling.mode.off",
            extra={
                "organizacion_id": str(organizacion_id),
                "channel": channel,
                "component": "webchat.notify_sales",
            },
        )
        return []

    required_fields: list[str] = []
    try:
        question_rows = await repo.list_scoring_questions(
            organizacion_id=organizacion_id,
            canal=channel if channel in {"whatsapp", "webchat"} else "webchat",
            include_inactive=False,
        )
    except (CRMRepositoryError, AttributeError):
        question_rows = []

    for row in question_rows:
        field_key = str(row.get("field_key") or "").strip()
        if not field_key:
            continue
        if bool(row.get("required_for_case_a")) and field_key not in required_fields:
            required_fields.append(field_key)

    if not required_fields:
        logger.warning(
            "webchat.notify_sales.required_fields_fallback_default",
            extra={
                "organizacion_id": str(organizacion_id),
                "channel": channel,
                "default_required_fields": list(_DEFAULT_REQUIRED_CASE_A_FIELDS),
            },
        )
        required_fields = list(_DEFAULT_REQUIRED_CASE_A_FIELDS)
    return required_fields


def _has_base_fields_for_case_a(persona: dict[str, Any] | None) -> bool:
    if not persona:
        return False
    return _has_text(persona.get("correo")) or _has_text(
        persona.get("telefono_e164") or persona.get("telefono")
    )


def _has_base_fields_for_case_b(persona: dict[str, Any] | None) -> bool:
    if not persona:
        return False
    return _has_text(persona.get("correo")) or _has_text(
        persona.get("telefono_e164") or persona.get("telefono")
    )


async def _has_minimum_profile_for_case_a(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    channel: str,
    persona: dict[str, Any] | None,
    opportunity_metadata: dict[str, Any],
) -> bool:
    if not await tenant_runtime.is_profiling_enabled(
        organizacion_id=organizacion_id,
        channel=channel if channel in {"whatsapp", "webchat"} else "webchat",
    ):
        return True

    answers = _extract_scoring_answers(persona=persona, opportunity_metadata=opportunity_metadata)
    profiling_questions = _extract_profiling_questions(
        opportunity_metadata=opportunity_metadata,
        channel=channel,
    )
    required_fields = _extract_required_case_a_fields_from_metadata(
        opportunity_metadata=opportunity_metadata
    )
    if not required_fields:
        required_fields = await _load_required_case_a_questions(
            repo=repo,
            organizacion_id=organizacion_id,
            channel=channel,
        )
    required_fields = _normalize_required_fields_for_answers(required_fields, answers)
    return all(
        _is_profile_field_answered(
            field=field,
            answers=answers,
            profiling_questions=profiling_questions,
        )
        for field in required_fields
    )


def _is_webchat_reengage_exhausted(persona: dict[str, Any] | None) -> bool:
    if not persona:
        return False
    persona_data = _ensure_dict(persona.get("contacto_datos"))
    webchat_followup = _ensure_dict(persona_data.get("webchat_followup"))
    state = _ensure_dict(webchat_followup.get("state"))
    reengage = _ensure_dict(state.get("reengage"))
    try:
        attempts = max(0, int(reengage.get("attempts") or 0))
    except (TypeError, ValueError):
        attempts = 0
    return attempts >= max(1, int(settings.webchat_reengage_max_attempts))


def _get_primary_notification_by_channel(
    metadata: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    value = _ensure_dict(metadata.get("sales_primary_notifications"))
    out: dict[str, dict[str, Any]] = {}
    for channel, payload in value.items():
        out[str(channel)] = _ensure_dict(payload)
    return out


def _extract_persona_email(persona: dict[str, Any] | None) -> str | None:
    if not persona:
        return None
    for key in ("correo", "email", "correo_principal"):
        email = str(persona.get(key) or "").strip()
        if email:
            return email
    return None


def _build_profile_summary_text(opportunity_metadata: Mapping[str, Any]) -> str | None:
    return shared_build_profile_summary_text(opportunity_metadata)


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
    force_retry: bool = False,
    raise_on_delivery_error: bool = False,
) -> None:
    channel_value = str(getattr(context, "channel", None) or "webchat").strip().lower() or "webchat"
    persona_record = contact or await storage.fetch_contact(context.contact_id)
    if not persona_record:
        logger.warning(
            "webchat.notify_sales.contact_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    org_id = persona_record.get("organizacion_id")
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
                channel=channel_value,
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

    try:
        org_uuid = UUID(str(org_id))
    except (TypeError, ValueError):
        logger.warning(
            "webchat.notify_sales.invalid_org",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return
    whatsapp_settings = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=org_uuid)

    metadata = _ensure_dict(opportunity.get("metadata"))
    extra_payload = dict(extra or {})
    profile_summary = _build_profile_summary_text(metadata)
    if profile_summary:
        extra_payload.setdefault("profile_summary", profile_summary)
    notifications = _ensure_dict(metadata.get("sales_notifications"))
    channel_key = channel_value
    primary_reason: str | None = None
    if trigger == "booking_confirmed":
        if not _has_base_fields_for_case_a(persona_record):
            logger.info(
                "webchat.notify_sales.skip_case_a_base_missing",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        if not await _has_minimum_profile_for_case_a(
            repo=repo,
            organizacion_id=org_uuid,
            channel=channel_key,
            persona=persona_record,
            opportunity_metadata=metadata,
        ):
            logger.info(
                "webchat.notify_sales.skip_case_a_profile_missing",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        primary_reason = "case_a_booking_profile"
    elif trigger == "webchat_escalate":
        if not _has_base_fields_for_case_b(persona_record):
            logger.info(
                "webchat.notify_sales.skip_case_b_base_missing",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        if not _is_webchat_reengage_exhausted(persona_record):
            logger.info(
                "webchat.notify_sales.skip_case_b_reengage_not_exhausted",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        primary_reason = "case_b_reengage_exhausted"
    elif trigger == "webchat_session_closed":
        if notifications.get("booking_confirmed"):
            logger.info(
                "webchat.notify_sales.skip_session_closed_after_booking",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        if not _has_base_fields_for_case_b(persona_record):
            logger.info(
                "webchat.notify_sales.skip_case_c_base_missing",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        primary_reason = "case_c_session_closed"
    elif trigger in {"close_lead", "information_email"}:
        if not _has_base_fields_for_case_b(persona_record):
            logger.info(
                "webchat.notify_sales.skip_case_d_base_missing",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        primary_reason = "case_d_lead_captured"

    primary_by_channel = _get_primary_notification_by_channel(metadata)
    if primary_reason and primary_by_channel.get(channel_key) and not force_retry:
        logger.info(
            "webchat.notify_sales.primary_already_sent",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "channel": channel_key,
            },
        )
        return

    if notifications.get(trigger) and not force_retry:
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
    message_body = shared_compose_sales_notification_message(
        contact=persona_record,
        trigger=trigger,
        resumen=resumen,
        notes=notes,
        email=email,
        extra=extra_payload,
    )

    appointment_template_sid = (
        whatsapp_settings.appointment_template_sid
        or settings.whatsapp_sales_appointment_template_sid
    )
    fallback_template_sid = (
        settings.webchat_sales_template_sid
        or whatsapp_settings.sales_template_sid
        or settings.whatsapp_sales_template_sid
    )

    template_sid: str | None = None
    template_vars: dict[str, str] | None = None
    if trigger == "booking_confirmed" and appointment_template_sid:
        template_sid = appointment_template_sid
        template_vars = shared_build_booking_template_variables(
            contact=persona_record,
            seller_name=seller_name,
            extra=extra_payload,
            include_reason=False,
        )
    else:
        template_sid = fallback_template_sid
        if template_sid:
            template_vars = shared_build_sales_template_variables(
                contact=persona_record,
                resumen=resumen,
                notes=notes,
                seller_name=seller_name,
                email=email,
                extra=extra_payload,
            )

    logger.info(
        "webchat.notify_sales.pre_send",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "seller_id": seller_id,
            "seller_phone": seller_phone,
            "template_sid": template_sid,
            "template_vars": template_vars,
        },
    )

    send_result = None
    try:
        send_result = await whatsapp_service.send_manual_message(
            to_number=seller_phone,
            body=message_body if not template_sid else None,
            template_sid=template_sid,
            template_variables=template_vars,
            organizacion_id=org_uuid,
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
        if raise_on_delivery_error:
            raise RuntimeError(f"sales_notification_delivery_exception:{exc}") from exc
        return

    send_error = getattr(send_result, "error", None) if send_result else None
    if send_error:
        logger.warning(
            "webchat.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": send_error,
            },
        )
        if raise_on_delivery_error:
            raise RuntimeError(f"sales_notification_delivery_error:{send_error}")
        return

    message_sid = getattr(send_result, "sid", None) if send_result else None
    status_value = getattr(send_result, "status", None) if send_result else None
    logger.info(
        "webchat.notify_sales.result",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "template_sid": template_sid,
            "message_sid": message_sid,
            "status": status_value,
            "seller_id": seller_id,
        },
    )

    previous_notification = _ensure_dict(notifications.get(trigger))
    retry_count = 0
    if force_retry:
        try:
            retry_count = max(0, int(previous_notification.get("retry_count") or 0)) + 1
        except (TypeError, ValueError):
            retry_count = 1
    notifications[trigger] = {
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
        "notification_sid": message_sid,
        "retry_count": retry_count,
    }
    metadata["sales_notifications"] = notifications
    if primary_reason:
        primary_by_channel[channel_key] = {
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "conversation_id": context.conversation_id,
            "contact_id": context.contact_id,
            "trigger": trigger,
            "reason": primary_reason,
        }
        metadata["sales_primary_notifications"] = primary_by_channel
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )

        if seller_id and not force_retry:
            seller_uuid = UUID(str(seller_id))
            assignment_metadata: dict[str, Any] = {
                "reason": extra_payload,
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
                notification_sid=message_sid,
                canal="webchat",
            )
    except (CRMRepositoryError, ValueError, TypeError, AttributeError) as exc:
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
