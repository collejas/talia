"""Cliente seguro para administrar plantillas de WhatsApp en Meta."""

from __future__ import annotations

import re
from typing import Any

import httpx


class MetaWhatsAppTemplateError(RuntimeError):
    """Error normalizado de la API de plantillas Meta."""

    def __init__(
        self,
        code: str,
        message: str = "Meta no pudo completar la operación de plantilla.",
        *,
        retryable: bool = False,
        meta_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.meta_code = meta_code


class MetaWhatsAppTemplateClient:
    """Cliente de Business Management API usando el token del tenant."""

    def __init__(self, *, access_token: str, graph_api_version: str = "v25.0", timeout: float = 20.0) -> None:
        token = str(access_token or "").strip()
        if not token:
            raise MetaWhatsAppTemplateError(
                "meta_template_token_missing",
                "La conexión de WhatsApp del tenant no tiene un token Meta disponible.",
            )
        self._token = token
        self._version = str(graph_api_version or "v25.0").strip() or "v25.0"
        self._timeout = timeout

    def _url(self, resource: str) -> str:
        return f"https://graph.facebook.com/{self._version}/{resource.strip('/')}"

    @staticmethod
    def _normalize_error(response: httpx.Response, *, operation: str) -> MetaWhatsAppTemplateError:
        meta_code: str | None = None
        message = ""
        try:
            payload = response.json()
            error = payload.get("error") if isinstance(payload, dict) else None
            if isinstance(error, dict):
                raw_code = error.get("code")
                meta_code = str(raw_code) if raw_code is not None else None
                message = str(error.get("message") or "")
        except ValueError:
            pass

        if response.status_code == 429 or meta_code in {"4", "17", "32", "613"}:
            return MetaWhatsAppTemplateError(
                "meta_template_rate_limited",
                "Meta recibió demasiadas solicitudes. Inténtalo nuevamente más tarde.",
                retryable=True,
                meta_code=meta_code,
            )
        if response.status_code >= 500:
            return MetaWhatsAppTemplateError(
                "meta_template_temporarily_unavailable",
                "Meta no está disponible en este momento.",
                retryable=True,
                meta_code=meta_code,
            )
        if meta_code == "190":
            return MetaWhatsAppTemplateError(
                "meta_template_authorization_error",
                "La conexión del tenant con Meta necesita atención.",
                meta_code=meta_code,
            )
        if any(marker in message.lower() for marker in ("permission", "not authorized", "access")):
            return MetaWhatsAppTemplateError(
                "meta_template_access_denied",
                "La aplicación no tiene permisos para administrar plantillas en este WABA.",
                meta_code=meta_code,
            )
        return MetaWhatsAppTemplateError(
            f"meta_template_{operation}_rejected",
            "Meta rechazó la operación de plantilla. Revisa los datos y permisos del WABA.",
            meta_code=meta_code,
        )

    async def _request(
        self,
        method: str,
        resource: str,
        *,
        json_payload: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
        operation: str,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._token}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(
                    method,
                    self._url(resource),
                    headers=headers,
                    params=params,
                    json=json_payload,
                )
        except httpx.RequestError as exc:
            raise MetaWhatsAppTemplateError(
                "meta_template_network_error",
                "No pudimos comunicarnos con Meta. Inténtalo nuevamente.",
                retryable=True,
            ) from exc
        if response.status_code >= 400:
            raise self._normalize_error(response, operation=operation)
        try:
            payload = response.json()
        except ValueError as exc:
            raise MetaWhatsAppTemplateError("meta_template_invalid_response") from exc
        if not isinstance(payload, dict):
            raise MetaWhatsAppTemplateError("meta_template_invalid_response")
        return payload

    @staticmethod
    def _validate_name(name: str) -> str:
        normalized = str(name or "").strip().lower()
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9_]{0,158}[a-z0-9])?", normalized):
            raise MetaWhatsAppTemplateError(
                "meta_template_name_invalid",
                "El nombre técnico debe usar minúsculas, números y guiones bajos, sin espacios.",
            )
        return normalized

    async def create_template(
        self,
        *,
        waba_id: str,
        name: str,
        language_code: str,
        category: str,
        body_text: str,
    ) -> dict[str, Any]:
        waba = str(waba_id or "").strip()
        language = str(language_code or "").strip()
        body = str(body_text or "").strip()
        if not waba or not language or not body:
            raise MetaWhatsAppTemplateError("meta_template_payload_invalid")
        normalized_name = self._validate_name(name)
        normalized_category = str(category or "").strip().upper()
        if normalized_category not in {"MARKETING", "UTILITY", "AUTHENTICATION"}:
            raise MetaWhatsAppTemplateError("meta_template_category_invalid")
        return await self._request(
            "POST",
            f"{waba}/message_templates",
            json_payload={
                "name": normalized_name,
                "language": language,
                "category": normalized_category,
                "components": [{"type": "BODY", "text": body}],
            },
            operation="create",
        )

    async def get_template(self, *, template_id: str) -> dict[str, Any]:
        template = str(template_id or "").strip()
        if not template:
            raise MetaWhatsAppTemplateError("meta_template_id_missing")
        return await self._request("GET", template, operation="get")
