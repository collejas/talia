"""Punto de entrada principal para la aplicación FastAPI."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Awaitable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from app.api.routes.admin import router as admin_router
from app.api.routes.crm import (
    inbox_threads_metrics_snapshot_runner,
    router as crm_router,
)
from app.api.routes.propuesta import router as propuesta_router
from app.api.routes.health import router as health_router
from app.api.routes.public_auth import router as public_auth_router
from app.api.routes.public_billing import router as public_billing_router
from app.api.routes.billing import router as billing_router
from app.api.routes.webhooks import router as webhooks_router
from app.api.routes.tenant import router as tenant_router
from app.api.routes.prospeccion_plantillas_ai import router as prospeccion_plantillas_ai_router
from app.channels.messenger.router import router as messenger_router
from app.channels.voice.router import router as voice_router
from app.channels.webchat.router import router as webchat_router
from app.channels.whatsapp.router import router as whatsapp_router
from app.core.config import resolve_log_path, settings
from app.core.logging import configure_logging, get_logger, resolve_log_level
from app.core.middleware import RequestLoggingMiddleware
from app.services.prospeccion_contact_sender import contact_sender
from app.services.prospeccion_email_inbound_reader import email_inbound_reader
from app.services.deleted_busquedas_purge_jobs import deleted_busquedas_purge_runner
from app.services.high_demand_mode import high_demand_mode_runner
from app.services.activity_reminder_jobs import activity_reminder_jobs_runner
from app.services.sales_notification_jobs import sales_notification_jobs_runner
from app.services.meta_delivery_reconciliation_jobs import meta_delivery_reconciliation_runner
from app.services.message_billing_alert_jobs import message_billing_alert_runner
from app.services.role_permissions_sync import maybe_sync_role_permissions_on_start
from app.services.webchat_followups import (
    closure_rescue_runner as webchat_closure_rescue_runner,
)
from app.services.webchat_followups import followup_runner as webchat_followup_runner
from app.services.whatsapp_followups import followup_runner as whatsapp_followup_runner


async def _shutdown_with_timeout(
    *, name: str, coro: Awaitable[object], timeout_seconds: float = 12.0
) -> None:
    log = get_logger("app")
    try:
        await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        log.error(
            "lifespan.shutdown_timeout",
            extra={"runner": name, "timeout_seconds": timeout_seconds},
        )
    except Exception as exc:  # pragma: no cover - defensivo
        log.exception(
            "lifespan.shutdown_failed",
            extra={"runner": name, "error": str(exc)},
        )


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    """Administra recursos de inicio/cierre sin usar on_event."""

    await maybe_sync_role_permissions_on_start()
    await contact_sender.start()
    await email_inbound_reader.start()
    await whatsapp_followup_runner.start()
    await webchat_followup_runner.start()
    await webchat_closure_rescue_runner.start()
    await inbox_threads_metrics_snapshot_runner.start()
    await high_demand_mode_runner.start()
    await activity_reminder_jobs_runner.start()
    await deleted_busquedas_purge_runner.start()
    await sales_notification_jobs_runner.start()
    await meta_delivery_reconciliation_runner.start()
    await message_billing_alert_runner.start()
    try:
        yield
    finally:
        shutdown_coroutines = (
            _shutdown_with_timeout(
                name="activity_reminder_jobs_runner",
                coro=activity_reminder_jobs_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="deleted_busquedas_purge_runner",
                coro=deleted_busquedas_purge_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="sales_notification_jobs_runner",
                coro=sales_notification_jobs_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="meta_delivery_reconciliation_runner",
                coro=meta_delivery_reconciliation_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="message_billing_alert_runner",
                coro=message_billing_alert_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="high_demand_mode_runner",
                coro=high_demand_mode_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="inbox_threads_metrics_snapshot_runner",
                coro=inbox_threads_metrics_snapshot_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="webchat_closure_rescue_runner",
                coro=webchat_closure_rescue_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="webchat_followup_runner",
                coro=webchat_followup_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="whatsapp_followup_runner",
                coro=whatsapp_followup_runner.shutdown(),
            ),
            _shutdown_with_timeout(
                name="email_inbound_reader",
                coro=email_inbound_reader.shutdown(),
            ),
            _shutdown_with_timeout(
                name="contact_sender",
                coro=contact_sender.shutdown(),
            ),
        )
        await asyncio.gather(*shutdown_coroutines)


def create_app() -> FastAPI:
    """Crea y configura la instancia de FastAPI."""
    default_log_level = logging.DEBUG if settings.environment != "production" else logging.INFO
    log_level = resolve_log_level(settings.log_level, default=default_log_level)
    per_logger_files = {
        "app.request": str(resolve_log_path("request.log")),
        "app.channels.whatsapp": str(resolve_log_path("whatsapp.log")),
        "app.channels.messenger": str(resolve_log_path("messenger.log")),
        "app.channels.voice": str(resolve_log_path("voice.log")),
        "app.channels.webchat": str(resolve_log_path("webchat.log")),
        "app.services.webchat_followups": str(resolve_log_path("webchat.log")),
        "app.analytics.visitas": str(resolve_log_path("visitas.log")),
        "app.services.whatsapp_followups": str(resolve_log_path("whatsapp.log")),
        "app.api.crm.import": str(resolve_log_path("propiedades-import.log")),
        "app.api.crm.tenant_access": str(resolve_log_path("tenant-access.log")),
        "app.prospeccion.busquedas": str(resolve_log_path("busquedas.log").parent / "busquedas" / resolve_log_path("busquedas.log").name),
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
    app.include_router(prospeccion_plantillas_ai_router)
    app.include_router(crm_router)
    app.include_router(propuesta_router)
    app.include_router(public_billing_router)
    app.include_router(billing_router)
    app.include_router(public_auth_router)
    app.include_router(webhooks_router)
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
