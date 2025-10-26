"""Configuración de logging estructurado para la aplicación."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any


class JSONFormatter(logging.Formatter):
    """Formatter que serializa los registros como JSON."""

    _RESERVED = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for key, value in record.__dict__.items():
            if key in self._RESERVED:
                continue
            payload[key] = value

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


def configure_logging(
    level: int = logging.INFO,
    *,
    log_file: str | None = None,
    per_logger_files: dict[str, str] | None = None,
) -> None:
    """Configura logging estructurado con formato JSON."""
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root_logger.addHandler(handler)

    if log_file:
        try:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            file_handler = RotatingFileHandler(
                log_path,
                maxBytes=10 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setFormatter(JSONFormatter())
            root_logger.addHandler(file_handler)
        except Exception:
            root_logger.exception(
                "No fue posible iniciar el handler de archivo", extra={"log_file": log_file}
            )

    if per_logger_files:
        for logger_name, file_path in per_logger_files.items():
            try:
                path = Path(file_path)
                path.parent.mkdir(parents=True, exist_ok=True)
                handler = RotatingFileHandler(
                    path,
                    maxBytes=10 * 1024 * 1024,
                    backupCount=5,
                    encoding="utf-8",
                )
                handler.setFormatter(JSONFormatter())
                target_logger = logging.getLogger(logger_name)
                target_logger.addHandler(handler)
            except Exception:
                root_logger.exception(
                    "No fue posible iniciar el handler dedicado",
                    extra={"logger": logger_name, "file": file_path},
                )


def resolve_log_level(value: str | int | None, *, default: int = logging.INFO) -> int:
    """Convierte valores configurables a constantes numéricas de logging."""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return default
        try:
            return int(candidate)
        except ValueError:
            upper = candidate.upper()
            mapped = logging._nameToLevel.get(upper)  # type: ignore[attr-defined]
            if isinstance(mapped, int):
                return mapped
    return default


def get_logger(name: str) -> logging.Logger:
    """Retorna un logger hijo con el nombre solicitado."""
    return logging.getLogger(name)


def log_event(logger: logging.Logger, message: str, **extra: Any) -> None:
    """Helper para enviar eventos con campos adicionales en formato JSON."""
    if extra:
        logger.info(message, extra=extra)
    else:
        logger.info(message)
