"""Controles para pausar o cancelar ejecuciones del Buscador."""

from __future__ import annotations

from threading import Event, Lock
from typing import Literal, Optional

StopReason = Literal["paused", "canceled"]


class BuscadorJobControl:
    """Permite solicitar la detención (pausa/cancelación) del crawler."""

    def __init__(self) -> None:
        self._stop_event = Event()
        self._lock = Lock()
        self._requested: Optional[StopReason] = None

    def request_pause(self) -> StopReason:
        """Solicita pausar el trabajo (no sobrescribe una cancelación previa)."""

        with self._lock:
            if self._requested == "canceled":
                return "canceled"
            if self._requested is None:
                self._requested = "paused"
                self._stop_event.set()
            return self._requested

    def request_cancel(self) -> StopReason:
        """Solicita cancelar por completo el trabajo."""

        with self._lock:
            if self._requested != "canceled":
                self._requested = "canceled"
                self._stop_event.set()
            return self._requested

    def check_stop(self) -> Optional[StopReason]:
        """Función pensada para que el crawler consulte si debe detenerse."""

        if not self._stop_event.is_set():
            return None
        return self._requested

    @property
    def stop_reason(self) -> Optional[StopReason]:
        """Devuelve el motivo solicitado para detener el job (si existe)."""

        return self._requested
