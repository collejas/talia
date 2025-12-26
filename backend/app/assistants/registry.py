"""Registro liviano de asistentes disponibles."""

from collections.abc import Callable

from . import manager

AssistantResolver = Callable[[], manager.AssistantConfig]


REGISTRY: dict[str, AssistantResolver] = {
    "landing": manager.get_landing_assistant,
    "whatsapp": manager.get_whatsapp_assistant,
    "messenger": manager.get_messenger_assistant,
}


def resolve_assistant(name: str) -> manager.AssistantConfig:
    """Devuelve la configuración del asistente solicitado."""
    try:
        resolver = REGISTRY[name]
    except KeyError as exc:  # pragma: no cover - errores se capturan en tests
        raise ValueError(f"Assistant '{name}' is not registered") from exc
    return resolver()
