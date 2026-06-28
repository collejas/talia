"""Webhook público para eventos Stripe."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.stripe_billing import StripeProcessingError, StripeWebhookError, process_stripe_webhook

from .admin import get_platform_repo

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


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
