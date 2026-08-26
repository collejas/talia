"""Cliente HTTP aislado para la API de correo.

Este módulo no decide tenant, cuota, permisos ni persistencia. Es únicamente el
adaptador que normaliza la API externa para que los servicios de Talia puedan
aplicar esas reglas sin depender del contrato del proveedor.
"""

from __future__ import annotations

from uuid import UUID

import httpx

from app.core.config import settings

from .errors import PostmarkRequestError
from .schemas import MessageKind, PostmarkBatchResult, PostmarkMessage, PostmarkSendResult

_MAX_BATCH_SIZE = 500


class PostmarkClient:
    """Cliente sin estado de negocio y sin exposición de tokens."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        transactional_token: str | None = None,
        broadcast_token: str | None = None,
        timeout: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or settings.postmark_base_url).rstrip("/")
        self._tokens = {
            "transactional": transactional_token or settings.postmark_server_token_transactional,
            "broadcast": broadcast_token or settings.postmark_server_token_broadcast,
        }
        self.timeout = timeout or settings.postmark_timeout_seconds
        self.transport = transport

    async def send_message(
        self,
        message: PostmarkMessage,
        *,
        message_kind: MessageKind,
    ) -> PostmarkSendResult:
        """Envía un único destinatario y normaliza la respuesta."""
        response = await self._post(
            "/email",
            message_kind=message_kind,
            payload=self._message_payload(message),
        )
        return self._parse_result(response.json())

    async def send_batch(
        self,
        messages: list[PostmarkMessage],
        *,
        message_kind: MessageKind,
    ) -> PostmarkBatchResult:
        """Envía hasta 500 mensajes y conserva el resultado de cada elemento."""
        if not messages:
            return PostmarkBatchResult(items=[])
        if len(messages) > _MAX_BATCH_SIZE:
            raise PostmarkRequestError("batch_size_exceeded")
        response = await self._post(
            "/email/batch",
            message_kind=message_kind,
            payload=[self._message_payload(message) for message in messages],
        )
        data = response.json()
        if not isinstance(data, list) or len(data) != len(messages):
            raise PostmarkRequestError("invalid_batch_response", status_code=response.status_code)
        return PostmarkBatchResult(items=[self._parse_result(item) for item in data])

    async def _post(
        self,
        path: str,
        *,
        message_kind: MessageKind,
        payload: dict[str, object] | list[dict[str, object]],
    ) -> httpx.Response:
        token = self._tokens[message_kind]
        if not token:
            raise PostmarkRequestError("server_token_missing")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": token,
        }
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout,
                transport=self.transport,
            ) as client:
                response = await client.post(f"{self.base_url}{path}", headers=headers, json=payload)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise PostmarkRequestError("provider_unreachable") from exc
        if response.status_code < 200 or response.status_code >= 300:
            raise PostmarkRequestError(
                "provider_rejected_request",
                status_code=response.status_code,
            )
        return response

    @staticmethod
    def _message_payload(message: PostmarkMessage) -> dict[str, object]:
        payload: dict[str, object] = {
            "From": message.from_email,
            "To": message.to_email,
            "Subject": message.subject,
        }
        if message.from_name:
            payload["From"] = f"{message.from_name} <{message.from_email}>"
        if message.html_body is not None:
            payload["HtmlBody"] = message.html_body
        if message.text_body is not None:
            payload["TextBody"] = message.text_body
        if message.reply_to:
            payload["ReplyTo"] = message.reply_to
        if message.tag:
            payload["Tag"] = message.tag
        return payload

    @staticmethod
    def _parse_result(value: object) -> PostmarkSendResult:
        if not isinstance(value, dict):
            raise PostmarkRequestError("invalid_provider_response")
        error_code = value.get("ErrorCode")
        error_message = value.get("Message")
        message_id = value.get("MessageID")
        accepted = error_code in (None, 0, "0") and bool(message_id)
        try:
            normalized_message_id = UUID(str(message_id)) if message_id else None
        except (ValueError, TypeError, AttributeError) as exc:
            raise PostmarkRequestError("invalid_provider_message_id") from exc
        return PostmarkSendResult(
            accepted=accepted,
            provider_message_id=normalized_message_id,
            error_code=int(error_code) if isinstance(error_code, (int, str)) and str(error_code).isdigit() else None,
            error_message=str(error_message) if error_message else None,
        )


__all__ = ["PostmarkClient"]
