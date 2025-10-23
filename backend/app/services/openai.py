"""Cliente centralizado para interactuar con OpenAI."""

from functools import lru_cache

from openai import AsyncOpenAI

from app.core.config import settings


@lru_cache(maxsize=1)
def get_openai_client() -> AsyncOpenAI:
    """Crea un cliente asíncrono reutilizable."""
    if not settings.openai_api_key:
        msg = "OPENAI_API_KEY is not configured"
        raise RuntimeError(msg)
    return AsyncOpenAI(api_key=settings.openai_api_key)


def get_assistant_client() -> AsyncOpenAI:
    """Alias legible para obtener el cliente del asistente."""
    return get_openai_client()
