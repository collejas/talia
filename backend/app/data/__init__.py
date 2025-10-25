"""Recursos de datos estáticos integrados en el backend."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def data_path(*parts: str) -> Path:
    """Retorna la ruta a un recurso dentro de `backend/app/data`."""
    return BASE_DIR.joinpath(*parts)
