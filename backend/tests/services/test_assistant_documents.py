"""Pruebas para la biblioteca de documentos de asistentes."""

from io import BytesIO
from typing import Any
from uuid import UUID

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.services import assistant_documents


class FakeAssistantDocumentRepository:
    """Repositorio simulado para validar la subida del documento."""

    def __init__(self) -> None:
        self.upload_calls: list[dict[str, Any]] = []
        self.sign_calls: list[dict[str, Any]] = []

    async def upload_storage_object(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        self.upload_calls.append(
            {
                "bucket": bucket,
                "object_key": object_key,
                "content": content,
                "content_type": content_type,
            }
        )
        return f"{bucket}/{object_key}"

    async def create_signed_storage_url(
        self,
        *,
        bucket: str,
        object_path: str,
        expires_in: int = 300,
    ) -> str:
        self.sign_calls.append(
            {
                "bucket": bucket,
                "object_path": object_path,
                "expires_in": expires_in,
            }
        )
        return f"https://signed.example/{bucket}/{object_path}?exp={expires_in}"


def _make_pdf_upload(filename: str = "catalogo.pdf", content: bytes = b"%PDF-1.4\ncontenido") -> UploadFile:
    return UploadFile(
        filename=filename,
        file=BytesIO(content),
        headers=Headers({"content-type": "application/pdf"}),
    )


@pytest.mark.asyncio
async def test_upload_assistant_document_generates_storage_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(assistant_documents.settings, "supabase_url", "https://example.supabase.co")

    fake_repo = FakeAssistantDocumentRepository()
    monkeypatch.setattr(assistant_documents, "CRMRepository", lambda: fake_repo)

    result = await assistant_documents.upload_assistant_document(
        file=_make_pdf_upload(),
        organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
        category="Ventas",
    )

    assert result["storage_bucket"] == assistant_documents.ASSISTANT_DOCUMENT_BUCKET
    assert result["mime"] == "application/pdf"
    assert result["size_bytes"] > 0
    assert result["category"] == "ventas"
    assert result["url"].startswith("https://signed.example/")
    assert fake_repo.upload_calls[0]["bucket"] == assistant_documents.ASSISTANT_DOCUMENT_BUCKET
    assert fake_repo.sign_calls[0]["bucket"] == assistant_documents.ASSISTANT_DOCUMENT_BUCKET


@pytest.mark.asyncio
async def test_upload_assistant_document_rejects_non_pdf_extension(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(assistant_documents.settings, "supabase_url", "https://example.supabase.co")

    with pytest.raises(assistant_documents.AssistantDocumentError, match="Solo se permiten archivos PDF"):
        await assistant_documents.upload_assistant_document(
            file=_make_pdf_upload(filename="catalogo.txt"),
            organizacion_id=UUID("00000000-0000-0000-0000-000000000002"),
        )
