"""Endpoint de salud mínimo para validaciones rápidas."""
from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", summary="Estado del servicio")
def healthcheck() -> dict[str, str]:
    """Retorna un payload estático indicando que la API está viva."""
    return {"status": "ok"}
