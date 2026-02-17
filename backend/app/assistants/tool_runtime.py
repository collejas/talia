"""Shared runtime helpers for assistant tool calls."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from app.assistants.manager import AssistantConfig
from app.assistants.runtime import AssistantSpec
from app.core.logging import get_logger

logger = get_logger("app.assistants.tool_runtime")


@dataclass(slots=True)
class ToolRuntimeContext:
    """Contexto mínimo para ejecutar function calls."""

    conversation_id: str
    contact_id: str
    session_id: str | None = None
    channel: str | None = None


@dataclass(slots=True)
class ToolRuntimeResult:
    """Resultado agregado del bucle de Responses."""

    response: dict[str, Any]
    conversation_id: str | None
    response_id: str | None
    tools_called: list[str]
    tool_call_ids: list[str]
    side_effects: dict[str, Any]


ExecuteToolFn = Callable[[str | None, Any, ToolRuntimeContext], Awaitable[dict[str, Any]]]
RequestTemplateFn = Callable[[], dict[str, Any]]


async def run_tool_loop(
    *,
    client: Any,
    assistant: AssistantConfig,
    assistant_spec: AssistantSpec | None,
    context: ToolRuntimeContext,
    initial_request: dict[str, Any],
    request_template: RequestTemplateFn,
    execute_tool: ExecuteToolFn,
    openai_conversation_id: str | None,
    previous_response_id: str | None,
    log=logger,
) -> ToolRuntimeResult:
    """Ejecuta Responses API resolviendo function calls hasta obtener texto final."""

    request_kwargs = dict(initial_request)
    # Preserva controles importantes entre iteraciones (después de function_call_output),
    # porque el loop reemplaza request_kwargs y, por defecto, perdería límites como
    # max_output_tokens/temperature, provocando respuestas largas o inconsistentes.
    preserved_controls: dict[str, Any] = {}
    for key in ("max_output_tokens", "temperature", "top_p", "metadata"):
        if key in request_kwargs:
            preserved_controls[key] = request_kwargs[key]
    latest_conversation_id = openai_conversation_id
    latest_response_id = previous_response_id
    side_effects: dict[str, Any] = {}
    tools_called: list[str] = []
    tool_call_ids: list[str] = []

    while True:
        response = await client.responses.create(**request_kwargs)
        response_dict = response.model_dump()
        latest_response_id = response_dict.get("id") or latest_response_id
        conversation_obj = response_dict.get("conversation") or {}
        latest_conversation_id = conversation_obj.get("id") or latest_conversation_id

        output_items = response_dict.get("output") or []
        pending_calls = [item for item in output_items if item.get("type") == "function_call"]

        if not pending_calls:
            return ToolRuntimeResult(
                response=response_dict,
                conversation_id=latest_conversation_id,
                response_id=latest_response_id,
                tools_called=tools_called,
                tool_call_ids=tool_call_ids,
                side_effects=side_effects,
            )

        follow_up_inputs: list[dict[str, Any]] = []
        for call in pending_calls:
            name = call.get("name")
            call_id = call.get("call_id")
            arguments = call.get("arguments")
            try:
                result = await execute_tool(name, arguments, context)
            except Exception as exc:  # pragma: no cover - defensivo
                log.exception(
                    "assistant.tool_execution_failed",
                    extra={
                        "conversation_id": context.conversation_id,
                        "tool": name,
                        "error": str(exc),
                    },
                )
                result = {"status": "error", "message": str(exc)}
            extras = None
            if isinstance(result, dict):
                extras = result.pop("_side_effects", None)
                if isinstance(extras, dict):
                    side_effects.update(extras)
            payload = {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps(result, ensure_ascii=False),
            }
            follow_up_inputs.append(payload)
            if name:
                tools_called.append(str(name))
            if call_id:
                tool_call_ids.append(str(call_id))

        request_kwargs = {"input": follow_up_inputs, "store": True}
        if latest_conversation_id:
            request_kwargs["conversation"] = latest_conversation_id
        elif latest_response_id:
            request_kwargs["previous_response_id"] = latest_response_id

        # Reaplica prompt/model según el asistente configurado.
        request_kwargs.update(request_template())
        if preserved_controls:
            request_kwargs.update(preserved_controls)
