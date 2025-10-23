"""Punto de entrada principal para la aplicación FastAPI."""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.channels.voice.router import router as voice_router
from app.channels.webchat.router import router as webchat_router
from app.channels.whatsapp.router import router as whatsapp_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.middleware import RequestLoggingMiddleware


def create_app() -> FastAPI:
    """Crea y configura la instancia de FastAPI."""
    log_level = logging.DEBUG if settings.environment != "production" else logging.INFO
    log_dir = Path(settings.log_file_path).parent
    per_logger_files = {
        "app.request": str(log_dir / "request.log"),
        "app.channels.webchat": str(log_dir / "webchat.log"),
        "app.channels.whatsapp": str(log_dir / "whatsapp.log"),
        "app.channels.voice": str(log_dir / "voice.log"),
    }

    configure_logging(
        level=log_level,
        log_file=settings.log_file_path,
        per_logger_files=per_logger_files,
    )

    app = FastAPI(title="TalIA API", version="0.1.0", root_path="/api")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Se ajustará por ambiente
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(RequestLoggingMiddleware)

    app.include_router(health_router)
    app.include_router(whatsapp_router)
    app.include_router(webchat_router)
    app.include_router(voice_router)

    @app.get("/info", tags=["info"])
    def info() -> dict[str, str | None]:  # pragma: no cover - ruta simple de apoyo
        return {
            "environment": settings.environment,
            "assistant_id": settings.openai_assistant_id,
        }

    return app


app = create_app()
