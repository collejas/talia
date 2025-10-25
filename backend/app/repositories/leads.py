"""Repositorio para operaciones del embudo de leads vía Supabase REST."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class LeadsRepositoryError(RuntimeError):
    """Errores derivados de llamadas a Supabase para leads."""


def _is_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        UUID(str(value))
    except ValueError:
        return False
    return True


@dataclass(slots=True)
class LeadsRepository:
    """Pequeña capa de acceso a Supabase REST para entidades del pipeline."""

    _base_url: str
    _service_role: str | None
    _anon_key: str | None

    def __init__(self) -> None:
        if not settings.supabase_url:
            raise LeadsRepositoryError("Supabase URL no configurada")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._anon_key = getattr(settings, "supabase_anon", None)

    async def fetch_board(self, *, token: str, selector: str | None) -> dict[str, Any]:
        """Obtiene el tablero visible para el usuario. Selector puede ser slug o UUID."""
        queries: list[dict[str, str]] = []
        if selector:
            queries.append({"slug": f"eq.{selector}"})
            if _is_uuid(selector):
                queries.append({"id": f"eq.{selector}"})
        else:
            queries.append({"es_default": "eq.true"})

        for query in queries:
            params = {
                "select": "id,nombre,slug,es_default,activo,propietario_usuario_id",
                "order": "creado_en.asc",
                "limit": "1",
            }
            params.update(query)
            response = await self._request(
                "GET",
                "/rest/v1/lead_tableros",
                token=token,
                params=params,
            )
            rows = self._json_list(response)
            if rows:
                return rows[0]
        raise LeadsRepositoryError("No se encontró un tablero accesible")

    async def list_boards(self, *, token: str) -> list[dict[str, Any]]:
        params = {"select": "id,nombre,slug,es_default,activo", "order": "creado_en.asc"}
        response = await self._request("GET", "/rest/v1/lead_tableros", token=token, params=params)
        return self._json_list(response)

    async def fetch_stages(self, *, board_id: str, token: str) -> list[dict[str, Any]]:
        params = {
            "select": "id,codigo,nombre,categoria,orden,probabilidad,sla_horas,metadatos",
            "tablero_id": f"eq.{board_id}",
            "order": "orden.asc",
        }
        response = await self._request("GET", "/rest/v1/lead_etapas", token=token, params=params)
        return self._json_list(response)

    async def fetch_cards(
        self,
        *,
        board_id: str,
        token: str,
        channels: Iterable[str] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": (
                "id,tablero_id,etapa_id,contacto_id,contacto_nombre,contacto_estado,"
                "contacto_telefono,contacto_correo,conversacion_id,canal,"
                "conversacion_estado,ultimo_mensaje_en,monto_estimado,moneda,"
                "probabilidad_override,lead_score,tags,metadata,asignado_a_usuario_id,"
                "asignado_nombre,propietario_usuario_id,propietario_nombre,cerrado_en,"
                "motivo_cierre,creado_en,actualizado_en,resumen,intencion,sentimiento,"
                "siguiente_accion"
            ),
            "tablero_id": f"eq.{board_id}",
            "order": "actualizado_en.desc",
        }
        if channels:
            payload = ",".join({channel.lower() for channel in channels})
            params["canal"] = f"in.({payload})"
        if limit:
            params["limit"] = str(limit)
        response = await self._request(
            "GET",
            "/rest/v1/embudo",
            token=token,
            params=params,
        )
        return self._json_list(response)

    async def fetch_card_by_id(self, *, card_id: str, token: str) -> dict[str, Any] | None:
        params = {
            "select": "id,etapa_id,tablero_id,contacto_id,canal,metadata,propietario_usuario_id,"
            "asignado_a_usuario_id",
            "id": f"eq.{card_id}",
            "limit": "1",
        }
        response = await self._request("GET", "/rest/v1/lead_tarjetas", token=token, params=params)
        rows = self._json_list(response)
        return rows[0] if rows else None

    async def fetch_card_by_conversation(
        self,
        *,
        conversation_id: str,
        token: str | None,
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,etapa_id,tablero_id,contacto_id,canal,metadata,"
            "propietario_usuario_id,asignado_a_usuario_id",
            "conversacion_id": f"eq.{conversation_id}",
            "limit": "1",
        }
        response = await self._request("GET", "/rest/v1/lead_tarjetas", token=token, params=params)
        rows = self._json_list(response)
        return rows[0] if rows else None

    async def fetch_conversation(
        self,
        *,
        conversation_id: str,
        token: str | None,
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,contacto_id,canal,asignado_a_usuario_id,estado,prioridad",
            "id": f"eq.{conversation_id}",
            "limit": "1",
        }
        response = await self._request("GET", "/rest/v1/conversaciones", token=token, params=params)
        rows = self._json_list(response)
        return rows[0] if rows else None

    async def fetch_card_detail(self, *, card_id: str, token: str) -> dict[str, Any] | None:
        params = {
            "select": (
                "id,tablero_id,etapa_id,contacto_id,contacto_nombre,contacto_estado,"
                "contacto_telefono,contacto_correo,conversacion_id,canal,"
                "conversacion_estado,ultimo_mensaje_en,monto_estimado,moneda,"
                "probabilidad_override,lead_score,tags,metadata,asignado_a_usuario_id,"
                "asignado_nombre,propietario_usuario_id,propietario_nombre,cerrado_en,"
                "motivo_cierre,creado_en,actualizado_en,resumen,intencion,sentimiento,"
                "siguiente_accion"
            ),
            "id": f"eq.{card_id}",
            "limit": "1",
        }
        response = await self._request("GET", "/rest/v1/embudo", token=token, params=params)
        rows = self._json_list(response)
        return rows[0] if rows else None

    async def create_card(
        self,
        *,
        payload: dict[str, Any],
        token: str | None,
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            "/rest/v1/lead_tarjetas",
            token=token,
            json=[payload],
            prefer="return=representation",
        )
        rows = self._json_list(response)
        if not rows:
            raise LeadsRepositoryError("Supabase no devolvió la tarjeta creada")
        return rows[0]

    async def update_card(
        self,
        *,
        card_id: str,
        patch: dict[str, Any],
        token: str | None,
    ) -> dict[str, Any]:
        response = await self._request(
            "PATCH",
            "/rest/v1/lead_tarjetas",
            token=token,
            params={"id": f"eq.{card_id}"},
            json=patch,
            prefer="return=representation",
        )
        rows = self._json_list(response)
        if not rows:
            raise LeadsRepositoryError("Tarjeta no encontrada o sin cambios")
        return rows[0]

    async def list_movements(self, *, card_id: str, token: str) -> list[dict[str, Any]]:
        params = {
            "select": "id,etapa_origen_id,etapa_destino_id,cambiado_por,cambiado_en,motivo,fuente,metadata",
            "tarjeta_id": f"eq.{card_id}",
            "order": "cambiado_en.desc",
            "limit": "100",
        }
        response = await self._request(
            "GET", "/rest/v1/lead_movimientos", token=token, params=params
        )
        return self._json_list(response)

    async def fetch_stage(self, *, stage_id: str, token: str) -> dict[str, Any] | None:
        params = {
            "select": "id,codigo,nombre,categoria,tablero_id,probabilidad,sla_horas,metadatos",
            "id": f"eq.{stage_id}",
            "limit": "1",
        }
        response = await self._request("GET", "/rest/v1/lead_etapas", token=token, params=params)
        rows = self._json_list(response)
        return rows[0] if rows else None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        token: str | None,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        url = f"{self._base_url}{path}"
        headers = self._headers(token, prefer, has_body=json is not None)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    headers=headers,
                )
        except httpx.RequestError as exc:
            logger.exception("supabase.request_failed", extra={"path": path, "error": str(exc)})
            raise LeadsRepositoryError(f"Error al conectar a Supabase: {exc}") from exc
        if response.status_code >= 400:
            logger.error(
                "supabase.response_error",
                extra={"path": path, "status": response.status_code, "body": response.text},
            )
            raise LeadsRepositoryError(
                f"Supabase respondió {response.status_code}: {response.text}"
            )
        return response

    def _headers(
        self,
        token: str | None,
        prefer: str | None,
        *,
        has_body: bool,
    ) -> dict[str, str]:
        headers: dict[str, str] = {"Accept": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        if has_body:
            headers["Content-Type"] = "application/json"

        if token:
            headers["Authorization"] = f"Bearer {token}"
            if self._anon_key:
                headers["apikey"] = self._anon_key
        elif self._service_role:
            headers["Authorization"] = f"Bearer {self._service_role}"
            headers["apikey"] = self._service_role
        else:
            raise LeadsRepositoryError("Falta SUPABASE_SERVICE_ROLE para realizar la operación")
        return headers

    @staticmethod
    def _json_list(response: httpx.Response) -> list[dict[str, Any]]:
        payload = response.json() or []
        if not isinstance(payload, list):
            raise LeadsRepositoryError("Respuesta inesperada de Supabase")
        return [row for row in payload if isinstance(row, dict)]
