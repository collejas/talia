"""Utilidades para almacenar PDFs/documentos multitenant de asistentes."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
from fastapi import UploadFile

from app.core.config import settings
from app.repositories.crm import CRMRepository, CRMRepositoryError

ASSISTANT_DOCUMENT_BUCKET = "assistant_documents"
ASSISTANT_DOCUMENT_DOWNLOAD_ROUTE = "/api/crm/public/assistant-documents"
ALLOWED_ASSISTANT_DOCUMENT_MIME_TYPES = {"application/pdf"}
ALLOWED_ASSISTANT_DOCUMENT_EXTENSIONS = {".pdf"}
ALLOWED_ASSISTANT_DOCUMENT_SCOPES = {"email", "whatsapp", "both"}
ASSISTANT_DOCUMENT_DOWNLOAD_TTL_SECONDS = 3600


class AssistantDocumentError(RuntimeError):
    """Errores al subir o resolver documentos del asistente."""


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _normalize_category(value: str | None) -> str | None:
    category = _normalize_text(value)
    if not category:
        return None
    return category.lower()


def _normalize_scope(value: Any) -> str | None:
    scope = _normalize_text(str(value)) if value is not None else None
    if not scope:
        return None
    lowered = scope.lower()
    if lowered in ALLOWED_ASSISTANT_DOCUMENT_SCOPES:
        return lowered
    return None


def _resolve_public_base_url() -> str | None:
    candidates = [
        getattr(settings, "cliente_portal_base_url", None),
    ]
    for candidate in candidates:
        if candidate:
            return candidate.rstrip("/")
    return "https://talia.mx"


def _resolve_delivery_secret() -> str | None:
    candidates = [
        getattr(settings, "secrets_master_key_high", None),
        getattr(settings, "secrets_master_key", None),
        getattr(settings, "supabase_jwt_secret", None),
    ]
    for candidate in candidates:
        if candidate:
            return str(candidate).strip() or None
    return None


def _encode_delivery_token(payload: dict[str, Any]) -> str:
    secret = _resolve_delivery_secret()
    if not secret:
        raise AssistantDocumentError("No hay secreto configurado para firmar enlaces de documentos.")
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    signature_b64 = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{payload_b64}.{signature_b64}"


def build_public_delivery_url(
    *,
    document_id: UUID,
    organizacion_id: UUID,
    channel_scope: str | None = None,
    expires_in: int = ASSISTANT_DOCUMENT_DOWNLOAD_TTL_SECONDS,
) -> str | None:
    base_url = _resolve_public_base_url()
    if not base_url:
        return None
    token_payload = {
        "document_id": str(document_id),
        "organizacion_id": str(organizacion_id),
        "channel_scope": _normalize_scope(channel_scope) or "whatsapp",
        "exp": int(time.time()) + max(60, int(expires_in or ASSISTANT_DOCUMENT_DOWNLOAD_TTL_SECONDS)),
    }
    token = _encode_delivery_token(token_payload)
    return f"{base_url}{ASSISTANT_DOCUMENT_DOWNLOAD_ROUTE}/{document_id}?token={token}"


def _validate_pdf_filename(filename: str | None) -> None:
    safe_name = Path(filename or "").name
    if not safe_name:
        raise AssistantDocumentError("El archivo debe tener un nombre válido.")
    if Path(safe_name).suffix.lower() not in ALLOWED_ASSISTANT_DOCUMENT_EXTENSIONS:
        raise AssistantDocumentError("Solo se permiten archivos PDF.")


async def upload_assistant_document(
    *,
    file: UploadFile,
    organizacion_id: UUID,
    category: str | None = None,
) -> dict[str, Any]:
    """Sube un PDF a Storage y devuelve su metadata normalizada."""

    if not settings.supabase_url:
        raise AssistantDocumentError("Supabase no está configurado (SUPABASE_URL)")

    _validate_pdf_filename(file.filename)
    content = await file.read()
    if not content:
        raise AssistantDocumentError("El archivo PDF está vacío.")

    content_type = _normalize_text(file.content_type) or "application/pdf"
    if content_type not in ALLOWED_ASSISTANT_DOCUMENT_MIME_TYPES:
        raise AssistantDocumentError("Solo se permiten archivos PDF.")

    category_value = _normalize_category(category) or "general"
    object_key = f"{organizacion_id}/{category_value}/{uuid4().hex}.pdf"

    repo = CRMRepository()
    try:
        storage_path = await repo.upload_storage_object(
            bucket=ASSISTANT_DOCUMENT_BUCKET,
            object_key=object_key,
            content=content,
            content_type=content_type,
        )
    except CRMRepositoryError as exc:
        raise AssistantDocumentError(str(exc)) from exc

    safe_name = Path(file.filename or "documento.pdf").name
    return {
        "storage_bucket": ASSISTANT_DOCUMENT_BUCKET,
        "storage_path": storage_path,
        "url": None,
        "mime": content_type,
        "size_bytes": len(content),
        "name": safe_name,
        "category": category_value,
    }


def _row_matches_document_ids(row: dict[str, Any], document_ids: set[str]) -> bool:
    if not document_ids:
        return True
    row_id = str(row.get("id") or "").strip()
    return row_id in document_ids


def _row_matches_scope(row: dict[str, Any], channel_scope: str | None) -> bool:
    if not channel_scope:
        return True
    row_scope = _normalize_scope(row.get("channel_scope")) or "both"
    if row_scope == "both":
        return True
    return row_scope == channel_scope


async def list_assistant_documents_for_delivery(
    *,
    organizacion_id: UUID,
    channel_scope: str | None = None,
    document_ids: Sequence[str] | None = None,
    category: str | None = None,
    active: bool = True,
    limit: int = 3,
    repo: CRMRepository | None = None,
) -> list[dict[str, Any]]:
    """Resuelve documentos activos y les agrega URL firmada para entrega."""

    normalized_scope = _normalize_scope(channel_scope)
    normalized_category = _normalize_category(category)
    normalized_ids = {
        str(item).strip()
        for item in (document_ids or [])
        if str(item).strip()
    }
    repo = repo or CRMRepository()

    rows = await repo.list_assistant_documents(
        organizacion_id=organizacion_id,
        channel_scope=None,
        category=normalized_category,
        active=active,
        limit=max(1, min(limit, 10)),
    )

    filtered_rows: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if normalized_ids and not _row_matches_document_ids(row, normalized_ids):
            continue
        if not _row_matches_scope(row, normalized_scope):
            continue
        filtered_rows.append(row)

    if normalized_ids and not filtered_rows:
        fallback_rows = await repo.list_assistant_documents(
            organizacion_id=organizacion_id,
            channel_scope=None,
            active=active,
            limit=max(1, min(limit, 10)),
        )
        for row in fallback_rows:
            if not isinstance(row, dict):
                continue
            if _row_matches_document_ids(row, normalized_ids):
                filtered_rows.append(row)

    documents: list[dict[str, Any]] = []
    for row in filtered_rows[: max(1, min(limit, 10))]:
        storage_bucket = row.get("storage_bucket")
        storage_path = row.get("storage_path")
        signed_url = None
        delivery_url = None
        if isinstance(storage_bucket, str) and isinstance(storage_path, str) and storage_bucket and storage_path:
            try:
                signed_url = await repo.create_signed_storage_url(
                    bucket=storage_bucket,
                    object_path=storage_path,
                    expires_in=3600,
                )
            except CRMRepositoryError:
                signed_url = None
            try:
                document_id = UUID(str(row.get("id") or ""))
            except ValueError:
                document_id = None
            if document_id:
                try:
                    delivery_url = build_public_delivery_url(
                        document_id=document_id,
                        organizacion_id=organizacion_id,
                        channel_scope=row.get("channel_scope") or channel_scope,
                    )
                except AssistantDocumentError:
                    delivery_url = None
        enriched = dict(row)
        enriched["url"] = signed_url
        if delivery_url:
            enriched["delivery_url"] = delivery_url
        documents.append(enriched)
    return documents


async def download_document_bytes(url: str) -> bytes:
    """Descarga un documento usando su URL firmada."""

    normalized_url = _normalize_text(url)
    if not normalized_url:
        raise AssistantDocumentError("La URL del documento es inválida.")
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(normalized_url)
    if response.status_code >= 400:
        raise AssistantDocumentError(
            f"No se pudo descargar el documento (http_{response.status_code})."
        )
    return response.content


async def download_storage_object_bytes(*, bucket: str, object_path: str) -> bytes:
    """Descarga un objeto de Storage usando credenciales de servicio."""

    repo = CRMRepository()
    return await repo.download_storage_object(bucket=bucket, object_path=object_path)
