"""Helper para registrar trazas detalladas del catálogo vectorial."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.core.config import resolve_log_path

CATALOG_DEBUG_LOG_PATH = resolve_log_path("catalogo-debug.log")


def write_catalog_debug_entry(entry: dict[str, Any]) -> None:
    """Añade una línea JSON al log de depuración del catálogo."""

    payload = {"timestamp": datetime.now(timezone.utc).isoformat(), **entry}
    try:
        CATALOG_DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CATALOG_DEBUG_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, default=str))
            handle.write("\n")
    except Exception as exc:  # pragma: no cover - logging de diagnóstico sin impacto
        logging.getLogger(__name__).exception(
            "catalog_debug_log_failed",
            extra={"entry": payload, "error": str(exc)},
        )
