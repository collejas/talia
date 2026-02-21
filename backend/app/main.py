"""Punto de entrada principal para la aplicación FastAPI."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from app.api.routes.admin import router as admin_router
from app.api.routes.crm import router as crm_router
from app.api.routes.propuesta import router as propuesta_router
from app.api.routes.health import router as health_router
from app.api.routes.tenant import router as tenant_router
from app.channels.messenger.router import router as messenger_router
from app.channels.voice.router import router as voice_router
from app.channels.webchat.router import router as webchat_router
from app.channels.whatsapp.router import router as whatsapp_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger, resolve_log_level
from app.core.middleware import RequestLoggingMiddleware
from app.services.prospeccion_contact_sender import contact_sender
from app.services.role_permissions_sync import maybe_sync_role_permissions_on_start
from app.services.webchat_followups import (
    closure_rescue_runner as webchat_closure_rescue_runner,
)
from app.services.webchat_followups import followup_runner as webchat_followup_runner
from app.services.whatsapp_followups import followup_runner as whatsapp_followup_runner


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    """Administra recursos de inicio/cierre sin usar on_event."""

    await maybe_sync_role_permissions_on_start()
    await contact_sender.start()
    await whatsapp_followup_runner.start()
    await webchat_followup_runner.start()
    await webchat_closure_rescue_runner.start()
    try:
        yield
    finally:
        await webchat_closure_rescue_runner.shutdown()
        await webchat_followup_runner.shutdown()
        await whatsapp_followup_runner.shutdown()
        await contact_sender.shutdown()


def create_app() -> FastAPI:
    """Crea y configura la instancia de FastAPI."""
    default_log_level = logging.DEBUG if settings.environment != "production" else logging.INFO
    log_level = resolve_log_level(settings.log_level, default=default_log_level)
    log_dir = Path(settings.log_file_path).parent
    per_logger_files = {
        "app.request": str(log_dir / "request.log"),
        "app.channels.whatsapp": str(log_dir / "whatsapp.log"),
        "app.channels.messenger": str(log_dir / "messenger.log"),
        "app.channels.voice": str(log_dir / "voice.log"),
        "app.channels.webchat": str(log_dir / "webchat.log"),
        "app.services.webchat_followups": str(log_dir / "webchat.log"),
        "app.analytics.visitas": str(log_dir / "visitas.log"),
        "app.services.whatsapp_followups": str(log_dir / "whatsapp.log"),
        "app.api.crm.import": str(log_dir / "propiedades-import.log"),
        "app.api.crm.tenant_access": str(log_dir / "tenant-access.log"),
        "app.prospeccion.busquedas": str(log_dir / "busquedas" / "busquedas.log"),
    }

    configure_logging(
        level=log_level,
        log_file=settings.log_file_path,
        per_logger_files=per_logger_files,
    )

    app = FastAPI(title="TalIA API", version="0.1.0", root_path="/api", lifespan=app_lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_allowed_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(RequestLoggingMiddleware)

    app.include_router(health_router)
    app.include_router(admin_router)
    app.include_router(tenant_router)
    app.include_router(crm_router)
    app.include_router(propuesta_router)
    app.include_router(webchat_router)
    app.include_router(whatsapp_router)
    app.include_router(messenger_router)
    app.include_router(voice_router)

    @app.get("/info", tags=["info"])
    def info() -> dict[str, str | None]:  # pragma: no cover - ruta simple de apoyo
        return {
            "environment": settings.environment,
            "assistant_id": settings.openai_assistant_id,
        }

    log = get_logger("app")
    try:
        public_root = Path(__file__).resolve().parent / "public"
        shared = public_root / "shared"
        if shared.exists():
            shared_static = StaticFiles(directory=str(shared), html=False)
            app.mount("/shared", shared_static, name="shared")
            app.mount("/api/shared", shared_static, name="shared_alt")
            log.info("shared.static_mounted", extra={"path": str(shared)})
        else:
            log.warning("shared.static_missing", extra={"expected_path": str(shared)})
    except Exception as exc:  # pragma: no cover - best effort
        log.exception("static_mount_failed", extra={"error": str(exc)})

    return app


app = create_app()
