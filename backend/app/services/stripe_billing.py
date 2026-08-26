"""Procesamiento idempotente de eventos Stripe para la capa comercial."""

from __future__ import annotations

import hmac
import json
from collections.abc import Mapping
from calendar import monthrange
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.tenant_provisioning import provision_tenant_from_billing

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
STRIPE_PAYMENT_INTENT_EVENT_TYPES = {
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
}


class StripeWebhookError(RuntimeError):
    """Error de procesamiento del webhook Stripe."""


class StripeSignatureError(StripeWebhookError):
    """La firma del webhook no es válida o no cumple el tiempo de tolerancia."""


class StripeProcessingError(StripeWebhookError):
    """Falló la actualización de estado comercial durante el procesamiento."""


class StripeApiError(StripeWebhookError):
    """Stripe respondió con error al crear clientes, checkout o portal."""


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
    metadata = obj.get("metadata")
    if isinstance(metadata, Mapping):
        metadata_price_id = _extract_stripe_reference(metadata, "provider_price_id")
        if metadata_price_id:
            return metadata_price_id
    for key in ("price", "provider_price_id"):
        price_id = _extract_stripe_reference(obj, key)
        if price_id:
            return price_id
    return None


def _extract_status(obj: Mapping[str, Any], event_type: str) -> str:
    if event_type == "payment_intent.succeeded":
        return "active"
    if event_type == "payment_intent.payment_failed":
        return "incomplete"
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


def _add_calendar_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


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


