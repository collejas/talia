"""Cliente Zoom (Server-to-Server OAuth) para agenda."""

from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.logging import get_logger
from app.services.tenant_runtime import ZoomRuntimeSettings

logger = get_logger("app.services.zoom")


class ZoomError(RuntimeError):
    """Errores de integración con Zoom."""


@dataclass(slots=True)
class ZoomMeeting:
    meeting_id: str
    join_url: str
    start_url: str | None
    password: str | None
    raw: dict[str, Any]


def _to_zoom_datetime(value: datetime) -> str:
    dt = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ZoomClient:
    def __init__(
        self,
        *,
        runtime: ZoomRuntimeSettings,
        timeout_seconds: float = 15.0,
    ) -> None:
        self.runtime = runtime
        self.timeout_seconds = timeout_seconds

    def _token_headers(self) -> dict[str, str]:
        client_id = (self.runtime.client_id or "").strip()
        client_secret = (self.runtime.client_secret or "").strip()
        if not client_id or not client_secret:
            raise ZoomError("zoom_missing_client_credentials")
        basic_value = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode(
            "ascii"
        )
        return {
            "Authorization": f"Basic {basic_value}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

    async def get_access_token(self) -> str:
        account_id = (self.runtime.account_id or "").strip()
        if not account_id:
            raise ZoomError("zoom_missing_account_id")
        token_url = f"{self.runtime.api_base_url.rstrip('/')}/oauth/token"
        params = {
            "grant_type": "account_credentials",
            "account_id": account_id,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(token_url, params=params, headers=self._token_headers())
        except httpx.RequestError as exc:
            logger.exception("zoom.token_network_error", extra={"error": str(exc)})
            raise ZoomError("zoom_token_network_error") from exc
        if resp.status_code >= 400:
            logger.error(
                "zoom.token_error",
                extra={"status_code": resp.status_code, "body": resp.text[:1024]},
            )
            raise ZoomError("zoom_token_error")
        try:
            payload = resp.json()
        except ValueError as exc:
            raise ZoomError("zoom_token_invalid_response") from exc
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if not isinstance(token, str) or not token.strip():
            raise ZoomError("zoom_token_missing")
        return token.strip()

    async def _request(
        self,
        *,
        method: str,
        path: str,
        token: str,
        json_body: dict[str, Any] | None = None,
    ) -> httpx.Response:
        url = f"{self.runtime.api_base_url.rstrip('/')}{path}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.request(method, url, headers=headers, json=json_body)
        except httpx.RequestError as exc:
            logger.exception(
                "zoom.request_network_error",
                extra={"path": path, "method": method, "error": str(exc)},
            )
            raise ZoomError("zoom_network_error") from exc
        if resp.status_code >= 400:
            logger.error(
                "zoom.request_error",
                extra={
                    "path": path,
                    "method": method,
                    "status_code": resp.status_code,
                    "body": resp.text[:1024],
                },
            )
            raise ZoomError(f"zoom_api_error:{resp.status_code}")
        return resp

    async def create_meeting(
        self,
        *,
        start_at: datetime,
        duration_minutes: int,
        timezone_name: str,
        topic: str,
        agenda: str | None = None,
        host_email: str | None = None,
    ) -> ZoomMeeting:
        token = await self.get_access_token()
        user_id = (host_email or self.runtime.host_email or "me").strip() or "me"
        body: dict[str, Any] = {
            "topic": topic.strip() or "Demo Tal-IA",
            "type": 2,
            "start_time": _to_zoom_datetime(start_at),
            "duration": max(1, min(int(duration_minutes), 240)),
            "timezone": timezone_name or "America/Mexico_City",
            "agenda": (agenda or "").strip() or None,
            "settings": {
                "join_before_host": False,
                "waiting_room": True,
            },
        }
        body = {k: v for k, v in body.items() if v is not None}
        resp = await self._request(
            method="POST",
            path=f"/v2/users/{user_id}/meetings",
            token=token,
            json_body=body,
        )
        try:
            payload = resp.json()
        except ValueError as exc:
            raise ZoomError("zoom_create_invalid_response") from exc
        if not isinstance(payload, dict):
            raise ZoomError("zoom_create_invalid_payload")
        meeting_id = payload.get("id")
        join_url = payload.get("join_url")
        if meeting_id is None or not isinstance(join_url, str) or not join_url.strip():
            raise ZoomError("zoom_create_missing_fields")
        start_url = payload.get("start_url")
        password = payload.get("password")
        return ZoomMeeting(
            meeting_id=str(meeting_id),
            join_url=join_url.strip(),
            start_url=start_url.strip() if isinstance(start_url, str) and start_url.strip() else None,
            password=password.strip() if isinstance(password, str) and password.strip() else None,
            raw=payload,
        )

    async def update_meeting(
        self,
        *,
        meeting_id: str,
        start_at: datetime,
        duration_minutes: int,
        timezone_name: str,
        topic: str | None = None,
        agenda: str | None = None,
    ) -> None:
        token = await self.get_access_token()
        body: dict[str, Any] = {
            "start_time": _to_zoom_datetime(start_at),
            "duration": max(1, min(int(duration_minutes), 240)),
            "timezone": timezone_name or "America/Mexico_City",
            "topic": (topic or "").strip() or None,
            "agenda": (agenda or "").strip() or None,
        }
        body = {k: v for k, v in body.items() if v is not None}
        await self._request(
            method="PATCH",
            path=f"/v2/meetings/{meeting_id}",
            token=token,
            json_body=body,
        )

    async def cancel_meeting(self, *, meeting_id: str) -> None:
        token = await self.get_access_token()
        await self._request(
            method="DELETE",
            path=f"/v2/meetings/{meeting_id}",
            token=token,
            json_body=None,
        )
