"""Hub in-memory para eventos realtime de UI (SSE)."""

from __future__ import annotations

import asyncio
from typing import Any


class UIRealtimeHub:
    """Gestiona suscripciones por tópico y broadcast no bloqueante."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, topic: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        async with self._lock:
            listeners = self._subscribers.setdefault(topic, [])
            listeners.append(queue)
        return queue

    async def unsubscribe(self, topic: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            listeners = self._subscribers.get(topic)
            if not listeners:
                return
            try:
                listeners.remove(queue)
            except ValueError:
                return
            if not listeners:
                self._subscribers.pop(topic, None)

    async def publish(self, topic: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            listeners = list(self._subscribers.get(topic, []))
        if not listeners:
            return
        for queue in listeners:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                continue


def inbox_topic_for_org(*, organizacion_id: str) -> str:
    return f"inbox:{organizacion_id}"


def prospectos_topic_for_org(*, organizacion_id: str) -> str:
    return f"prospeccion:prospectos:{organizacion_id}"


def user_notifications_topic_for_user(*, organizacion_id: str, usuario_id: str) -> str:
    return f"org:{organizacion_id}:user:{usuario_id}:notifications"


ui_realtime_hub = UIRealtimeHub()

__all__ = [
    "UIRealtimeHub",
    "ui_realtime_hub",
    "inbox_topic_for_org",
    "prospectos_topic_for_org",
    "user_notifications_topic_for_user",
]
