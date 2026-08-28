"""Operaciones explícitas para conectar un WABA autorizado por un tenant."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class MetaWhatsAppConnectionError(RuntimeError):
    def __init__(self, code: str, message: str = "Meta no pudo completar la operación") -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class MetaWhatsAppAssistedClient:
    def __init__(self, *, timeout: float = 20.0) -> None:
        if not settings.meta_system_user_access_token:
            raise MetaWhatsAppConnectionError("meta_global_token_missing", "Falta el token global de Meta de Talia")
        if not settings.meta_app_id:
            raise MetaWhatsAppConnectionError("meta_app_id_missing", "Falta el App ID global de Meta de Talia")
        self._token = settings.meta_system_user_access_token
        self._app_id = settings.meta_app_id
        self._version = settings.meta_graph_api_version.strip() or "v25.0"
        self._timeout = timeout

    def _url(self, resource: str) -> str:
        return f"https://graph.facebook.com/{self._version}/{resource.strip('/')}"

    @staticmethod
    def _error(response: httpx.Response, fallback: str) -> MetaWhatsAppConnectionError:
        try:
            payload = response.json()
            error = payload.get("error") if isinstance(payload, dict) else None
            code = str(error.get("code") or "meta_api_error") if isinstance(error, dict) else "meta_api_error"
            message = str(error.get("message") or fallback) if isinstance(error, dict) else fallback
        except ValueError:
            code, message = "meta_api_error", fallback
        return MetaWhatsAppConnectionError(code, message)

    async def _request(self, method: str, resource: str, *, params: dict[str, str] | None = None, json: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._token}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(method, self._url(resource), headers=headers, params=params, json=json)
        except httpx.RequestError as exc:
            raise MetaWhatsAppConnectionError("meta_network_error", "No fue posible comunicarse con Meta") from exc
        if response.status_code >= 400:
            raise self._error(response, "Meta rechazó la operación")
        try:
            payload = response.json()
        except ValueError as exc:
            raise MetaWhatsAppConnectionError("meta_invalid_response", "Meta devolvió una respuesta inválida") from exc
        if not isinstance(payload, dict):
            raise MetaWhatsAppConnectionError("meta_invalid_response", "Meta devolvió una respuesta inválida")
        return payload

    async def inspect(self, *, waba_id: str, phone_number_id: str) -> dict[str, Any]:
        waba = await self._request("GET", waba_id, params={"fields": "id,name,owner_business_info"})
        numbers = await self._request("GET", f"{waba_id}/phone_numbers")
        number = next((item for item in numbers.get("data", []) if isinstance(item, dict) and str(item.get("id")) == phone_number_id), None)
        if number is None:
            raise MetaWhatsAppConnectionError("phone_not_in_waba", "El Phone Number ID no pertenece al WABA indicado")
        subscriptions = await self._request("GET", f"{waba_id}/subscribed_apps")
        subscribed = any(
            isinstance(item, dict)
            and isinstance(item.get("whatsapp_business_api_data"), dict)
            and str(item["whatsapp_business_api_data"].get("id")) == str(self._app_id)
            for item in subscriptions.get("data", [])
        )
        return {"waba": waba, "phone_number": number, "subscribed": subscribed}

    async def register(self, *, phone_number_id: str, pin: str) -> dict[str, Any]:
        return await self._request("POST", f"{phone_number_id}/register", json={"messaging_product": "whatsapp", "pin": pin})

    async def subscribe(self, *, waba_id: str) -> dict[str, Any]:
        return await self._request("POST", f"{waba_id}/subscribed_apps")
