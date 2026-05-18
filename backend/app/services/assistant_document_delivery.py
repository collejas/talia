"""Ayudas para listar y entregar documentos de asistentes."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any
from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.repositories.crm import CRMRepository
from app.services import assistant_documents


def parse_document_filter_arguments(
    arguments: dict[str, Any],
    *,
    default_limit: int = 3,
) -> tuple[list[str], str | None, int]:
    document_ids: list[str] = []
    raw_ids = arguments.get("assistant_document_ids") or arguments.get("document_ids")
    if isinstance(raw_ids, list):
        for item in raw_ids:
            item_text = str(item or "").strip()
            if item_text and item_text not in document_ids:
                document_ids.append(item_text)

    category = arguments.get("assistant_document_category") or arguments.get("category")
    category_text = str(category).strip() if category is not None else ""
    category_value = category_text or None

    limit_raw = arguments.get("assistant_document_limit") or arguments.get("document_limit")
    try:
        limit = int(str(limit_raw).strip()) if limit_raw is not None else default_limit
    except (TypeError, ValueError):
        limit = default_limit
    return document_ids, category_value, max(1, min(limit, 10))


def parse_delivery_channels(arguments: dict[str, Any], *, default_channel: str) -> list[str]:
    channels_raw = arguments.get("delivery_channels") or arguments.get("channels")
    channels: list[str] = []
    if isinstance(channels_raw, list):
        for item in channels_raw:
            value = str(item or "").strip().lower()
            if value in {"email", "whatsapp"} and value not in channels:
                channels.append(value)
    elif isinstance(channels_raw, str):
        value = channels_raw.strip().lower()
        if value in {"email", "whatsapp"}:
            channels.append(value)
        elif value == "both":
            channels.extend(["email", "whatsapp"])

    if not channels:
        normalized = default_channel.strip().lower()
        if normalized in {"email", "whatsapp"}:
            channels = [normalized]
        else:
            channels = ["email"]
    return channels


def build_document_manifest(documents: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for document in documents:
        if not isinstance(document, dict):
            continue
        manifest.append(
            {
                "id": document.get("id"),
                "title": document.get("title"),
                "description": document.get("description"),
                "channel_scope": document.get("channel_scope"),
                "category": document.get("category"),
                "tags": document.get("tags") or [],
                "active": document.get("active"),
                "sort_order": document.get("sort_order"),
                "mime": document.get("mime"),
                "size_bytes": document.get("size_bytes"),
                "url": document.get("url"),
            }
        )
    return manifest


async def resolve_documents_for_context(
    *,
    context: ToolRuntimeContext,
    channel_scope: str,
    document_ids: Sequence[str] | None = None,
    category: str | None = None,
    limit: int = 3,
) -> list[dict[str, Any]]:
    if not context.organizacion_id:
        return []
    try:
        organizacion_id = UUID(context.organizacion_id)
    except ValueError:
        return []
    return await assistant_documents.list_assistant_documents_for_delivery(
        organizacion_id=organizacion_id,
        channel_scope=channel_scope,
        document_ids=document_ids,
        category=category,
        limit=limit,
        repo=CRMRepository(),
    )


async def build_email_attachments(
    documents: Sequence[dict[str, Any]],
) -> list[dict[str, object]]:
    attachments: list[dict[str, object]] = []
    for document in documents:
        if not isinstance(document, dict):
            continue
        url = str(document.get("url") or "").strip()
        if not url:
            continue
        content = await assistant_documents.download_document_bytes(url)
        title = str(document.get("title") or "").strip() or str(document.get("storage_path") or "documento")
        filename = Path(title).name
        if not filename.lower().endswith(".pdf"):
            filename = f"{filename}.pdf"
        attachments.append(
            {
                "filename": filename,
                "content": content,
                "maintype": "application",
                "subtype": "pdf",
            }
        )
    return attachments


def build_whatsapp_attachments(
    documents: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    attachments: list[dict[str, Any]] = []
    for document in documents:
        if not isinstance(document, dict):
            continue
        url = str(document.get("url") or "").strip()
        if not url:
            continue
        title = str(document.get("title") or "").strip() or str(document.get("storage_path") or "documento")
        filename = Path(title).name
        if not filename.lower().endswith(".pdf"):
            filename = f"{filename}.pdf"
        attachments.append(
            {
                "url": url,
                "mime": str(document.get("mime") or "application/pdf"),
                "name": filename,
            }
        )
    return attachments
