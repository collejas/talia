"""Controlador de observabilidad y modo automático de alta demanda."""

from __future__ import annotations

import asyncio
import math
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger("app.services.high_demand_mode")

_MIN_SNAPSHOT_WINDOW_SECONDS = 60
_MAX_SNAPSHOT_WINDOW_SECONDS = 3600
_DEFAULT_WINDOW_SECONDS = 300


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    rank = max(0, min(len(values) - 1, math.ceil((percentile / 100) * len(values)) - 1))
    return values[rank]


class HighDemandController:
    """Mantiene KPIs operativos y evalúa activación del modo alta demanda."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._inbound_events: deque[tuple[float, str]] = deque()
        self._assistant_latency_ms: deque[tuple[float, str, float]] = deque()
        self._inbox_threads_latency_ms: deque[tuple[float, float]] = deque()
        self._twilio_attempt_events: deque[tuple[float, str | None]] = deque()
        self._last_queue_depth: int = 0
        self._last_queue_depth_at: float = 0.0
        self._mode_active: bool = False
        self._mode_reasons: list[str] = []
        self._mode_last_changed_at: str | None = None
        self._inbox_alert_consecutive = 0
        self._assistant_alert_consecutive = 0
        self._twilio_alert_consecutive = 0
        self._queue_pressure_consecutive = 0
        self._recovery_consecutive = 0

    def _trim_old(self, *, now: float, window_seconds: int) -> None:
        cutoff = now - window_seconds
        for dq in (
            self._inbound_events,
            self._assistant_latency_ms,
            self._inbox_threads_latency_ms,
            self._twilio_attempt_events,
        ):
            while dq and dq[0][0] < cutoff:
                dq.popleft()

    async def record_inbound(self, *, channel: str) -> None:
        now = time.monotonic()
        channel_name = str(channel or "unknown").strip().lower() or "unknown"
        async with self._lock:
            self._inbound_events.append((now, channel_name))
            self._trim_old(now=now, window_seconds=_MAX_SNAPSHOT_WINDOW_SECONDS)

    async def record_assistant_latency(self, *, channel: str, latency_ms: float) -> None:
        now = time.monotonic()
        channel_name = str(channel or "unknown").strip().lower() or "unknown"
        async with self._lock:
            self._assistant_latency_ms.append((now, channel_name, max(0.0, float(latency_ms))))
            self._trim_old(now=now, window_seconds=_MAX_SNAPSHOT_WINDOW_SECONDS)

    async def record_inbox_threads_latency(self, *, latency_ms: float) -> None:
        now = time.monotonic()
        async with self._lock:
            self._inbox_threads_latency_ms.append((now, max(0.0, float(latency_ms))))
            self._trim_old(now=now, window_seconds=_MAX_SNAPSHOT_WINDOW_SECONDS)

    async def record_twilio_attempt(self, *, error_code: str | None = None) -> None:
        now = time.monotonic()
        code = str(error_code).strip() if error_code is not None else None
        if code == "":
            code = None
        async with self._lock:
            self._twilio_attempt_events.append((now, code))
            self._trim_old(now=now, window_seconds=_MAX_SNAPSHOT_WINDOW_SECONDS)

    async def set_queue_depth(self, *, queue_depth: int) -> None:
        async with self._lock:
            self._last_queue_depth = max(0, int(queue_depth))
            self._last_queue_depth_at = time.monotonic()

    async def snapshot(self, *, window_seconds: int | None = None) -> dict[str, Any]:
        now = time.monotonic()
        effective_window = int(window_seconds or _DEFAULT_WINDOW_SECONDS)
        effective_window = max(_MIN_SNAPSHOT_WINDOW_SECONDS, min(_MAX_SNAPSHOT_WINDOW_SECONDS, effective_window))
        cutoff = now - effective_window
        async with self._lock:
            self._trim_old(now=now, window_seconds=_MAX_SNAPSHOT_WINDOW_SECONDS)

            inbound = [channel for ts, channel in self._inbound_events if ts >= cutoff]
            assistant_latencies = [
                latency
                for ts, _, latency in self._assistant_latency_ms
                if ts >= cutoff
            ]
            inbox_latencies = [latency for ts, latency in self._inbox_threads_latency_ms if ts >= cutoff]
            twilio_attempts = [code for ts, code in self._twilio_attempt_events if ts >= cutoff]

            inbound_count = len(inbound)
            inbound_per_minute = round((inbound_count / max(effective_window, 1)) * 60, 2)
            assistant_sorted = sorted(assistant_latencies)
            inbox_sorted = sorted(inbox_latencies)
            twilio_total = len(twilio_attempts)
            twilio_errors = [code for code in twilio_attempts if code]
            twilio_error_counts: dict[str, int] = {}
            for code in twilio_errors:
                twilio_error_counts[code] = twilio_error_counts.get(code, 0) + 1
            twilio_error_rate = (len(twilio_errors) / twilio_total) if twilio_total else 0.0

            return {
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "window_seconds": effective_window,
                "kpis": {
                    "inbound_count": inbound_count,
                    "inbound_per_minute": inbound_per_minute,
                    "assistant_reply_latency_p95_ms": round(_percentile(assistant_sorted, 95), 2),
                    "inbox_threads_latency_p95_ms": round(_percentile(inbox_sorted, 95), 2),
                    "twilio_error_rate": round(twilio_error_rate, 4),
                    "twilio_error_counts": twilio_error_counts,
                    "queue_depth": int(self._last_queue_depth),
                },
                "mode": {
                    "active": self._mode_active,
                    "reasons": list(self._mode_reasons),
                    "last_changed_at": self._mode_last_changed_at,
                },
            }

    async def evaluate_mode(self, *, snapshot: dict[str, Any]) -> dict[str, Any]:
        kpis = snapshot.get("kpis") if isinstance(snapshot, dict) else {}
        if not isinstance(kpis, dict):
            kpis = {}
        assistant_p95 = float(kpis.get("assistant_reply_latency_p95_ms") or 0.0)
        inbox_p95 = float(kpis.get("inbox_threads_latency_p95_ms") or 0.0)
        twilio_error_rate = float(kpis.get("twilio_error_rate") or 0.0)
        queue_depth = int(kpis.get("queue_depth") or 0)

        interval_seconds = max(30, int(getattr(settings, "high_demand_runner_interval_seconds", 60)))
        inbox_threshold = float(getattr(settings, "high_demand_inbox_p95_alert_ms", 3000))
        assistant_threshold = float(getattr(settings, "high_demand_assistant_p95_alert_ms", 60000))
        twilio_threshold = float(getattr(settings, "high_demand_twilio_error_rate_alert", 0.12))
        queue_threshold = int(getattr(settings, "high_demand_queue_depth_threshold", 250))
        queue_recovery = int(getattr(settings, "high_demand_queue_depth_recovery_threshold", 120))
        latency_required_minutes = max(1, int(getattr(settings, "high_demand_latency_alert_minutes", 5)))
        twilio_required_minutes = max(1, int(getattr(settings, "high_demand_twilio_alert_minutes", 10)))
        activation_consecutive = max(1, int(getattr(settings, "high_demand_activation_consecutive", 2)))
        recovery_consecutive = max(1, int(getattr(settings, "high_demand_recovery_consecutive", 3)))

        latency_required_consecutive = max(1, int((latency_required_minutes * 60) / interval_seconds))
        twilio_required_consecutive = max(1, int((twilio_required_minutes * 60) / interval_seconds))

        inbox_breached = inbox_p95 > inbox_threshold
        assistant_breached = assistant_p95 > assistant_threshold
        twilio_breached = twilio_error_rate > twilio_threshold
        queue_breached = queue_depth >= queue_threshold
        queue_recovered = queue_depth <= queue_recovery

        async with self._lock:
            self._inbox_alert_consecutive = (self._inbox_alert_consecutive + 1) if inbox_breached else 0
            self._assistant_alert_consecutive = (self._assistant_alert_consecutive + 1) if assistant_breached else 0
            self._twilio_alert_consecutive = (self._twilio_alert_consecutive + 1) if twilio_breached else 0
            self._queue_pressure_consecutive = (
                self._queue_pressure_consecutive + 1 if queue_breached else 0
            )

            alert_reasons: list[str] = []
            if self._inbox_alert_consecutive >= latency_required_consecutive:
                alert_reasons.append("inbox_p95_high")
            if self._assistant_alert_consecutive >= latency_required_consecutive:
                alert_reasons.append("assistant_p95_high")
            if self._twilio_alert_consecutive >= twilio_required_consecutive:
                alert_reasons.append("twilio_error_rate_high")
            if self._queue_pressure_consecutive >= activation_consecutive:
                alert_reasons.append("queue_depth_high")

            mode_changed = False
            previous_active = self._mode_active

            if not self._mode_active and alert_reasons:
                self._mode_active = True
                self._mode_reasons = list(alert_reasons)
                self._mode_last_changed_at = datetime.now(timezone.utc).isoformat()
                self._recovery_consecutive = 0
                mode_changed = True
            elif self._mode_active:
                all_recovered = (
                    not inbox_breached
                    and not assistant_breached
                    and not twilio_breached
                    and queue_recovered
                )
                self._recovery_consecutive = self._recovery_consecutive + 1 if all_recovered else 0
                self._mode_reasons = list(alert_reasons) if alert_reasons else self._mode_reasons
                if self._recovery_consecutive >= recovery_consecutive:
                    self._mode_active = False
                    self._mode_reasons = []
                    self._mode_last_changed_at = datetime.now(timezone.utc).isoformat()
                    self._recovery_consecutive = 0
                    mode_changed = True

            return {
                "mode_changed": mode_changed,
                "previous_active": previous_active,
                "active": self._mode_active,
                "reasons": list(self._mode_reasons),
                "counters": {
                    "inbox": self._inbox_alert_consecutive,
                    "assistant": self._assistant_alert_consecutive,
                    "twilio": self._twilio_alert_consecutive,
                    "queue": self._queue_pressure_consecutive,
                    "recovery": self._recovery_consecutive,
                },
                "thresholds": {
                    "inbox_p95_ms": inbox_threshold,
                    "assistant_p95_ms": assistant_threshold,
                    "twilio_error_rate": twilio_threshold,
                    "queue_depth": queue_threshold,
                    "queue_recovery_depth": queue_recovery,
                },
            }

    async def current_mode(self) -> dict[str, Any]:
        async with self._lock:
            return {
                "active": self._mode_active,
                "reasons": list(self._mode_reasons),
                "last_changed_at": self._mode_last_changed_at,
                "recommended_inbox_poll_seconds": int(
                    getattr(settings, "high_demand_recommended_inbox_poll_seconds", 20)
                ),
            }

    async def get_sender_limits(
        self,
        *,
        base_batch_size: int,
        base_max_concurrency: int,
    ) -> tuple[int, int, dict[str, Any]]:
        mode = await self.current_mode()
        if not mode.get("active"):
            return (
                max(1, int(base_batch_size)),
                max(1, int(base_max_concurrency)),
                {"high_demand_mode": False},
            )
        batch_multiplier = float(getattr(settings, "high_demand_sender_batch_multiplier", 0.6))
        conc_multiplier = float(getattr(settings, "high_demand_sender_concurrency_multiplier", 0.6))
        effective_batch = max(1, int(round(max(1, int(base_batch_size)) * max(0.1, batch_multiplier))))
        effective_concurrency = max(
            1, int(round(max(1, int(base_max_concurrency)) * max(0.1, conc_multiplier)))
        )
        details = {
            "high_demand_mode": True,
            "reasons": mode.get("reasons"),
            "base_batch_size": int(base_batch_size),
            "base_max_concurrency": int(base_max_concurrency),
            "effective_batch_size": effective_batch,
            "effective_max_concurrency": effective_concurrency,
        }
        return effective_batch, effective_concurrency, details


class HighDemandModeRunner:
    """Runner periódico para actualizar KPIs y activar/desactivar modo alta demanda."""

    def __init__(self, *, controller: HighDemandController) -> None:
        self._controller = controller
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not bool(getattr(settings, "high_demand_mode_enabled", True)):
            log_event(logger, "high_demand.runner_disabled", reason="disabled_by_config")
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="high-demand-mode-runner")
        log_event(
            logger,
            "high_demand.runner_started",
            interval_seconds=max(30, int(getattr(settings, "high_demand_runner_interval_seconds", 60))),
            window_seconds=max(60, int(getattr(settings, "high_demand_window_seconds", 300))),
        )

    async def shutdown(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None
        log_event(logger, "high_demand.runner_stopped")

    async def _run_loop(self) -> None:
        interval_seconds = max(30, int(getattr(settings, "high_demand_runner_interval_seconds", 60)))
        snapshot_window_seconds = max(60, int(getattr(settings, "high_demand_window_seconds", 300)))
        while not self._stop.is_set():
            try:
                queue_depth = await CRMRepository().worker_count_ready_or_processing_envios()
                await self._controller.set_queue_depth(queue_depth=int(queue_depth))
            except CRMRepositoryError as exc:
                log_event(logger, "high_demand.queue_depth_failed", error=str(exc))

            snapshot = await self._controller.snapshot(window_seconds=snapshot_window_seconds)
            evaluation = await self._controller.evaluate_mode(snapshot=snapshot)
            log_event(
                logger,
                "high_demand.kpi_snapshot",
                snapshot=snapshot,
                evaluation=evaluation,
            )
            if evaluation.get("mode_changed"):
                if evaluation.get("active"):
                    log_event(logger, "high_demand.mode_activated", reasons=evaluation.get("reasons"))
                else:
                    log_event(logger, "high_demand.mode_deactivated")

            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue


high_demand_controller = HighDemandController()
high_demand_mode_runner = HighDemandModeRunner(controller=high_demand_controller)
