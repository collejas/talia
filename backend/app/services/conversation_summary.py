"""Generación y persistencia de resúmenes de conversaciones."""

from __future__ import annotations

import json
import time
from typing import Any
from uuid import UUID

from openai import AsyncOpenAI

from app.assistants.manager import AssistantConfig
from app.core.config import settings
from app.core.logging import get_logger
from app.services import openai as openai_service, openai_usage_ledger, storage, tenant_runtime
from app.services.context_formatter import build_crm_context_lines
from app.services.storage import StorageError

logger = get_logger("app.services.conversation_summary")


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return dict(parsed)
        except json.JSONDecodeError:
            return {}
    return {}


def _ensure_metadata_with_type(metadata: dict[str, Any] | None) -> dict[str, Any]:
    normalized = _ensure_dict(metadata)
    normalized.setdefault("type", "summary_text")
    return normalized


def _format_message_line(message: dict[str, Any]) -> str:
    direction = message.get("direccion") or ""
    actor = "Cliente" if direction == "entrante" else "Asistente"
    timestamp = message.get("creado_en")
    timestamp_part = f" [{timestamp}]" if timestamp else ""
    text_parts: list[str] = []
    texto = str(message.get("texto") or "").strip()
    if texto:
        text_parts.append(texto)
    attachments = message.get("attachments") or []
    attachment_descriptions: list[str] = []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        name = str(attachment.get("nombre") or attachment.get("mime") or "archivo").strip()
        url = str(
            attachment.get("url")
            or attachment.get("path")
            or attachment.get("storage_path")
            or attachment.get("proveedor_id")
            or ""
        ).strip()
        if name and url:
            attachment_descriptions.append(f"{name} ({url})")
        elif name:
            attachment_descriptions.append(name)
        elif url:
            attachment_descriptions.append(url)
    if attachment_descriptions:
        text_parts.append("Archivos: " + "; ".join(attachment_descriptions))
    if not text_parts:
        text_parts.append("(sin texto)")
    return f"{actor}{timestamp_part}: {' '.join(text_parts)}"


def _build_prompt(messages: list[dict[str, Any]], context_data: dict[str, Any] | None = None) -> str:
    lines = [_format_message_line(message) for message in messages]
    context_lines = build_crm_context_lines(context_data)
    if context_lines:
        lines.append("")
        lines.extend(context_lines)
    instruction = (
        "Eres un asistente que resume conversaciones de ventas en español. "
        "Resume lo esencial en máximo tres frases, identifica la necesidad principal, "
        "menciona si hay una oportunidad abierta y sugiere el siguiente paso."
    )
    return f"{instruction}\n\nMensajes recientes:\n" + "\n".join(lines)


def _extract_text_from_response(payload: dict[str, Any]) -> str | None:
    output_items = payload.get("output") or []
    fragments: list[str] = []
    for item in output_items:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") == "output_text":
                text = content.get("text")
                if text:
                    fragments.append(str(text).strip())
    if fragments:
        return "\n".join(fragment for fragment in fragments if fragment)
    if payload.get("status") in {"completed"} and payload.get("output"):
        return None
    logger.warning("conversation_summary.requires_action", extra={"output": payload.get("output")})
    return None


def _resolve_organizacion_uuid(value: str | UUID | None) -> UUID | None:
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        try:
            return UUID(value)
        except (TypeError, ValueError):
            return None
    return None


