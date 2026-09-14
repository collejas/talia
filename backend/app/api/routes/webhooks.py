"""Webhook público para eventos Stripe."""

from __future__ import annotations

import logging
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.stripe_billing import StripeProcessingError, StripeWebhookError, process_stripe_webhook
from app.services.postmark.repository import PostmarkRepository, PostmarkRepositoryError
from app.services.postmark.webhooks import process_postmark_event

from .admin import get_platform_repo

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
postmark_basic = HTTPBasic(auto_error=False)
logger = logging.getLogger(__name__)


@router.post("/postmark/{server_id}/{message_stream}", summary="Webhook Postmark aislado por servidor")
async def postmark_webhook(
    server_id: UUID,
    message_stream: str,
    request: Request,
    credentials: HTTPBasicCredentials | None = Depends(postmark_basic),
) -> dict[str, object]:
    expected_user = settings.postmark_webhook_username or ""
    expected_password = settings.postmark_webhook_password or ""
    if (
        credentials is None
        or not expected_user
        or not expected_password
        or not secrets.compare_digest(credentials.username, expected_user)
        or not secrets.compare_digest(credentials.password, expected_password)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="postmark_webhook_unauthorized")
    if message_stream not in {"outbound", "broadcast"}:
        raise HTTPException(status_code=404, detail="postmark_message_stream_not_supported")
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="postmark_webhook_invalid_json") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="postmark_webhook_invalid_payload")
    # La URL ya está fijada al servidor y al stream. Postmark puede enviar
    # nombres descriptivos distintos en las cargas de verificación (por
    # ejemplo, Broadcasts), por lo que MessageStream no es una comparación
    # textual segura ni debe bloquear la verificación.
    try:
        repository = PostmarkRepository()
        server = await repository.get_server_by_id(server_id=server_id)
        if not server or server.get("server_status") != "active":
            raise HTTPException(status_code=404, detail="postmark_server_not_found")
        result = await process_postmark_event(
            repository=repository,
            organizacion_id=UUID(str(server["organizacion_id"])),
            server_id=server_id,
            message_stream=message_stream,
            payload=payload,
            trace_id=request.headers.get("X-PM-Webhook-Trace-Id"),
        )
        return result
    except HTTPException:
        raise
    except (PostmarkRepositoryError, ValueError) as exc:
        logger.exception(
            "postmark.webhook_processing_failed",
            extra={
                "server_id": str(server_id),
                "message_stream": message_stream,
                "record_type": str(payload.get("RecordType") or ""),
                "message_id_present": bool(payload.get("MessageID")),
                "trace_id": request.headers.get("X-PM-Webhook-Trace-Id"),
                "error_type": type(exc).__name__,
            },
        )
        raise HTTPException(status_code=500, detail="postmark_webhook_processing_failed") from exc
    except Exception as exc:
        logger.exception(
            "postmark.webhook_unexpected_failure",
            extra={
                "server_id": str(server_id),
                "message_stream": message_stream,
                "record_type": str(payload.get("RecordType") or ""),
                "message_id_present": bool(payload.get("MessageID")),
                "trace_id": request.headers.get("X-PM-Webhook-Trace-Id"),
                "error_type": type(exc).__name__,
            },
        )
        raise HTTPException(status_code=500, detail="postmark_webhook_processing_failed") from exc


@router.post("/stripe", summary="Webhook Stripe para billing comercial")
async def stripe_webhook(
    request: Request,
    repo: PlatformRepository = Depends(get_platform_repo),
) -> JSONResponse:
    webhook_secret = settings.stripe_webhook_secret
    if not webhook_secret:
        raise HTTPException(status_code=503, detail="stripe_webhook_secret_missing")

    payload = await request.body()
    signature_header = request.headers.get("Stripe-Signature") or request.headers.get("stripe-signature")

    try:
        result = await process_stripe_webhook(
            repo=repo,
            payload=payload,
            signature_header=signature_header,
            webhook_secret=webhook_secret,
            tolerance_seconds=settings.stripe_webhook_tolerance_seconds,
        )
    except StripeProcessingError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except StripeWebhookError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return JSONResponse(content=result)
