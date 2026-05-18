"""Utilidades para almacenar PDFs/documentos multitenant de asistentes."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.config import settings
from app.repositories.crm import CRMRepository, CRMRepositoryError

ASSISTANT_DOCUMENT_BUCKET = "assistant_documents"
ALLOWED_ASSISTANT_DOCUMENT_MIME_TYPES = {"application/pdf"}
ALLOWED_ASSISTANT_DOCUMENT_EXTENSIONS = {".pdf"}


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
        signed_url = await repo.create_signed_storage_url(
            bucket=ASSISTANT_DOCUMENT_BUCKET,
            object_path=storage_path,
            expires_in=3600,
        )
    except CRMRepositoryError as exc:
        raise AssistantDocumentError(str(exc)) from exc

    safe_name = Path(file.filename or "documento.pdf").name
    return {
        "storage_bucket": ASSISTANT_DOCUMENT_BUCKET,
        "storage_path": storage_path,
        "url": signed_url,
        "mime": content_type,
        "size_bytes": len(content),
        "name": safe_name,
        "category": category_value,
    }
