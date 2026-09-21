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
        "Eres un asistente que analiza conversaciones de ventas en español. "
        "Resume únicamente lo que el cliente expresó o confirmó; no inventes datos. "
        "Conserva detalles comerciales concretos como producto, uso, cantidad, ubicación, "
        "medidas, presupuesto, plazo, estilo, restricciones o preguntas. "
        "Devuelve exclusivamente JSON válido con estas claves: resumen_contexto, "
        "necesidad_proposito y siguiente_accion. "
        "resumen_contexto debe explicar el contexto general en máximo cuatro frases. "
        "necesidad_proposito debe ser una frase concreta y accionable sobre lo que busca el cliente; "
        "no uses frases genéricas si existen detalles específicos. "
        "siguiente_accion debe indicar un paso únicamente si está respaldado por la conversación; "
        "si no existe, usa una cadena vacía."
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


def _normalize_generated_insights(value: Any) -> dict[str, str]:
    """Normaliza la respuesta del modelo y conserva compatibilidad con texto legado."""
    if isinstance(value, dict):
        return {
            "resumen_contexto": str(value.get("resumen_contexto") or value.get("context_summary") or "").strip(),
            "necesidad_proposito": str(value.get("necesidad_proposito") or value.get("need") or "").strip(),
            "siguiente_accion": str(value.get("siguiente_accion") or value.get("next_step") or "").strip(),
        }
    text = str(value or "").strip()
    return {
        "resumen_contexto": text,
        "necesidad_proposito": text,
        "siguiente_accion": "",
    }


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
    persona_id: str | None = None,
    organizacion_id: UUID | None = None,
    context_data: dict[str, Any] | None = None,
) -> dict[str, str] | None:
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
            text={
                "format": {
                    "type": "json_schema",
                    "name": "conversation_insights",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "resumen_contexto": {"type": "string"},
                            "necesidad_proposito": {"type": "string"},
                            "siguiente_accion": {"type": "string"},
                        },
                        "required": ["resumen_contexto", "necesidad_proposito", "siguiente_accion"],
                        "additionalProperties": False,
                    },
                }
            },
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
        persona_id=persona_id,
        model_override=settings.conversation_summary_model,
        project_id=project_id,
    )
    text = _extract_text_from_response(response_data)
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = text.strip()
    normalized = _normalize_generated_insights(parsed)
    if not normalized["resumen_contexto"]:
        return None
    if not normalized["necesidad_proposito"]:
        normalized["necesidad_proposito"] = normalized["resumen_contexto"]
    return normalized


async def rebuild_conversation_summary(
    *,
    conversation_id: str,
    persona_id: str | None = None,
    organizacion_id: str | UUID | None = None,
    tipo: str = "conversation",
    context_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Regenera un resumen de conversación aunque ya exista uno previo."""
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
        return None

    if not messages:
        return None

    generated_raw = await _summarize_messages(
        messages,
        conversation_id=conversation_id,
        persona_id=persona_id,
        organizacion_id=_resolve_organizacion_uuid(organizacion_id),
        context_data=context_data,
    )
    if not generated_raw:
        return None
    generated = _normalize_generated_insights(generated_raw)
    summary_text = generated["resumen_contexto"]
    need_text = generated["necesidad_proposito"]
    next_step = generated["siguiente_accion"]

    last_message = messages[-1]
    last_message_id = str(last_message.get("id") or "").strip()
    new_metadata = _ensure_metadata_with_type(
        {
            "last_message_id": last_message_id,
            "last_message_timestamp": str(last_message.get("creado_en") or ""),
            "messages_count": len(messages),
            "recomputed_at": time.time(),
            "source": "recompute_job",
        }
    )
    try:
        resolved_org_id: str | None
        if isinstance(organizacion_id, UUID):
            resolved_org_id = str(organizacion_id)
        elif isinstance(organizacion_id, str):
            resolved_org_id = organizacion_id.strip() or None
        else:
            resolved_org_id = None
        created = await storage.create_conversation_summary(
            conversation_id=conversation_id,
            resumen=summary_text,
            persona_id=persona_id,
            organizacion_id=resolved_org_id,
            tipo=tipo,
            metadatos=new_metadata,
        )
    except StorageError as exc:
        logger.warning(
            "conversation_summary.rebuild_create_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return None

    created["metadatos"] = _ensure_dict(created.get("metadatos"))
    try:
        await storage.upsert_conversation_insights(
            conversation_id=conversation_id,
            resumen=summary_text,
            intencion=need_text,
            siguiente_accion=next_step or None,
        )
        await storage.refresh_persona_insights_from_conversation(
            conversation_id=conversation_id,
            persona_id=persona_id,
            summary_text=summary_text,
            need_text=need_text,
            next_step=next_step,
            force_generated=True,
            source="conversation_summary_rebuild",
        )
    except StorageError as exc:
        logger.warning(
            "conversation_summary.rebuild_insights_refresh_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
    return created


async def ensure_conversation_summary(
    *,
    conversation_id: str,
    persona_id: str | None = None,
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
        # Existe un resumen, pero ya no representa el último mensaje. Continúa
        # hasta regenerarlo con el historial actual y deja una nueva versión
        # auditable en conversation_summaries.
    else:
        if not generate_if_missing:
            return None
        metadata = {}

    generated_raw = await _summarize_messages(
        messages,
        conversation_id=conversation_id,
        persona_id=persona_id,
        organizacion_id=organizacion_uuid,
        context_data=context_data,
    )
    if not generated_raw:
        if summary:
            summary["metadatos"] = metadata
        return summary
    generated = _normalize_generated_insights(generated_raw)
    summary_text = generated["resumen_contexto"]
    need_text = generated["necesidad_proposito"]
    next_step = generated["siguiente_accion"]

    new_metadata = {
        "last_message_id": last_message_id,
        "last_message_timestamp": str(last_message.get("creado_en") or ""),
        "messages_count": len(messages),
        "source": "conversation_summary_refresh" if summary else "conversation_summary",
    }
    if summary and summary.get("id"):
        new_metadata["previous_summary_id"] = str(summary["id"])
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
            persona_id=persona_id,
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
    try:
        await storage.upsert_conversation_insights(
            conversation_id=conversation_id,
            resumen=summary_text,
            intencion=need_text,
            siguiente_accion=next_step or None,
        )
        await storage.refresh_persona_insights_from_conversation(
            conversation_id=conversation_id,
            persona_id=persona_id,
            summary_text=summary_text,
            need_text=need_text,
            next_step=next_step,
            force_generated=True,
            source="conversation_summary",
        )
    except StorageError as exc:
        logger.warning(
            "conversation_summary.insights_refresh_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
    return created
