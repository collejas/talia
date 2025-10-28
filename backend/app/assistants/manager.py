"""Gestiona la resolución de asistentes conversacionales configurados en OpenAI."""

from dataclasses import dataclass

from app.core.config import settings


@dataclass(slots=True)
class AssistantConfig:
    """Representa la configuración objetivo para interactuar con OpenAI."""

    assistant_id: str | None = None
    prompt_id: str | None = None
    prompt_version: str | None = None
    project_id: str | None = None

    @property
    def is_prompt(self) -> bool:
        return self.prompt_id is not None


def get_landing_assistant() -> AssistantConfig:
    """Retorna el asistente utilizado por la landing conversacional."""
    if not settings.openai_assistant_id:
        msg = "OPENAI_ASSISTANT_ID is not configured"
        raise RuntimeError(msg)
    target_id = settings.openai_assistant_id
    if target_id.startswith("pmpt_"):
        return AssistantConfig(
            assistant_id=None,
            prompt_id=target_id,
            prompt_version=settings.openai_prompt_version,
            project_id=settings.openai_project_id,
        )
    return AssistantConfig(
        assistant_id=target_id,
        prompt_id=None,
        project_id=settings.openai_project_id,
    )
