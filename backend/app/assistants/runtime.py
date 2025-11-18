"""Utilidades compartidas para resolver asistentes configurados en OpenAI."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from .manager import AssistantConfig


@dataclass(slots=True)
class AssistantSpec:
    """Especificación remota de un asistente almacenado en OpenAI."""

    model: str
    instructions: str | None
    tools: list[dict[str, Any]]


_ASSISTANT_CACHE: dict[str, AssistantSpec] = {}


async def resolve_assistant_spec(client: AsyncOpenAI, assistant_id: str) -> AssistantSpec:
    """Recupera y cachea la especificación del asistente remoto."""
    cached = _ASSISTANT_CACHE.get(assistant_id)
    if cached:
        return cached

    record = await client.beta.assistants.retrieve(assistant_id=assistant_id)
    dump = record.model_dump()
    tools_dump = dump.get("tools") or []
    tools: list[dict[str, Any]] = []
    for tool in tools_dump:
        if isinstance(tool, dict):
            tools.append(tool)
            continue
        try:
            tools.append(tool.model_dump(exclude_none=True))
        except AttributeError:  # pragma: no cover - defensivo ante SDKs futuros
            tools.append(dict(tool))

    spec = AssistantSpec(
        model=_extract_model(dump, assistant_id),
        instructions=dump.get("instructions"),
        tools=tools,
    )
    _ASSISTANT_CACHE[assistant_id] = spec
    return spec


def build_prompt_payload(assistant: AssistantConfig, variables: dict[str, Any]) -> dict[str, Any]:
    """Compone el payload requerido por Responses cuando se usa un prompt fijo."""
    if not assistant.prompt_id:
        raise ValueError("No se definió prompt_id para el asistente configurado")
    payload: dict[str, Any] = {
        "id": assistant.prompt_id,
        "variables": variables,
    }
    if assistant.prompt_version:
        payload["version"] = assistant.prompt_version
    return payload


def _extract_model(dump: dict[str, Any], assistant_id: str) -> str:
    """Obtiene el modelo declarado en el asistente o lanza error descriptivo."""
    model = dump.get("model")
    if not model:
        raise ValueError(f"El asistente {assistant_id} no tiene modelo configurado")
    return str(model)
