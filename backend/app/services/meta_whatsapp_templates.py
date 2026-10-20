"""Cliente seguro para administrar plantillas de WhatsApp en Meta."""

from __future__ import annotations

import re
from typing import Literal
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

    def __init__(self, *, access_token: str, graph_api_version: str = "v25.0", timeout: float = 20.0, app_id: str | None = None) -> None:
        token = str(access_token or "").strip()
        if not token:
            raise MetaWhatsAppTemplateError(
                "meta_template_token_missing",
                "La conexión de WhatsApp del tenant no tiene un token Meta disponible.",
            )
        self._token = token
        self._version = str(graph_api_version or "v25.0").strip() or "v25.0"
        self._timeout = timeout
        self._app_id = str(app_id or "").strip()

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

    async def _request_binary(
        self,
        method: str,
        resource: str,
        *,
        content: bytes,
        headers: dict[str, str],
        operation: str,
    ) -> dict[str, Any]:
        request_headers = {"Authorization": f"Bearer {self._token}", **headers}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(
                    method,
                    self._url(resource),
                    headers=request_headers,
                    content=content,
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
        header_format: Literal["none", "text", "image", "video", "document"] = "none",
        header_text: str | None = None,
        header_handle: str | None = None,
        footer_text: str | None = None,
        buttons: list[dict[str, Any]] | None = None,
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
        components = self.build_components(
            body_text=body,
            header_format=header_format,
            header_text=header_text,
            header_handle=header_handle,
            footer_text=footer_text,
            buttons=buttons,
        )
        return await self._request(
            "POST",
            f"{waba}/message_templates",
            json_payload={
                "name": normalized_name,
                "language": language,
                "category": normalized_category,
                "components": components,
            },
            operation="create",
        )

    @staticmethod
    def build_components(
        *,
        body_text: str,
        header_format: Literal["none", "text", "image", "video", "document"] = "none",
        header_text: str | None = None,
        header_handle: str | None = None,
        footer_text: str | None = None,
        buttons: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        body = str(body_text or "").strip()
        if not body:
            raise MetaWhatsAppTemplateError("meta_template_payload_invalid")
        format_value = str(header_format or "none").strip().lower()
        if format_value not in {"none", "text", "image", "video", "document"}:
            raise MetaWhatsAppTemplateError("meta_template_header_invalid")
        components: list[dict[str, Any]] = []
        if format_value == "text":
            text = str(header_text or "").strip()
            if not text:
                raise MetaWhatsAppTemplateError("meta_template_header_text_required")
            components.append({"type": "HEADER", "format": "TEXT", "text": text})
        elif format_value in {"image", "video", "document"}:
            handle = str(header_handle or "").strip()
            if not handle:
                raise MetaWhatsAppTemplateError("meta_template_header_media_required")
            components.append({
                "type": "HEADER",
                "format": format_value.upper(),
                "example": {"header_handle": [handle]},
            })
        components.append({"type": "BODY", "text": body})
        footer = str(footer_text or "").strip()
        if footer:
            components.append({"type": "FOOTER", "text": footer})
        normalized_buttons: list[dict[str, Any]] = []
        for button in buttons or []:
            button_type = str(button.get("tipo") or "").strip().lower()
            button_text = str(button.get("texto") or "").strip()
            if button_type == "quick_reply":
                normalized_buttons.append({"type": "QUICK_REPLY", "text": button_text})
            elif button_type == "url":
                normalized_buttons.append({"type": "URL", "text": button_text, "url": str(button.get("url") or "").strip()})
            elif button_type == "phone":
                normalized_buttons.append({"type": "PHONE_NUMBER", "text": button_text, "phone_number": str(button.get("telefono") or "").strip()})
            else:
                raise MetaWhatsAppTemplateError("meta_template_button_invalid")
        if normalized_buttons:
            components.append({"type": "BUTTONS", "buttons": normalized_buttons})
        return components

    async def update_template(
        self,
        *,
        template_id: str,
        category: str,
        components: list[dict[str, Any]],
    ) -> dict[str, Any]:
        template = str(template_id or "").strip()
        normalized_category = str(category or "").strip().upper()
        if not template or normalized_category not in {"MARKETING", "UTILITY", "AUTHENTICATION"}:
            raise MetaWhatsAppTemplateError("meta_template_payload_invalid")
        if not components:
            raise MetaWhatsAppTemplateError("meta_template_payload_invalid")
        return await self._request(
            "POST",
            template,
            json_payload={"category": normalized_category, "components": components},
            operation="update",
        )

    async def delete_template(self, *, waba_id: str, template_id: str, name: str) -> dict[str, Any]:
        waba = str(waba_id or "").strip()
        meta_id = str(template_id or "").strip()
        normalized_name = self._validate_name(name)
        if not waba or not meta_id:
            raise MetaWhatsAppTemplateError("meta_template_payload_invalid")
        return await self._request(
            "DELETE",
            f"{waba}/message_templates",
            params={"hsm_id": meta_id, "name": normalized_name},
            operation="delete",
        )

    async def upload_template_media(self, *, content: bytes, mime_type: str) -> str:
        """Carga el ejemplo multimedia y devuelve el handle que exige Meta."""

        if not self._app_id:
            raise MetaWhatsAppTemplateError("meta_template_app_id_missing")
        if not content or len(content) > 16 * 1024 * 1024:
            raise MetaWhatsAppTemplateError("meta_template_media_size_invalid")
        normalized_mime = str(mime_type or "").split(";", 1)[0].strip().lower()
        if normalized_mime not in {"image/jpeg", "image/png", "video/mp4", "application/pdf"}:
            raise MetaWhatsAppTemplateError("meta_template_media_type_invalid")
        session = await self._request(
            "POST",
            f"{self._app_id}/uploads",
            params={"file_length": str(len(content)), "file_type": normalized_mime},
            operation="media_session",
        )
        session_id = str(session.get("id") or "").strip()
        if not session_id:
            raise MetaWhatsAppTemplateError("meta_template_media_session_invalid")
        uploaded = await self._request_binary(
            "POST",
            session_id,
            content=content,
            headers={"Content-Type": normalized_mime, "file_offset": "0"},
            operation="media_upload",
        )
        handle = str(uploaded.get("h") or uploaded.get("handle") or "").strip()
        if not handle:
            raise MetaWhatsAppTemplateError("meta_template_media_handle_invalid")
        return handle

    async def get_template(self, *, template_id: str) -> dict[str, Any]:
        template = str(template_id or "").strip()
        if not template:
            raise MetaWhatsAppTemplateError("meta_template_id_missing")
        return await self._request("GET", template, operation="get")
