"""Procesamiento idempotente de eventos Stripe para la capa comercial."""

from __future__ import annotations

import hmac
import json
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any
from uuid import UUID

from app.core.logging import get_logger
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError

logger = get_logger("app.services.stripe_billing")

STRIPE_SUBSCRIPTION_EVENT_TYPES = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
}
STRIPE_INVOICE_EVENT_TYPES = {
    "invoice.paid",
    "invoice.payment_failed",
}
STRIPE_CHECKOUT_EVENT_TYPES = {
    "checkout.session.completed",
}


class StripeWebhookError(RuntimeError):
    """Error de procesamiento del webhook Stripe."""


class StripeSignatureError(StripeWebhookError):
    """La firma del webhook no es válida o no cumple el tiempo de tolerancia."""


class StripeProcessingError(StripeWebhookError):
    """Falló la actualización de estado comercial durante el procesamiento."""


def _event_object(event: Mapping[str, Any]) -> dict[str, Any]:
    data = event.get("data")
    if not isinstance(data, Mapping):
        raise StripeWebhookError("stripe_event_missing_data")
    obj = data.get("object")
    if not isinstance(obj, dict):
        raise StripeWebhookError("stripe_event_missing_object")
    return obj


def _parse_event_timestamp(value: Any) -> str | None:
    try:
        if value is None:
            return None
        return datetime.fromtimestamp(int(value), tz=UTC).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _parse_uuid(value: Any) -> UUID | None:
    try:
        if value is None:
            return None
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _extract_stripe_reference(obj: Mapping[str, Any], key: str) -> str | None:
    value = obj.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _extract_metadata_uuid(obj: Mapping[str, Any], keys: tuple[str, ...]) -> UUID | None:
    metadata = obj.get("metadata")
    if isinstance(metadata, Mapping):
        for key in keys:
            parsed = _parse_uuid(metadata.get(key))
            if parsed:
                return parsed
    for key in ("client_reference_id",):
        parsed = _parse_uuid(obj.get(key))
        if parsed:
            return parsed
    return None


def _extract_price_id(obj: Mapping[str, Any]) -> str | None:
    items = obj.get("items")
    if isinstance(items, Mapping):
        data = items.get("data")
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, Mapping):
                    continue
                price = item.get("price")
                if isinstance(price, Mapping):
                    price_id = _extract_stripe_reference(price, "id")
                    if price_id:
                        return price_id
                plan = item.get("plan")
                if isinstance(plan, Mapping):
                    price_id = _extract_stripe_reference(plan, "id")
                    if price_id:
                        return price_id
    for key in ("price", "provider_price_id"):
        price_id = _extract_stripe_reference(obj, key)
        if price_id:
            return price_id
    return None


def _extract_status(obj: Mapping[str, Any], event_type: str) -> str:
    if event_type == "invoice.paid":
        return "active"
    if event_type == "invoice.payment_failed":
        return "past_due"
    status = _extract_stripe_reference(obj, "status")
    if status:
        return status
    return "active"


def _derive_access_status(billing_status: str, obj: Mapping[str, Any]) -> str:
    if billing_status in {"active", "trialing"}:
        return "active"
    if billing_status == "past_due":
        return "grace"
    if billing_status == "incomplete":
        return "manual_review"
    if billing_status in {"inactive", "canceled", "unpaid"}:
        return "blocked"
    if billing_status == "paused":
        return "manual_review"
    cancel_at_period_end = bool(obj.get("cancel_at_period_end"))
    if cancel_at_period_end:
        return "grace"
    return "active"


def _maybe_timestamp_to_iso(value: Any) -> str | None:
    try:
        if value is None:
            return None
        return datetime.fromtimestamp(int(value), tz=UTC).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _build_event_signature(secret: str, payload: bytes, timestamp: int) -> str:
    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_payload, sha256).hexdigest()
    return digest


