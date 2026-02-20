import json

import pytest

from app.assistants.manager import AssistantConfig
from app.assistants.tool_runtime import ToolRuntimeContext, classify_runtime_error, run_tool_loop


class _DummyResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def model_dump(self) -> dict:
        return self._payload


class _DummyResponsesClient:
    def __init__(self, scripted_payloads: list[dict | Exception]):
        self._payloads = list(scripted_payloads)
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self._payloads:
            raise AssertionError("No hay más payloads scripted para el Dummy client.")
        next_item = self._payloads.pop(0)
        if isinstance(next_item, Exception):
            raise next_item
        return _DummyResponse(next_item)


class _DummyClient:
    def __init__(self, scripted_payloads: list[dict | Exception]):
        self.responses = _DummyResponsesClient(scripted_payloads)


@pytest.mark.asyncio
async def test_run_tool_loop_preserves_controls_between_iterations():
    client = _DummyClient(
        scripted_payloads=[
            {
                "id": "resp_1",
                "conversation": {"id": "conv_1"},
                "output": [
                    {
                        "type": "function_call",
                        "name": "set_full_name",
                        "call_id": "call_1",
                        "arguments": json.dumps({"full_name": "Edmundo"}),
                    }
                ],
            },
            {
                "id": "resp_2",
                "conversation": {"id": "conv_1"},
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "ok"}],
                    }
                ],
            },
        ]
    )

    assistant = AssistantConfig(assistant_id="asst_test", project_id="proj_test")
    context = ToolRuntimeContext(conversation_id="crm_conv", contact_id="crm_contact", channel="webchat")

    initial_request = {
        "input": [{"role": "user", "content": [{"type": "input_text", "text": "hola"}]}],
        "store": True,
        "max_output_tokens": 123,
        "temperature": 0.2,
        "metadata": {"channel": "webchat"},
        "model": "gpt-4o",
    }

    def request_template():
        return {"model": "gpt-4o"}

    async def execute_tool(name, args, ctx):
        assert name == "set_full_name"
        assert ctx.conversation_id == "crm_conv"
        return {"status": "ok"}

    await run_tool_loop(
        client=client,
        assistant=assistant,
        assistant_spec=None,
        context=context,
        initial_request=initial_request,
        request_template=request_template,
        execute_tool=execute_tool,
        openai_conversation_id=None,
        previous_response_id=None,
    )

    assert len(client.responses.calls) == 2
    first_call, second_call = client.responses.calls

    assert first_call["max_output_tokens"] == 123
    assert first_call["temperature"] == 0.2
    assert first_call["metadata"] == {"channel": "webchat"}

    assert second_call["max_output_tokens"] == 123
    assert second_call["temperature"] == 0.2
    assert second_call["metadata"] == {"channel": "webchat"}


@pytest.mark.asyncio
async def test_run_tool_loop_retries_retryable_response_errors():
    client = _DummyClient(
        scripted_payloads=[
            RuntimeError("server_error temporary outage"),
            {
                "id": "resp_ok",
                "conversation": {"id": "conv_ok"},
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "ok"}],
                    }
                ],
            },
        ]
    )
    assistant = AssistantConfig(assistant_id="asst_test", project_id="proj_test")
    context = ToolRuntimeContext(conversation_id="crm_conv", contact_id="crm_contact")

    await run_tool_loop(
        client=client,
        assistant=assistant,
        assistant_spec=None,
        context=context,
        initial_request={"input": [], "store": True, "model": "gpt-4o"},
        request_template=lambda: {"model": "gpt-4o"},
        execute_tool=lambda *_: None,
        openai_conversation_id=None,
        previous_response_id=None,
    )

    assert len(client.responses.calls) == 2


@pytest.mark.asyncio
async def test_run_tool_loop_returns_structured_tool_error_payload():
    client = _DummyClient(
        scripted_payloads=[
            {
                "id": "resp_1",
                "conversation": {"id": "conv_1"},
                "output": [
                    {
                        "type": "function_call",
                        "name": "close_lead",
                        "call_id": "call_1",
                        "arguments": json.dumps({"x": 1}),
                    }
                ],
            },
            {
                "id": "resp_2",
                "conversation": {"id": "conv_1"},
                "output": [{"type": "message", "content": [{"type": "output_text", "text": "ok"}]}],
            },
        ]
    )

    assistant = AssistantConfig(assistant_id="asst_test", project_id="proj_test")
    context = ToolRuntimeContext(conversation_id="crm_conv", contact_id="crm_contact")

    async def execute_tool(_name, _args, _ctx):
        raise ValueError("payload invalido")

    await run_tool_loop(
        client=client,
        assistant=assistant,
        assistant_spec=None,
        context=context,
        initial_request={"input": [], "store": True, "model": "gpt-4o"},
        request_template=lambda: {"model": "gpt-4o"},
        execute_tool=execute_tool,
        openai_conversation_id=None,
        previous_response_id=None,
    )

    second_call = client.responses.calls[1]
    output_items = second_call["input"]
    assert len(output_items) == 1
    payload = json.loads(output_items[0]["output"])
    assert payload["status"] == "error"
    assert payload["error_type"] == "ValueError"
    assert payload["message"] == "payload invalido"


def test_classify_runtime_error_marks_retryable_by_status_code():
    class _HttpError(Exception):
        def __init__(self, status_code: int, message: str):
            super().__init__(message)
            self.status_code = status_code

    result = classify_runtime_error(_HttpError(503, "temporarily unavailable"))
    assert result["error_type"] == "_HttpError"
    assert result["status_code"] == 503
    assert result["retryable"] is True
