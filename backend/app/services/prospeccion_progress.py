"""Manejador en memoria para eventos de progreso de prospección."""

from __future__ import annotations

import asyncio
from typing import Any


class ProspeccionProgressHub:
    """Gestiona suscripciones y broadcast de eventos por lote."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, batch_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        async with self._lock:
            listeners = self._subscribers.setdefault(batch_id, [])
            listeners.append(queue)
        return queue

    async def unsubscribe(self, batch_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            listeners = self._subscribers.get(batch_id)
            if not listeners:
                return
            try:
                listeners.remove(queue)
            except ValueError:
                return
            if not listeners:
                self._subscribers.pop(batch_id, None)

    async def publish(self, batch_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            listeners = list(self._subscribers.get(batch_id, []))
        if not listeners:
            return
        for queue in listeners:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                continue


progress_hub = ProspeccionProgressHub()

__all__ = ["progress_hub", "ProspeccionProgressHub"]
