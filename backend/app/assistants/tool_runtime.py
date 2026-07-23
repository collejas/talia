"""Shared runtime helpers for assistant tool calls."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from app.assistants.manager import AssistantConfig
from app.assistants.runtime import AssistantSpec
from app.core.logging import get_logger

logger = get_logger("app.assistants.tool_runtime")

try:  # pragma: no cover - fallback defensivo para SDKs antiguos
    from openai import APITimeoutError, APIConnectionError, InternalServerError, RateLimitError
except Exception:  # pragma: no cover
    APITimeoutError = APIConnectionError = InternalServerError = RateLimitError = tuple()  # type: ignore[assignment]


_RETRYABLE_TOOL_LOOP_ERRORS = (InternalServerError, APIConnectionError, APITimeoutError, RateLimitError)
_RETRY_DELAYS_SECONDS: tuple[float, ...] = (0.6, 1.5)
_MAX_TOOL_ERROR_MESSAGE_CHARS = 500


@dataclass(slots=True)
class ToolRuntimeContext:
    """Contexto mínimo para ejecutar function calls."""

    conversation_id: str
    persona_id: str | None = None
    session_id: str | None = None
    channel: str | None = None
    organizacion_id: str | None = None
    feature: str | None = None
    catalog_inmobiliario_enabled: bool = True
    catalog_no_inmobiliario_enabled: bool = True
    agenda_enabled: bool = True


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


def _is_retryable_openai_error(exc: Exception) -> bool:
    if _RETRYABLE_TOOL_LOOP_ERRORS and isinstance(exc, _RETRYABLE_TOOL_LOOP_ERRORS):
        return True
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int) and status_code in {408, 409, 429, 500, 502, 503, 504}:
        return True
    # Compatibilidad con wrappers o errores serializados sin clase fuerte.
    text = str(exc).lower()
    return "server_error" in text or "rate limit" in text or "timeout" in text


def classify_runtime_error(exc: Exception) -> dict[str, Any]:
    status_code = getattr(exc, "status_code", None)
    return {
        "error_type": exc.__class__.__name__,
        "status_code": status_code if isinstance(status_code, int) else None,
        "retryable": _is_retryable_openai_error(exc),
    }


def _build_tool_error_payload(exc: Exception) -> dict[str, Any]:
    message = str(exc).strip() or "tool execution failed"
    if len(message) > _MAX_TOOL_ERROR_MESSAGE_CHARS:
        message = message[: _MAX_TOOL_ERROR_MESSAGE_CHARS - 1].rstrip() + "…"
    return {
        "status": "error",
        "error_type": exc.__class__.__name__,
        "message": message,
    }


async def _create_response_with_retry(
    *,
    client: Any,
    request_kwargs: dict[str, Any],
    context: ToolRuntimeContext,
    log: Any,
) -> Any:
    max_attempts = len(_RETRY_DELAYS_SECONDS) + 1
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await client.responses.create(**request_kwargs)
        except Exception as exc:  # pragma: no cover - red/servicio externo
            last_exc = exc
            if attempt >= max_attempts or not _is_retryable_openai_error(exc):
                raise
            delay = _RETRY_DELAYS_SECONDS[attempt - 1]
            log.warning(
                "assistant.responses_retry",
                extra={
                    "conversation_id": context.conversation_id,
                    "attempt": attempt,
                    "max_attempts": max_attempts,
                    "delay_seconds": delay,
                    "error": str(exc),
                },
            )
            await asyncio.sleep(delay)
    if last_exc:
        raise last_exc
    raise RuntimeError("responses.create_retry_exhausted")


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
    api_key: str | None = None,
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
    tool_runtime_debug: dict[str, Any] = {
        "iterations": [],
        "tool_calls": [],
    }
    iteration_index = 0

    while True:
        response_started = time.perf_counter()
        response = await _create_response_with_retry(
            client=client,
            request_kwargs=request_kwargs,
            context=context,
            log=log,
        )
        response_ms = round((time.perf_counter() - response_started) * 1000, 2)
        response_dict = response.model_dump()
        latest_response_id = response_dict.get("id") or latest_response_id
        conversation_obj = response_dict.get("conversation") or {}
        latest_conversation_id = conversation_obj.get("id") or latest_conversation_id

        output_items = response_dict.get("output") or []
        pending_calls = [item for item in output_items if item.get("type") == "function_call"]
        tool_runtime_debug["iterations"].append(
            {
                "index": iteration_index,
                "response_ms": response_ms,
                "pending_calls": len(pending_calls),
                "response_id": latest_response_id,
            }
        )
        if context.organizacion_id and context.channel:
            from app.services import openai_usage_ledger

            await openai_usage_ledger.record_response_usage(
                organizacion_id=context.organizacion_id,
                channel=context.channel,
                feature=context.feature,
                assistant=assistant,
                response_payload=response_dict,
                request_purpose="tool_loop_iteration",
                latency_ms=int(round(response_ms)),
                api_key=api_key,
                request_metadata={
                    "iteration_index": iteration_index,
                    "pending_calls": len(pending_calls),
                },
                conversation_id=context.conversation_id,
                contact_id=context.persona_id,
                project_id=assistant.project_id,
            )
        iteration_index += 1

        if not pending_calls:
            side_effects["tool_runtime_debug"] = tool_runtime_debug
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
            tool_started = time.perf_counter()
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
                result = _build_tool_error_payload(exc)
            tool_ms = round((time.perf_counter() - tool_started) * 1000, 2)
            tool_runtime_debug["tool_calls"].append(
                {
                    "name": str(name) if name else None,
                    "call_id": str(call_id) if call_id else None,
                    "tool_ms": tool_ms,
                }
            )
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