async def _stripe_request(
    *,
    method: str,
    path: str,
    data: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    secret_key = settings.stripe_secret_key
    if not secret_key:
        raise StripeApiError("stripe_secret_key_missing")
    url = f"{settings.stripe_api_base_url.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {secret_key}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, url, data=data, params=params, headers=headers)
    except httpx.RequestError as exc:  # pragma: no cover
        raise StripeApiError(f"stripe_request_error:{exc}") from exc
    if resp.status_code >= 400:
        raise StripeApiError(f"stripe_api_error:{resp.status_code}:{resp.text}")
    data = resp.json()
    if not isinstance(data, dict):
        raise StripeApiError("stripe_api_invalid_response")
    return data


async def create_stripe_customer(
    *,
    name: str,
    email: str | None,
    metadata: dict[str, str] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": name}
    if email:
        payload["email"] = email
    if metadata:
        for key, value in metadata.items():
            payload[f"metadata[{key}]"] = value
    return await _stripe_request(method="POST", path="/v1/customers", data=payload)


async def create_stripe_product_and_price(
    *,
    name: str,
    amount_cents: int,
    currency: str,
    metadata: dict[str, str],
    recurring_interval: str | None = None,
    idempotency_key: str,
) -> dict[str, Any]:
    product_payload: dict[str, Any] = {"name": name}
    for key, value in metadata.items():
        product_payload[f"metadata[{key}]"] = value
    product = await _stripe_request(
        method="POST",
        path="/v1/products",
        data=product_payload,
        idempotency_key=f"{idempotency_key}-product",
    )
    product_id = str(product.get("id") or "").strip()
    if not product_id:
        raise StripeApiError("stripe_product_create_failed")
    price_payload: dict[str, Any] = {
        "product": product_id,
        "unit_amount": str(amount_cents),
        "currency": currency.lower(),
    }
    if recurring_interval:
        price_payload["recurring[interval]"] = recurring_interval
    price = await _stripe_request(
        method="POST",
        path="/v1/prices",
        data=price_payload,
        idempotency_key=f"{idempotency_key}-price",
    )
    price_id = str(price.get("id") or "").strip()
    if not price_id:
        raise StripeApiError("stripe_price_create_failed")
    return {"product": product, "price": price}


async def create_stripe_payment_intent(
    *,
    customer_id: str,
    amount_cents: int,
    currency: str,
    tenant_id: UUID,
    plan_id: UUID,
    provider_price_id: str,
    installment_count: int,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "amount": str(amount_cents),
        "currency": currency.lower(),
        "customer": customer_id,
        "automatic_payment_methods[enabled]": "true",
        "setup_future_usage": "off_session",
        "metadata[tenant_id]": str(tenant_id),
        "metadata[plan_id]": str(plan_id),
        "metadata[provider_price_id]": provider_price_id,
        "metadata[installment_count]": str(installment_count),
        "payment_method_options[card][installments][enabled]": "true" if installment_count > 1 else "false",
    }
    allowed_counts = [count for count in (3, 6, 9, 12) if count <= installment_count]
    for index, count in enumerate(allowed_counts):
        payload[f"payment_method_options[card][installments][available_plans][{index}][type]"] = "fixed_count"
        payload[f"payment_method_options[card][installments][available_plans][{index}][interval]"] = "month"
        payload[f"payment_method_options[card][installments][available_plans][{index}][count]"] = str(count)
    return await _stripe_request(method="POST", path="/v1/payment_intents", data=payload)


async def update_stripe_customer_default_payment_method(
    *, customer_id: str, payment_method_id: str
) -> dict[str, Any]:
    return await _stripe_request(
        method="POST",
        path=f"/v1/customers/{customer_id}",
        data={"invoice_settings[default_payment_method]": payment_method_id},
    )


async def create_stripe_license_subscription(
    *,
    customer_id: str,
    price_id: str,
    trial_end: int,
    tenant_id: UUID,
    plan_id: UUID,
) -> dict[str, Any]:
    payload = {
        "customer": customer_id,
        "items[0][price]": price_id,
        "trial_end": str(trial_end),
        "collection_method": "charge_automatically",
        "metadata[tenant_id]": str(tenant_id),
        "metadata[plan_id]": str(plan_id),
        "metadata[billing_kind]": "post_contract_license",
    }
    return await _stripe_request(
        method="POST",
        path="/v1/subscriptions",
        data=payload,
        idempotency_key=f"talia-license-subscription-{tenant_id}",
    )


async def create_stripe_checkout_session(
    *,
    customer_id: str,
    price_id: str,
    success_url: str,
    cancel_url: str,
    tenant_id: UUID,
    plan_id: UUID,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "mode": "subscription",
        "customer": customer_id,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": str(tenant_id),
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "metadata[tenant_id]": str(tenant_id),
        "metadata[plan_id]": str(plan_id),
        "subscription_data[metadata][tenant_id]": str(tenant_id),
        "subscription_data[metadata][plan_id]": str(plan_id),
    }
    return await _stripe_request(method="POST", path="/v1/checkout/sessions", data=payload)


async def create_stripe_portal_session(
    *,
    customer_id: str,
    return_url: str,
) -> dict[str, Any]:
    payload = {
        "customer": customer_id,
        "return_url": return_url,
    }
    return await _stripe_request(method="POST", path="/v1/billing_portal/sessions", data=payload)


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
    if event_type == "payment_intent.succeeded":
        payment_intent_id = _extract_stripe_reference(event_object, "id")
        if payment_intent_id:
            payload["upfront_payment_intent_id"] = payment_intent_id
        metadata = event_object.get("metadata")
        if isinstance(metadata, Mapping) and metadata.get("installment_count"):
            try:
                selected_installment_count = int(metadata["installment_count"])
            except (TypeError, ValueError):
                selected_installment_count = 1
            if selected_installment_count in {1, 3, 6, 9, 12}:
                payload["selected_installment_count"] = selected_installment_count
        payment_options = event_object.get("payment_method_options")
        if isinstance(payment_options, Mapping):
            card_options = payment_options.get("card")
            if isinstance(card_options, Mapping):
                installments = card_options.get("installments")
                if isinstance(installments, Mapping):
                    plan = installments.get("plan")
                    if isinstance(plan, Mapping):
                        try:
                            actual_installment_count = int(plan.get("count"))
                        except (TypeError, ValueError):
                            actual_installment_count = 1
                        if actual_installment_count in {3, 6, 9, 12}:
                            payload["selected_installment_count"] = actual_installment_count

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


async def _schedule_post_contract_license(
    *,
    repo: PlatformRepository,
    tenant_id: UUID,
    plan_id: UUID,
    event_object: Mapping[str, Any],
) -> None:
    account = await repo.get_tenant_billing_account(tenant_id=tenant_id)
    if not account or str(account.get("stripe_subscription_id") or "").strip():
        return
    if str(account.get("license_status") or "pending") not in {"pending", "scheduled"}:
        return
    payment_method_id = _extract_stripe_reference(event_object, "payment_method")
    customer_id = _extract_stripe_reference(event_object, "customer") or str(account.get("stripe_customer_id") or "").strip()
    if not payment_method_id or not customer_id:
        logger.warning(
            "stripe.license_schedule_missing_payment_method",
            extra={"tenant_id": str(tenant_id)},
        )
        return
    license_price = await repo.get_active_commercial_license_price()
    if not license_price:
        logger.warning(
            "stripe.license_schedule_missing_price",
            extra={"tenant_id": str(tenant_id)},
        )
        return
    duration = int(account.get("contract_duration_months") or 1)
    now = datetime.now(tz=UTC)
    license_starts_at = _add_calendar_months(now, duration)
    await update_stripe_customer_default_payment_method(
        customer_id=customer_id,
        payment_method_id=payment_method_id,
    )
    subscription = await create_stripe_license_subscription(
        customer_id=customer_id,
        price_id=str(license_price.get("provider_price_id")),
        trial_end=int(license_starts_at.timestamp()),
        tenant_id=tenant_id,
        plan_id=plan_id,
    )
    subscription_id = str(subscription.get("id") or "").strip()
    if not subscription_id:
        raise StripeWebhookError("stripe_license_subscription_invalid")
    await repo.update_tenant_billing_account(
        tenant_id=tenant_id,
        payload={
            "stripe_subscription_id": subscription_id,
            "license_price_id": str(license_price.get("id")),
            "contract_started_at": now.isoformat(),
            "contract_ends_at": license_starts_at.isoformat(),
            "license_starts_at": license_starts_at.isoformat(),
            "license_status": "scheduled",
        },
    )


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
        if event_type in STRIPE_SUBSCRIPTION_EVENT_TYPES | STRIPE_INVOICE_EVENT_TYPES | STRIPE_CHECKOUT_EVENT_TYPES | STRIPE_PAYMENT_INTENT_EVENT_TYPES:
            billing_payload = _build_billing_account_payload(
                tenant_id=tenant_id,
                event_id=event_id,
                event_type=event_type,
                event_object=event_object,
                existing_account=existing_account,
                commercial_plan_price=plan_price_row,
            )
            await repo.update_tenant_billing_account(tenant_id=tenant_id, payload=billing_payload)
            if event_type == "payment_intent.succeeded":
                await _schedule_post_contract_license(
                    repo=repo,
                    tenant_id=tenant_id,
                    plan_id=UUID(str(billing_payload["plan_id"])),
                    event_object=event_object,
                )
            if billing_payload.get("billing_status") in {"active", "trialing"}:
                await provision_tenant_from_billing(repo=repo, tenant_id=tenant_id, source=event_id)

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
