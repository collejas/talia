"""Pruebas del registro de asistentes."""
import pytest

from app.assistants import registry


def test_resolve_unknown_assistant_raises_error() -> None:
    with pytest.raises(ValueError):
        registry.resolve_assistant("unknown")
