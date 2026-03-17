"""Gate para diferir jobs no críticos cuando hay backlog alto de prospección."""

from __future__ import annotations

import asyncio
from time import monotonic
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.services.high_demand_mode import high_demand_controller
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger("app.services.non_critical_job_gate")

_LOCK = asyncio.Lock()
_LAST_CHECK_AT = 0.0
_LAST_RESULT: tuple[bool, dict[str, Any]] = (False, {"reason": "not_evaluated"})
_CRITICAL_JOBS_NO_DEFER = {
    "webchat_followups",
    "webchat_closure_rescue",
}


async def should_defer_non_critical_jobs(*, job_name: str) -> tuple[bool, dict[str, Any]]:
    """Indica si conviene diferir jobs no críticos por presión de envíos."""

    if job_name in _CRITICAL_JOBS_NO_DEFER:
        return False, {"reason": "critical_job_no_defer", "job_name": job_name}
    if not bool(getattr(settings, "non_critical_jobs_blast_protection_enabled", True)):
        return False, {"reason": "disabled", "job_name": job_name}
    if bool(getattr(settings, "high_demand_non_critical_force_defer", True)):
        mode = await high_demand_controller.current_mode()
        if bool(mode.get("active")):
            return True, {
                "reason": "high_demand_mode",
                "job_name": job_name,
                "cached": False,
                "mode": mode,
            }

    now = monotonic()
    cache_ttl = max(5, int(getattr(settings, "non_critical_jobs_gate_cache_seconds", 20)))
    threshold = max(1, int(getattr(settings, "non_critical_jobs_defer_pending_threshold", 300)))

    global _LAST_CHECK_AT, _LAST_RESULT
    async with _LOCK:
        if (now - _LAST_CHECK_AT) < cache_ttl:
            defer, details = _LAST_RESULT
            return defer, {**details, "job_name": job_name, "cached": True}

        repo = CRMRepository()
        try:
            backlog = await repo.worker_count_ready_or_processing_envios()
        except CRMRepositoryError as exc:
            logger.warning(
                "non_critical_jobs.gate_check_failed",
                extra={"job_name": job_name, "error": str(exc)},
            )
            _LAST_CHECK_AT = now
            _LAST_RESULT = (False, {"reason": "gate_check_failed", "error": str(exc)})
            return False, {"reason": "gate_check_failed", "job_name": job_name, "error": str(exc)}

        defer = int(backlog) >= threshold
        details = {
            "reason": "backlog_threshold" if defer else "below_threshold",
            "backlog": int(backlog),
            "threshold": int(threshold),
            "cache_ttl_seconds": int(cache_ttl),
            "cached": False,
        }
        _LAST_CHECK_AT = now
        _LAST_RESULT = (defer, details)
        return defer, {**details, "job_name": job_name}
