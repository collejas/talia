"""Configuración de logging estructurado para la aplicación."""

import logging
from typing import Any


def configure_logging(level: int = logging.INFO) -> None:
    """Configura logging básico con formato unificado."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    """Retorna un logger hijo con el nombre solicitado."""
    return logging.getLogger(name)


def log_event(logger: logging.Logger, message: str, **extra: Any) -> None:
    """Helper para enviar eventos con campos adicionales."""
    if extra:
        logger.info("%s | extra=%s", message, extra)
    else:
        logger.info(message)
