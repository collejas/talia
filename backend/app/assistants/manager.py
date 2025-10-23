"""Gestiona la resolución de asistentes conversacionales configurados en OpenAI."""

from dataclasses import dataclass

from app.core.config import settings


@dataclass(slots=True)
class AssistantConfig:
    """Representa la configuración mínima de un asistente en OpenAI."""

    assistant_id: str
    project_id: str | None = None


def get_landing_assistant() -> AssistantConfig:
    """Retorna el asistente utilizado por la landing conversacional."""
    if not settings.openai_assistant_id:
        msg = "OPENAI_ASSISTANT_ID is not configured"
        raise RuntimeError(msg)
    return AssistantConfig(
        assistant_id=settings.openai_assistant_id,
        project_id=settings.openai_project_id,
    )
