"""Operaciones explícitas para conectar un WABA autorizado por un tenant."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class MetaWhatsAppConnectionError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str = "No pudimos completar este paso de la conexión.",
        *,
        retryable: bool = False,
        meta_code: str | None = None,
        meta_subcode: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.meta_code = meta_code
        self.meta_subcode = meta_subcode


class MetaWhatsAppAssistedClient:
    def __init__(self, *, timeout: float = 20.0) -> None:
        if not settings.meta_system_user_access_token:
            raise MetaWhatsAppConnectionError(
                "meta_platform_configuration_error",
                "La conexión de Talia con Meta no está disponible. Contacta a soporte.",
            )
        if not settings.meta_app_id:
            raise MetaWhatsAppConnectionError(
                "meta_platform_configuration_error",
                "La conexión de Talia con Meta no está disponible. Contacta a soporte.",
            )
        self._token = settings.meta_system_user_access_token
        self._app_id = settings.meta_app_id
        self._version = settings.meta_graph_api_version.strip() or "v25.0"
        self._timeout = timeout

    def _url(self, resource: str) -> str:
        return f"https://graph.facebook.com/{self._version}/{resource.strip('/')}"

    @staticmethod
    def _error(
        response: httpx.Response,
        fallback: str,
        *,
        operation: str,
    ) -> MetaWhatsAppConnectionError:
        meta_code: str | None = None
        meta_subcode: str | None = None
        raw_message = ""
        try:
            payload = response.json()
            error = payload.get("error") if isinstance(payload, dict) else None
            if isinstance(error, dict):
                meta_code = str(error.get("code")) if error.get("code") is not None else None
                meta_subcode = str(error.get("error_subcode")) if error.get("error_subcode") is not None else None
                raw_message = str(error.get("message") or "")
        except ValueError:
            pass

        return MetaWhatsAppAssistedClient._classify_error(
            status_code=response.status_code,
            meta_code=meta_code,
            meta_subcode=meta_subcode,
            raw_message=raw_message,
            fallback=fallback,
            operation=operation,
        )

    @staticmethod
    def _classify_error(
        *,
        status_code: int,
        meta_code: str | None,
        meta_subcode: str | None,
        raw_message: str,
        fallback: str,
        operation: str,
    ) -> MetaWhatsAppConnectionError:
        text = raw_message.lower()
        technical_code = meta_code or "meta_api_error"
        common = {
            "meta_code": meta_code,
            "meta_subcode": meta_subcode,
        }
        if status_code == 429 or meta_code in {"4", "17", "32", "613"}:
            return MetaWhatsAppConnectionError(
                "meta_rate_limited",
                "Meta recibió demasiadas solicitudes. Espera unos minutos y vuelve a intentarlo.",
                retryable=True,
                **common,
            )
        if status_code >= 500:
            return MetaWhatsAppConnectionError(
                "meta_temporarily_unavailable",
                "Meta no está disponible en este momento. Espera unos minutos y vuelve a intentarlo.",
                retryable=True,
                **common,
            )
        if meta_code == "190":
            return MetaWhatsAppConnectionError(
                "meta_platform_authorization_error",
                "La conexión de Talia con Meta necesita atención. Intenta nuevamente más tarde o contacta a soporte.",
                **common,
            )
        if meta_code in {"10", "200", "299"} or any(
            marker in text for marker in ("permission", "permissions", "not authorized", "access")
        ):
            return MetaWhatsAppConnectionError(
                "meta_asset_access_denied",
                "Talia todavía no tiene acceso a este activo. Regresa a Meta Business Settings y comparte la cuenta y el número con el Business ID indicado.",
                **common,
            )
        if any(marker in text for marker in ("already registered", "already been registered", "is registered")):
            return MetaWhatsAppConnectionError(
                "whatsapp_number_already_registered",
                "Este número ya está registrado en WhatsApp Cloud API. No es necesario registrarlo nuevamente; continúa con la activación de la conexión.",
                **common,
            )
        if any(marker in text for marker in ("pin", "two-step", "two step", "verification code")):
            return MetaWhatsAppConnectionError(
                "whatsapp_pin_rejected",
                "Meta rechazó el PIN. Usa el PIN de verificación en dos pasos configurado para este número.",
                **common,
            )
        if meta_code == "100" and operation == "validar":
            return MetaWhatsAppConnectionError(
                "meta_asset_not_found",
                "No encontramos la cuenta de WhatsApp indicada. Revisa el WABA ID y confirma que Talia tenga acceso en Meta Business Settings.",
                **common,
            )
        return MetaWhatsAppConnectionError(
            technical_code if technical_code.startswith("meta_") else "meta_operation_rejected",
            fallback,
            **common,
        )

    async def _request(
        self,
        method: str,
        resource: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
        operation: str,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._token}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(method, self._url(resource), headers=headers, params=params, json=json)
        except httpx.RequestError as exc:
            raise MetaWhatsAppConnectionError(
                "meta_network_error",
                "No pudimos comunicarnos con Meta. Revisa tu conexión e inténtalo nuevamente.",
                retryable=True,
            ) from exc
        if response.status_code >= 400:
            raise self._error(response, "Meta no pudo completar este paso. Revisa los datos e inténtalo nuevamente.", operation=operation)
        try:
            payload = response.json()
        except ValueError as exc:
            raise MetaWhatsAppConnectionError("meta_invalid_response", "Meta devolvió una respuesta inválida") from exc
        if not isinstance(payload, dict):
            raise MetaWhatsAppConnectionError("meta_invalid_response", "Meta devolvió una respuesta inválida")
        return payload

    async def inspect(self, *, waba_id: str, phone_number_id: str, operation: str = "validar") -> dict[str, Any]:
        waba = await self._request("GET", waba_id, params={"fields": "id,name,owner_business_info"}, operation=operation)
        numbers = await self._request("GET", f"{waba_id}/phone_numbers", operation=operation)
        number = next((item for item in numbers.get("data", []) if isinstance(item, dict) and str(item.get("id")) == phone_number_id), None)
        if number is None:
            raise MetaWhatsAppConnectionError(
                "phone_not_in_waba",
                "El número seleccionado no pertenece a la cuenta de WhatsApp indicada. Revisa ambos identificadores.",
            )
        subscriptions = await self._request("GET", f"{waba_id}/subscribed_apps", operation=operation)
        subscribed = any(
            isinstance(item, dict)
            and isinstance(item.get("whatsapp_business_api_data"), dict)
            and str(item["whatsapp_business_api_data"].get("id")) == str(self._app_id)
            for item in subscriptions.get("data", [])
        )
        return {"waba": waba, "phone_number": number, "subscribed": subscribed}

    async def register(self, *, phone_number_id: str, pin: str) -> dict[str, Any]:
        return await self._request("POST", f"{phone_number_id}/register", json={"messaging_product": "whatsapp", "pin": pin}, operation="registrar")

    async def subscribe(self, *, waba_id: str) -> dict[str, Any]:
        return await self._request("POST", f"{waba_id}/subscribed_apps", operation="suscribir")