def verify_stripe_signature(
    *,
    secret: str,
    payload: bytes,
    signature_header: str | None,
    tolerance_seconds: int = 300,
) -> None:
    if not signature_header:
        raise StripeSignatureError("stripe_signature_missing")

    parts: dict[str, list[str]] = {}
    for chunk in signature_header.split(","):
        key, _, value = chunk.partition("=")
        key = key.strip()
        value = value.strip()
        if not key or not value:
            continue
        parts.setdefault(key, []).append(value)

    timestamp_value = parts.get("t", [None])[0]
    if timestamp_value is None:
        raise StripeSignatureError("stripe_signature_timestamp_missing")
    try:
        timestamp = int(timestamp_value)
    except ValueError as exc:
        raise StripeSignatureError("stripe_signature_timestamp_invalid") from exc

    if tolerance_seconds > 0:
        age = abs(int(datetime.now(tz=UTC).timestamp()) - timestamp)
        if age > tolerance_seconds:
            raise StripeSignatureError("stripe_signature_expired")

    expected = _build_event_signature(secret, payload, timestamp)
    signatures = parts.get("v1", [])
    if not signatures or not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
        raise StripeSignatureError("stripe_signature_invalid")


async def _resolve_tenant_for_event(
    *,
    repo: PlatformRepository,
    event_type: str,
    event_object: Mapping[str, Any],
) -> tuple[UUID | None, dict[str, Any] | None]:
    customer_id = _extract_stripe_reference(event_object, "customer")
    subscription_id = _extract_stripe_reference(event_object, "subscription")
    account: dict[str, Any] | None = None
    if customer_id:
        account = await repo.get_tenant_billing_account_by_stripe_customer(stripe_customer_id=customer_id)
    if not account and subscription_id:
        account = await repo.get_tenant_billing_account_by_stripe_subscription(
            stripe_subscription_id=subscription_id
        )

    tenant_id = _parse_uuid(event_object.get("tenant_id"))
    if not tenant_id:
        tenant_id = _extract_metadata_uuid(event_object, ("tenant_id", "organizacion_id", "organization_id"))

    if not tenant_id and account:
        tenant_id = _parse_uuid(account.get("tenant_id"))
    if not account and tenant_id:
        account = await repo.get_tenant_billing_account(tenant_id=tenant_id)

    # En checkout, el tenant puede venir solo como referencia temporal.
    if not tenant_id and event_type == "checkout.session.completed":
        tenant_id = _extract_metadata_uuid(event_object, ("tenant_id", "organizacion_id", "organization_id"))
    return tenant_id, account


def _build_billing_account_payload(
    *,
    tenant_id: UUID,
    event_id: str,
    event_type: str,
    event_object: Mapping[str, Any],
    existing_account: Mapping[str, Any] | None,
    commercial_plan_price: Mapping[str, Any] | None,
) -> dict[str, Any]:
    customer_id = _extract_stripe_reference(event_object, "customer")
    subscription_id = _extract_stripe_reference(event_object, "subscription")
    if not customer_id and existing_account:
        existing_customer_id = existing_account.get("stripe_customer_id")
        if isinstance(existing_customer_id, str) and existing_customer_id.strip():
            customer_id = existing_customer_id.strip()
    if not customer_id:
        raise StripeWebhookError("stripe_customer_id_missing")

    plan_id = None
    if commercial_plan_price and commercial_plan_price.get("plan_id"):
        plan_id = commercial_plan_price.get("plan_id")
    if not plan_id and existing_account and existing_account.get("plan_id"):
        plan_id = existing_account.get("plan_id")
    if not plan_id:
        raise StripeWebhookError("commercial_plan_not_resolved")

    billing_status = _extract_status(event_object, event_type)
    access_status = _derive_access_status(billing_status, event_object)
    price_id = _extract_price_id(event_object)
    current_period_start = _maybe_timestamp_to_iso(event_object.get("current_period_start"))
    current_period_end = _maybe_timestamp_to_iso(event_object.get("current_period_end"))
    trial_ends_at = _maybe_timestamp_to_iso(event_object.get("trial_end") or event_object.get("trial_ends_at"))
    if event_type == "checkout.session.completed" and not subscription_id:
        subscription_id = _extract_stripe_reference(event_object, "subscription")

    payload: dict[str, Any] = {
        "tenant_id": str(tenant_id),
        "plan_id": str(plan_id),
        "billing_provider": "stripe",
        "stripe_customer_id": customer_id,
        "billing_status": billing_status,
        "access_status": access_status,
        "last_stripe_event_id": event_id,
    }
    if subscription_id:
        payload["stripe_subscription_id"] = subscription_id
    if price_id:
        payload["stripe_price_id"] = price_id
    if current_period_start:
        payload["current_period_start"] = current_period_start
    if current_period_end:
        payload["current_period_end"] = current_period_end
    if trial_ends_at:
        payload["trial_ends_at"] = trial_ends_at

    cancel_at_period_end = event_object.get("cancel_at_period_end")
    if isinstance(cancel_at_period_end, bool):
        payload["cancel_at_period_end"] = cancel_at_period_end

    if billing_status in {"active", "trialing"} and not existing_account:
        payload["activated_at"] = datetime.now(tz=UTC).isoformat()
    if billing_status in {"inactive", "canceled", "unpaid"}:
        payload["deactivated_at"] = datetime.now(tz=UTC).isoformat()
    if billing_status == "past_due":
        payload["grace_until"] = (datetime.now(tz=UTC) + timedelta(days=7)).isoformat()

    return payload


