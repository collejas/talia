"""Contadores y métricas simples para prospección."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from app.core.logging import get_logger

logger = get_logger("prospeccion.metrics")


@dataclass(slots=True)
class MetricsSnapshot:
    por_canal: dict[str, Counter]


class ProspeccionMetrics:
    """Contadores in-memory de resultados por canal."""

    def __init__(self) -> None:
        self._por_canal: dict[str, Counter] = {}

    def increment(self, canal: str, estado: str) -> None:
        canal_key = (canal or "desconocido").strip() or "desconocido"
        estado_key = (estado or "otro").strip() or "otro"
        counter = self._por_canal.setdefault(canal_key, Counter())
        counter[estado_key] += 1
        logger.debug("metrics.increment", extra={"canal": canal_key, "estado": estado_key})

    def snapshot(self) -> MetricsSnapshot:
        data = {canal: counter.copy() for canal, counter in self._por_canal.items()}
        return MetricsSnapshot(por_canal=data)


metrics = ProspeccionMetrics()

__all__ = ["metrics", "ProspeccionMetrics", "MetricsSnapshot"]
