"""Promueve prospectos al pipeline CRM cuando ya hubo contacto exitoso."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger("prospeccion.auto_promoter")

PROMOTABLE_ESTADOS = {
    "enviado",
    "entregado",
    "leido",
    "completado",
    "respondido",
    "answered",
}


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _describe_source(row: dict[str, Any]) -> str:
    fuente_busqueda = _clean_text(row.get("fuente_busqueda"))
    fuente = _clean_text(row.get("fuente"))
    if fuente_busqueda == "buscador":
        return "Prospección – Búsqueda web"
    if fuente_busqueda == "manual":
        return "Prospección – Captura manual"
    if fuente == "google_places":
        return "Prospección – Búsqueda Google"
    if fuente == "denue":
        return "Prospección – DENUE"
    return "Prospección – Manual"


def is_promotable_estado(estado: str | None) -> bool:
    if not estado:
        return False
    normalized = estado.strip().lower()
    return normalized in PROMOTABLE_ESTADOS


async def auto_promote_prospecto(
    *,
    prospecto_id: Any,
    canal: str | None = None,
    estado: str | None = None,
    repo: CRMRepository | None = None,
    force: bool = False,
) -> bool:
    """Crea el contacto y oportunidad inicial en el pipeline si aplica."""

    if not force and not is_promotable_estado(estado):
        return False
    if not prospecto_id:
        return False
    try:
        prospecto_uuid = UUID(str(prospecto_id))
    except (TypeError, ValueError):
        return False

    local_repo = repo
    if local_repo is None:
        try:
            local_repo = CRMRepository()
        except CRMRepositoryError as exc:  # pragma: no cover - inicializar repo rara vez falla
            log_event(logger, "prospeccion.auto_promote_repo_error", error=str(exc))
            return False

    try:
        prospecto = await local_repo.worker_get_prospecto(prospecto_id=prospecto_uuid)
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "prospeccion.auto_promote_fetch_failed",
            error=str(exc),
            prospecto_id=str(prospecto_uuid),
        )
        return False
    if not prospecto:
        return False

    metadata = _ensure_dict(prospecto.get("metadata"))
    if metadata.get("convertido_contacto_id") or metadata.get("crm_oportunidad_id"):
        return False

    organizacion_id = prospecto.get("organizacion_id")
    try:
        org_uuid = UUID(str(organizacion_id))
    except (TypeError, ValueError):
        return False

    display_name = _clean_text(prospecto.get("display_name")) or "Prospecto sin nombre"
    correo = _clean_text(prospecto.get("email"))
    telefono = _clean_text(prospecto.get("phone_e164") or prospecto.get("phone"))
    segmento = _clean_text(prospecto.get("segmento"))
    notas_value = metadata.get("notas")
    notas = notas_value.strip() if isinstance(notas_value, str) else None
    source_label = _describe_source(prospecto)
    canal_label = (canal or metadata.get("ultimo_canal_prospeccion") or "").lower() or None

    contacto_id = metadata.get("crm_contacto_id")
    contacto = None
    if not contacto_id:
        try:
            existing_contact = await local_repo.worker_find_contact_by_prospecto(
                organizacion_id=org_uuid,
                prospecto_id=prospecto_uuid,
            )
        except CRMRepositoryError as exc:
            log_event(logger, "prospeccion.auto_promote_contact_lookup_failed", error=str(exc))
            existing_contact = None
        if existing_contact:
            contacto_id = existing_contact.get("id")
            contacto = existing_contact

    if not contacto_id:
        contacto_datos = {
            "prospecto_id": str(prospecto_uuid),
            "prospeccion_fuente": source_label,
            "auto_promovido": True,
        }
        if canal_label:
            contacto_datos["prospeccion_canal"] = canal_label
        contacto_payload = {
            "nombre_completo": display_name,
            "correo": correo,
            "telefono_e164": telefono,
            "company_name": segmento,
            "notes": notas,
            "contacto_datos": contacto_datos,
        }
        contacto_payload = {k: v for k, v in contacto_payload.items() if v}
        try:
            contacto = await local_repo.create_contact(
                organizacion_id=org_uuid,
                payload=contacto_payload,
            )
        except CRMRepositoryError as exc:
            log_event(
                logger,
                "prospeccion.auto_promote_contact_failed",
                error=str(exc),
                prospecto_id=str(prospecto_uuid),
            )
            return False
        contacto_id = contacto.get("id")

    if not contacto_id:
        return False

    oportunidad_id = metadata.get("crm_oportunidad_id")
    oportunidad = None
    if not oportunidad_id:
        try:
            existing_opportunity = await local_repo.worker_find_opportunity_by_prospecto(
                organizacion_id=org_uuid,
                prospecto_id=prospecto_uuid,
            )
        except CRMRepositoryError as exc:
            log_event(
                logger,
                "prospeccion.auto_promote_opportunity_lookup_failed",
                error=str(exc),
            )
            existing_opportunity = None
        if existing_opportunity:
            oportunidad_id = existing_opportunity.get("id")
            oportunidad = existing_opportunity

    if not oportunidad_id:
        try:
            stage_payload = await local_repo.ensure_prospeccion_stage(organizacion_id=org_uuid)
        except CRMRepositoryError as exc:
            log_event(logger, "prospeccion.auto_promote_stage_failed", error=str(exc))
            stage_payload = None
        stage_id = stage_payload.get("id") if isinstance(stage_payload, dict) else None
        if stage_id is None:
            try:
                stage_id = await local_repo.get_default_stage_id(organizacion_id=org_uuid)
            except CRMRepositoryError as exc:
                log_event(logger, "prospeccion.auto_promote_stage_default_failed", error=str(exc))
                stage_id = None

        opportunity_metadata = {
            "prospecto_id": str(prospecto_uuid),
            "source": source_label,
            "auto_promovido": True,
        }
        if canal_label:
            opportunity_metadata["prospeccion_canal"] = canal_label

        opportunity_payload = {
            "contacto_principal_id": str(contacto_id),
            "etapa_id": str(stage_id) if stage_id else None,
            "titulo": display_name[:255],
            "descripcion": notas,
            "metadata": opportunity_metadata,
        }
        opportunity_payload = {k: v for k, v in opportunity_payload.items() if v}
        try:
            oportunidad = await local_repo.create_opportunity(
                organizacion_id=org_uuid,
                payload=opportunity_payload,
            )
        except CRMRepositoryError as exc:
            log_event(
                logger,
                "prospeccion.auto_promote_opportunity_failed",
                error=str(exc),
                prospecto_id=str(prospecto_uuid),
            )
            oportunidad = None
        else:
            oportunidad_id = oportunidad.get("id")
            if oportunidad_id and stage_id:
                history_payload: dict[str, str] = {
                    "oportunidad_id": str(oportunidad_id),
                    "etapa_destino_id": str(stage_id),
                    "fuente": "prospeccion",
                }
                try:
                    await local_repo.append_stage_history(
                        organizacion_id=org_uuid,
                        payload=history_payload,
                    )
                except CRMRepositoryError as exc:  # pragma: no cover - no bloquea promoción
                    log_event(
                        logger,
                        "prospeccion.auto_promote_history_failed",
                        error=str(exc),
                        oportunidad_id=str(oportunidad_id),
                    )

    if not oportunidad_id:
        return False

    metadata["crm_contacto_id"] = str(contacto_id)
    metadata["crm_oportunidad_id"] = str(oportunidad_id)
    metadata["crm_auto_promovido"] = True
    metadata["crm_auto_promovido_en"] = datetime.now(timezone.utc).isoformat()
    metadata["crm_origen_etapa"] = "prospeccion_primer_contacto"
    metadata["pipeline_ready"] = True
    if canal_label:
        metadata["ultimo_canal_prospeccion"] = canal_label
    metadata.setdefault("stage", "launch")

    try:
        await local_repo.worker_update_prospecto_metadata(
            prospecto_id=prospecto_uuid,
            metadata=metadata,
        )
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "prospeccion.auto_promote_metadata_failed",
            error=str(exc),
            prospecto_id=str(prospecto_uuid),
        )
        return True  # contacto/oportunidad ya existen aunque metadata falló

    log_event(
        logger,
        "prospeccion.auto_promoted",
        prospecto_id=str(prospecto_uuid),
        canal=canal_label,
        oportunidad_id=str(oportunidad_id),
    )
    return True


__all__ = [
    "auto_promote_prospecto",
    "is_promotable_estado",
]