async def process_stripe_webhook(
    *,
    repo: PlatformRepository,
    payload: bytes,
    signature_header: str | None,
    webhook_secret: str,
    tolerance_seconds: int = 300,
) -> dict[str, Any]:
    verify_stripe_signature(
        secret=webhook_secret,
        payload=payload,
        signature_header=signature_header,
        tolerance_seconds=tolerance_seconds,
    )

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise StripeWebhookError("stripe_event_invalid_json") from exc
    if not isinstance(event, dict):
        raise StripeWebhookError("stripe_event_invalid_payload")

    event_id = str(event.get("id") or "").strip()
    event_type = str(event.get("type") or "").strip()
    if not event_id:
        raise StripeWebhookError("stripe_event_id_missing")
    if not event_type:
        raise StripeWebhookError("stripe_event_type_missing")

    event_object = _event_object(event)
    tenant_id, existing_account = await _resolve_tenant_for_event(
        repo=repo,
        event_type=event_type,
        event_object=event_object,
    )
    if not tenant_id and not existing_account:
        logger.info(
            "stripe.event_ignored_unresolved_tenant",
            extra={"stripe_event_id": event_id, "stripe_event_type": event_type},
        )
        return {"accepted": True, "processed": False, "ignored": True, "reason": "tenant_unresolved"}

    if not tenant_id and existing_account:
        tenant_id = _parse_uuid(existing_account.get("tenant_id"))
    if not tenant_id:
        raise StripeWebhookError("stripe_tenant_missing")

    existing_event = await repo.get_tenant_billing_event_by_stripe_event_id(stripe_event_id=event_id)
    if existing_event and existing_event.get("processed_at"):
        return {"accepted": True, "processed": False, "duplicate": True, "tenant_id": str(tenant_id)}

    plan_price_row: dict[str, Any] | None = None
    price_id = _extract_price_id(event_object)
    if price_id:
        plan_price_row = await repo.get_commercial_plan_price_by_provider_price_id(provider_price_id=price_id)

    event_created_at = _parse_event_timestamp(event.get("created"))
    await repo.upsert_tenant_billing_event(
        payload={
            "tenant_id": str(tenant_id),
            "stripe_event_id": event_id,
            "stripe_event_type": event_type,
            "stripe_customer_id": _extract_stripe_reference(event_object, "customer"),
            "stripe_subscription_id": _extract_stripe_reference(event_object, "subscription"),
            "event_created_at": event_created_at,
            "processed_at": None,
            "processing_error": None,
        }
    )

    try:
        if event_type in STRIPE_SUBSCRIPTION_EVENT_TYPES | STRIPE_INVOICE_EVENT_TYPES | STRIPE_CHECKOUT_EVENT_TYPES:
            billing_payload = _build_billing_account_payload(
                tenant_id=tenant_id,
                event_id=event_id,
                event_type=event_type,
                event_object=event_object,
                existing_account=existing_account,
                commercial_plan_price=plan_price_row,
            )
            await repo.update_tenant_billing_account(tenant_id=tenant_id, payload=billing_payload)

        now_iso = datetime.now(tz=UTC).isoformat()
        await repo.mark_tenant_billing_event_processed(stripe_event_id=event_id, processed_at=now_iso)
        return {"accepted": True, "processed": True, "tenant_id": str(tenant_id), "event_type": event_type}
    except Exception as exc:
        processing_error = str(exc)
        try:
            await repo.mark_tenant_billing_event_failed(
                stripe_event_id=event_id,
                processing_error=processing_error,
            )
        except PlatformRepositoryError:
            logger.exception(
                "stripe.event_mark_failed_failed",
                extra={"stripe_event_id": event_id, "stripe_event_type": event_type},
            )
        raise StripeProcessingError(processing_error) from exc
