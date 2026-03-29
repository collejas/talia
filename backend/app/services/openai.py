"""Cliente centralizado para interactuar con OpenAI."""

from functools import lru_cache

from openai import AsyncOpenAI

from app.core.config import settings


@lru_cache(maxsize=32)
def _get_openai_client_cached(api_key: str, project_id: str | None) -> AsyncOpenAI:
    return AsyncOpenAI(api_key=api_key, project=project_id)


def get_openai_client(*, api_key: str | None = None, project_id: str | None = None) -> AsyncOpenAI:
    """Crea un cliente asíncrono reutilizable (cacheado por api_key)."""
    resolved_key = api_key or settings.openai_api_key
    if not resolved_key:
        msg = "OPENAI_API_KEY is not configured"
        raise RuntimeError(msg)
    resolved_project_id = project_id or settings.openai_project_id or None
    return _get_openai_client_cached(resolved_key, resolved_project_id)


def get_assistant_client(*, api_key: str | None = None, project_id: str | None = None) -> AsyncOpenAI:
    """Alias legible para obtener el cliente del asistente."""
    return get_openai_client(api_key=api_key, project_id=project_id)
