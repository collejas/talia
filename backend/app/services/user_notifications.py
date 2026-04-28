"""Servicios comunes para notificaciones persistentes de usuario."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from app.repositories.crm import CRMRepository
from app.services.ui_realtime_hub import ui_realtime_hub, user_notifications_topic_for_user


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


@dataclass(slots=True)
class UserNotificationAction:
    label: str
    href: str


@dataclass(slots=True)
class UserNotificationCreate:
    organizacion_id: UUID
    usuario_id: UUID
    type: str
    level: Literal["success", "info", "warning", "error"]
    message: str
    title: str | None = None
    category: str | None = None
    entity_kind: str | None = None
    entity_id: str | None = None
    action: UserNotificationAction | None = None
    meta: dict[str, Any] | None = None
    dedupe_key: str | None = None
    group_key: str | None = None
    expires_at: datetime | None = None


def build_user_notification_payload(notification: UserNotificationCreate) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "organizacion_id": str(notification.organizacion_id),
        "usuario_id": str(notification.usuario_id),
        "tipo": notification.type.strip(),
        "nivel": notification.level,
        "mensaje": notification.message.strip(),
        "payload": notification.meta or {},
    }
    if title := _clean_text(notification.title):
        payload["titulo"] = title
    if category := _clean_text(notification.category):
        payload["categoria"] = category
    if entity_kind := _clean_text(notification.entity_kind):
        payload["entity_kind"] = entity_kind
    if entity_id := _clean_text(notification.entity_id):
        payload["entity_id"] = entity_id
    if dedupe_key := _clean_text(notification.dedupe_key):
        payload["dedupe_key"] = dedupe_key
    if group_key := _clean_text(notification.group_key):
        payload["agrupacion_key"] = group_key
    if notification.action:
        payload["action_label"] = notification.action.label.strip()
        payload["action_href"] = notification.action.href.strip()
    if notification.expires_at:
        payload["expires_at"] = notification.expires_at.astimezone(timezone.utc).isoformat()
    return payload


def user_notification_row_to_event(row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    action_label = _clean_text(row.get("action_label") if isinstance(row.get("action_label"), str) else None)
    action_href = _clean_text(row.get("action_href") if isinstance(row.get("action_href"), str) else None)
    event: dict[str, Any] = {
        "id": str(row.get("id") or "").strip() or None,
        "type": str(row.get("tipo") or "").strip() or "notification",
        "level": str(row.get("nivel") or "").strip() or "info",
        "title": _clean_text(row.get("titulo") if isinstance(row.get("titulo"), str) else None),
        "message": str(row.get("mensaje") or "").strip(),
        "organizacion_id": str(row.get("organizacion_id") or "").strip() or None,
        "user_id": str(row.get("usuario_id") or "").strip() or None,
        "entity": {
            "kind": _clean_text(row.get("entity_kind") if isinstance(row.get("entity_kind"), str) else None),
            "id": _clean_text(row.get("entity_id") if isinstance(row.get("entity_id"), str) else None),
        },
        "action": None,
        "meta": payload,
        "dedupe_key": _clean_text(row.get("dedupe_key") if isinstance(row.get("dedupe_key"), str) else None),
        "group_key": _clean_text(row.get("agrupacion_key") if isinstance(row.get("agrupacion_key"), str) else None),
        "read_at": row.get("read_at"),
        "created_at": row.get("created_at") or datetime.now(timezone.utc).isoformat(),
    }
    if action_label and action_href:
        event["action"] = {"label": action_label, "href": action_href}
    return event


async def publish_user_notification_event(row: dict[str, Any]) -> None:
    organizacion_id = str(row.get("organizacion_id") or "").strip()
    usuario_id = str(row.get("usuario_id") or "").strip()
    if not organizacion_id or not usuario_id:
        return
    await ui_realtime_hub.publish(
        user_notifications_topic_for_user(organizacion_id=organizacion_id, usuario_id=usuario_id),
        user_notification_row_to_event(row),
    )


async def create_and_publish_user_notification(
    *,
    repo: CRMRepository,
    notification: UserNotificationCreate,
) -> dict[str, Any]:
    row = await repo.create_ui_notification(payload=build_user_notification_payload(notification))
    await publish_user_notification_event(row)
    return row