async def _summarize_messages(
    messages: list[dict[str, Any]],
    *,
    conversation_id: str | None = None,
    contact_id: str | None = None,
    organizacion_id: UUID | None = None,
    context_data: dict[str, Any] | None = None,
) -> str | None:
    if not messages:
        return None
    prompt_text = _build_prompt(messages, context_data=context_data)
    api_key = await tenant_runtime.get_openai_api_key(organizacion_id=organizacion_id)
    project_id = await tenant_runtime.get_openai_project_id(organizacion_id=organizacion_id)
    client: AsyncOpenAI = openai_service.get_assistant_client(api_key=api_key, project_id=project_id)
    try:
        started = time.perf_counter()
        response = await client.responses.create(
            model=settings.conversation_summary_model,
            temperature=settings.conversation_summary_temperature,
            max_output_tokens=settings.conversation_summary_max_output_tokens,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": prompt_text,
                        }
                    ],
                }
            ],
            text={"format": {"type": "text"}},
        )
    except Exception as exc:  # pragma: no cover
        logger.exception("conversation_summary.llm_failed", exc_info=exc)
        return None
    response_data = response.model_dump()
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    await openai_usage_ledger.record_response_usage(
        organizacion_id=organizacion_id,
        channel="summary",
        feature="conversation_summary",
        assistant=AssistantConfig(project_id=project_id),
        response_payload=response_data,
        request_purpose="summary",
        latency_ms=int(elapsed_ms),
        api_key=api_key,
        request_metadata={"history_messages": len(messages)},
        conversation_id=conversation_id,
        contact_id=contact_id,
        model_override=settings.conversation_summary_model,
        project_id=project_id,
    )
    text = _extract_text_from_response(response_data)
    if not text:
        return None
    return text.strip()


async def ensure_conversation_summary(
    *,
    conversation_id: str,
    contact_id: str | None = None,
    organizacion_id: str | UUID | None = None,
    tipo: str = "conversation",
    context_data: dict[str, Any] | None = None,
    generate_if_missing: bool = True,
) -> dict[str, Any] | None:
    """Garantiza que exista un resumen actualizado para la conversación."""
    summary: dict[str, Any] | None
    try:
        summary = await storage.fetch_latest_conversation_summary(
            conversation_id=conversation_id,
            tipo=tipo,
        )
    except StorageError as exc:
        logger.warning(
            "conversation_summary.fetch_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        summary = None

    if not generate_if_missing and not summary:
        return None

    try:
        messages = await storage.fetch_recent_messages(
            conversation_id=conversation_id,
            limit=settings.conversation_summary_history_limit,
        )
    except StorageError as exc:
        logger.warning(
            "conversation_summary.messages_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        messages = []

    organizacion_uuid = _resolve_organizacion_uuid(organizacion_id)
    if not messages:
        if summary:
            summary["metadatos"] = _ensure_metadata_with_type(summary.get("metadatos"))
        return summary

    last_message = messages[-1]
    last_message_id = str(last_message.get("id") or "").strip()
    if summary:
        metadata = _ensure_metadata_with_type(summary.get("metadatos"))
        if metadata.get("last_message_id") == last_message_id:
            summary["metadatos"] = metadata
        return summary
    else:
        if not generate_if_missing:
            return None
        metadata = {}

    summary_text = await _summarize_messages(
        messages,
        conversation_id=conversation_id,
        contact_id=contact_id,
        organizacion_id=organizacion_uuid,
        context_data=context_data,
    )
    if not summary_text:
        if summary:
            summary["metadatos"] = metadata
        return summary

    new_metadata = {
        "last_message_id": last_message_id,
        "last_message_timestamp": str(last_message.get("creado_en") or ""),
        "messages_count": len(messages),
    }
    new_metadata = _ensure_metadata_with_type(new_metadata)
    try:
        resolved_org_id: str | None
        if organizacion_uuid:
            resolved_org_id = str(organizacion_uuid)
        else:
            resolved_org_id = None
        created = await storage.create_conversation_summary(
            conversation_id=conversation_id,
            resumen=summary_text,
            contacto_id=contact_id,
            organizacion_id=resolved_org_id,
            tipo=tipo,
            metadatos=new_metadata,
        )
    except StorageError as exc:
        logger.warning(
            "conversation_summary.create_failed",
            extra={
                "conversation_id": conversation_id,
                "error": str(exc),
            },
        )
        if summary:
            summary["metadatos"] = metadata
        return summary

    created["metadatos"] = _ensure_dict(created.get("metadatos"))
    return created
