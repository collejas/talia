"""Notificaciones de colaboración para notas y actividades del CRM."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.user_notifications import (
    UserNotificationAction,
    UserNotificationCreate,
    create_and_publish_user_notification,
)


def _safe_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _truncate(value: Any, *, limit: int = 120) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _entity_href(
    *,
    opportunity_id: UUID | None = None,
    persona_id: UUID | None = None,
    cuenta_id: UUID | None = None,
) -> str:
    if opportunity_id:
        return f"/embudo?oportunidadId={opportunity_id}"
    if persona_id:
        return f"/personas/{persona_id}"
    if cuenta_id:
        return f"/cuentas/{cuenta_id}"
    return "/embudo"


async def notify_activity_created(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    activity_row: dict[str, Any],
    actor_user_id: UUID | None,
) -> dict[str, Any] | None:
    activity_id = _safe_uuid(activity_row.get("id"))
    if not activity_id:
        return None
    asunto = _truncate(activity_row.get("asunto") or activity_row.get("tipo") or "Actividad", limit=90)
    opportunity_id = _safe_uuid(activity_row.get("oportunidad_id"))
    contact_id = _safe_uuid(activity_row.get("contacto_id"))
    persona_id = _safe_uuid(activity_row.get("persona_id"))
    cuenta_id = _safe_uuid(activity_row.get("cuenta_id"))
    creator_id = _safe_uuid(activity_row.get("creado_por_usuario_id"))

    recipient_id: UUID | None = None
    if opportunity_id:
        try:
            opportunity_row = await repo.get_opportunity(
                organizacion_id=organizacion_id,
                opportunity_id=opportunity_id,
            )
        except CRMRepositoryError:
            opportunity_row = None
        if isinstance(opportunity_row, dict):
            recipient_id = _safe_uuid(opportunity_row.get("asignado_a_usuario_id")) or _safe_uuid(
                opportunity_row.get("propietario_usuario_id")
            )
            contact_id = contact_id or _safe_uuid(opportunity_row.get("contacto_principal_id"))
            persona_id = persona_id or _safe_uuid(opportunity_row.get("persona_id"))
            cuenta_id = cuenta_id or _safe_uuid(opportunity_row.get("cuenta_id"))

    if recipient_id is None:
        recipient_id = _safe_uuid(activity_row.get("asignado_a_usuario_id")) or _safe_uuid(
            activity_row.get("creado_por_usuario_id")
        )

    if not recipient_id or recipient_id == actor_user_id:
        return None

    notification = UserNotificationCreate(
        organizacion_id=organizacion_id,
        usuario_id=recipient_id,
        type="crm.activity.assigned",
        level="info",
        title="Nueva actividad asignada",
        message=f"Te asignaron una actividad: {asunto}.",
        category="crm",
        entity_kind="actividad",
        entity_id=str(activity_id),
        actividad_id=activity_id,
        persona_id=persona_id,
        cuenta_id=cuenta_id,
        oportunidad_id=opportunity_id,
        action=UserNotificationAction(
            label="Abrir registro",
            href=_entity_href(opportunity_id=opportunity_id, persona_id=persona_id, cuenta_id=cuenta_id),
        ),
        meta={
            "actividad_id": str(activity_id),
            "oportunidad_id": str(opportunity_id) if opportunity_id else None,
            "contacto_id": str(contact_id) if contact_id else None,
            "persona_id": str(persona_id) if persona_id else None,
            "cuenta_id": str(cuenta_id) if cuenta_id else None,
            "asignado_a_usuario_id": str(recipient_id),
            "creado_por_usuario_id": str(creator_id) if creator_id else None,
            "asunto": asunto,
            "tipo": _clean_text(activity_row.get("tipo")) or None,
        },
        dedupe_key=f"crm.activity.assigned:{activity_id}:{recipient_id}",
        group_key=f"crm.activity.assigned:{recipient_id}",
    )
    return await create_and_publish_user_notification(repo=repo, notification=notification)


async def notify_note_created(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    note_row: dict[str, Any],
    actor_user_id: UUID | None,
) -> dict[str, Any] | None:
    note_id = _safe_uuid(note_row.get("id"))
    if not note_id:
        return None

    recipient_id: UUID | None = None
    opportunity_id: UUID | None = None
    contact_id: UUID | None = None
    persona_id: UUID | None = None
    cuenta_id: UUID | None = None
    source_label = _clean_text(note_row.get("relacion_tipo")) or "oportunidad"

    activity_id = _safe_uuid(note_row.get("actividad_id"))
    if activity_id:
        try:
            activity_row = await repo.get_activity(
                organizacion_id=organizacion_id,
                activity_id=activity_id,
            )
        except CRMRepositoryError:
            activity_row = None
        if isinstance(activity_row, dict):
            opportunity_id = _safe_uuid(activity_row.get("oportunidad_id"))
            contact_id = _safe_uuid(activity_row.get("contacto_id"))
            persona_id = _safe_uuid(activity_row.get("persona_id"))
            cuenta_id = _safe_uuid(activity_row.get("cuenta_id"))
            source_label = _clean_text(activity_row.get("asunto")) or source_label

    if recipient_id is None:
        relacion_tipo = _clean_text(note_row.get("relacion_tipo")).lower()
        relacion_id = _safe_uuid(note_row.get("relacion_id"))
        if relacion_tipo == "oportunidad" and relacion_id:
            try:
                opportunity_row = await repo.get_opportunity(
                    organizacion_id=organizacion_id,
                    opportunity_id=relacion_id,
                )
            except CRMRepositoryError:
                opportunity_row = None
            if isinstance(opportunity_row, dict):
                recipient_id = _safe_uuid(opportunity_row.get("asignado_a_usuario_id")) or _safe_uuid(
                    opportunity_row.get("propietario_usuario_id")
                )
                opportunity_id = relacion_id
                contact_id = _safe_uuid(opportunity_row.get("contacto_principal_id"))
                persona_id = _safe_uuid(opportunity_row.get("persona_id"))
                cuenta_id = _safe_uuid(opportunity_row.get("cuenta_id"))
        elif relacion_tipo in {"persona", "cuenta"} and relacion_id:
            if relacion_tipo == "persona":
                persona_id = relacion_id
            else:
                cuenta_id = relacion_id
        elif relacion_tipo == "actividad" and relacion_id:
            try:
                activity_row = await repo.get_activity(
                    organizacion_id=organizacion_id,
                    activity_id=relacion_id,
                )
            except CRMRepositoryError:
                activity_row = None
            if isinstance(activity_row, dict):
                opportunity_id = _safe_uuid(activity_row.get("oportunidad_id"))
                contact_id = _safe_uuid(activity_row.get("contacto_id"))
                persona_id = _safe_uuid(activity_row.get("persona_id"))
                cuenta_id = _safe_uuid(activity_row.get("cuenta_id"))
                source_label = _clean_text(activity_row.get("asunto")) or source_label
                if opportunity_id:
                    try:
                        opportunity_row = await repo.get_opportunity(
                            organizacion_id=organizacion_id,
                            opportunity_id=opportunity_id,
                        )
                    except CRMRepositoryError:
                        opportunity_row = None
                    if isinstance(opportunity_row, dict):
                        recipient_id = _safe_uuid(opportunity_row.get("asignado_a_usuario_id")) or _safe_uuid(
                            opportunity_row.get("propietario_usuario_id")
                        )
                if recipient_id is None:
                    recipient_id = _safe_uuid(activity_row.get("asignado_a_usuario_id")) or _safe_uuid(
                        activity_row.get("creado_por_usuario_id")
                    )

    if not recipient_id or recipient_id == actor_user_id:
        return None

    note_snippet = _truncate(note_row.get("texto") or note_row.get("mensaje") or "", limit=110)
    if note_snippet:
        message = f"Se agregó una nota: {note_snippet}"
    else:
        message = "Se agregó una nota en la oportunidad."

    entity_kind = (
        "oportunidad"
        if opportunity_id
        else "persona"
        if persona_id
        else "cuenta"
        if cuenta_id
        else "actividad"
        if activity_id
        else "nota"
    )
    notification = UserNotificationCreate(
        organizacion_id=organizacion_id,
        usuario_id=recipient_id,
        type="crm.note.created",
        level="info",
        title="Nueva nota en tu registro",
        message=message,
        category="crm",
        entity_kind=entity_kind,
        entity_id=str(opportunity_id or activity_id or note_id),
        actividad_id=activity_id,
        persona_id=persona_id,
        cuenta_id=cuenta_id,
        oportunidad_id=opportunity_id,
        action=UserNotificationAction(
            label="Abrir registro",
            href=_entity_href(opportunity_id=opportunity_id, persona_id=persona_id, cuenta_id=cuenta_id),
        ),
        meta={
            "nota_id": str(note_id),
            "actividad_id": str(activity_id) if activity_id else None,
            "oportunidad_id": str(opportunity_id) if opportunity_id else None,
            "contacto_id": str(contact_id) if contact_id else None,
            "autor_usuario_id": str(actor_user_id) if actor_user_id else None,
            "relacion_tipo": _clean_text(note_row.get("relacion_tipo")) or None,
            "relacion_id": str(note_row.get("relacion_id")) if note_row.get("relacion_id") else None,
            "texto_resumen": note_snippet or None,
            "origen": source_label,
        },
        dedupe_key=f"crm.note.created:{note_id}:{recipient_id}",
        group_key=f"crm.note.created:{recipient_id}",
    )
    return await create_and_publish_user_notification(repo=repo, notification=notification)
