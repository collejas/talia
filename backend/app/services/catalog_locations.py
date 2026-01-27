"""Resolución de datos de ubicación para desarrollos inmobiliarios."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from app.core.logging import get_logger
from app.data.geo.locations import get_municipality_name, get_state_name
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger("app.services.catalog_locations")


def extract_development_id(metadata: Mapping[str, Any] | None) -> str | None:
    if not metadata:
        return None
    for key in ("propiedad_id", "desarrollo_id", "propiedadId", "desarrolloId"):
        value = metadata.get(key)
        if value:
            return str(value)
    return None


def format_location_payload(location: Mapping[str, str | None] | None) -> dict[str, str | None] | None:
    if not location:
        return None
    return {
        "desarrollo_id": location.get("desarrollo_id"),
        "desarrollo_nombre": location.get("nombre"),
        "estado_cve": location.get("estado_cve"),
        "estado_nombre": location.get("estado_nombre"),
        "municipio_cve": location.get("municipio_cve"),
        "municipio_nombre": location.get("municipio_nombre"),
        "colonia": location.get("colonia"),
        "codigo_postal": location.get("codigo_postal"),
        "pais_codigo": location.get("pais_codigo"),
        "status": location.get("status"),
    }


class LocationResolver:
    def __init__(self, repo: CRMRepository, organizacion_id: str) -> None:
        self._repo = repo
        self._organizacion_id = organizacion_id

    async def resolve(
        self,
        development_ids: Iterable[str],
    ) -> dict[str, dict[str, str | None]]:
        ids = {str(value) for value in development_ids if value}
        if not ids:
            return {}
        try:
            rows = await self._repo.list_propiedad_desarrollos_by_ids(
                organizacion_id=self._organizacion_id,
                desarrollo_ids=list(ids),
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "location_resolver.fetch_failed",
                extra={"organizacion_id": self._organizacion_id, "error": str(exc)},
            )
            return {}
        locations: dict[str, dict[str, str | None]] = {}
        for row in rows:
            desarroll_id = row.get("id")
            if not desarroll_id:
                continue
            location = self._build_location(row)
            if location:
                locations[str(desarroll_id)] = location
        return locations

    @staticmethod
    def _build_location(row: Mapping[str, Any]) -> dict[str, str | None] | None:
        estado_cve = str(row.get("estado_cve") or "").strip()
        municipio_cve = str(row.get("municipio_cve") or "").strip()
        if not estado_cve and not municipio_cve:
            return None
        estado_code = estado_cve.zfill(2) if estado_cve else ""
        municipio_code = municipio_cve.zfill(3) if municipio_cve else ""
        return {
            "desarrollo_id": str(row.get("id")),
            "nombre": row.get("nombre"),
            "pais_codigo": row.get("pais_codigo"),
            "estado_cve": estado_code or None,
            "estado_nombre": get_state_name(estado_code) if estado_code else None,
            "municipio_cve": municipio_code or None,
            "municipio_nombre": (
                get_municipality_name(estado_code, municipio_code)
                if estado_code and municipio_code
                else None
            ),
            "colonia": row.get("colonia"),
            "codigo_postal": row.get("codigo_postal"),
            "status": row.get("status"),
        }
