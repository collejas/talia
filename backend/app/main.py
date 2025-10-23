"""Punto de entrada principal para la aplicación FastAPI."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.channels.voice.router import router as voice_router
from app.channels.webchat.router import router as webchat_router
from app.channels.whatsapp.router import router as whatsapp_router
from app.core.config import settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    """Crea y configura la instancia de FastAPI."""
    configure_logging()

    app = FastAPI(title="TalIA API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Se ajustará por ambiente
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router, prefix="/api")
    app.include_router(whatsapp_router, prefix="/api")
    app.include_router(webchat_router, prefix="/api")
    app.include_router(voice_router, prefix="/api")

    @app.get("/api/info", tags=["info"])
    def info() -> dict[str, str | None]:  # pragma: no cover - ruta simple de apoyo
        return {
            "environment": settings.environment,
            "assistant_id": settings.openai_assistant_id,
        }

    return app


app = create_app()
