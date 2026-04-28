"""Promueve prospectos al pipeline CRM cuando ya hubo contacto exitoso."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.phone_utils import normalize_phone

logger = get_logger("prospeccion.auto_promoter")

PROMOTABLE_ESTADOS = {
    # Solo promover cuando existe señal explícita de respuesta/interacción real.
    "respondido",
    "answered",
}
_PROMOTION_LOCKS: dict[UUID, asyncio.Lock] = {}


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


def _channel_label(row: dict[str, Any]) -> str:
    fuente_busqueda = _clean_text(row.get("fuente_busqueda"))
    fuente = _clean_text(row.get("fuente"))
    if fuente == "google_places":
        return "Google"
    if fuente == "denue":
        return "Denue"
    if fuente_busqueda == "buscador":
        return "Web"
    return "Manual"


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
    lock = _PROMOTION_LOCKS.setdefault(prospecto_uuid, asyncio.Lock())
    async with lock:
        return await _auto_promote_prospecto_locked(
            prospecto_uuid=prospecto_uuid,
            canal=canal,
            repo=repo,
        )


async def _auto_promote_prospecto_locked(
    *,
    prospecto_uuid: UUID,
    canal: str | None = None,
    repo: CRMRepository | None = None,
) -> bool:
    """Ejecuta promoción bajo lock por prospecto para evitar duplicados por carrera."""

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
    telefono = normalize_phone(_clean_text(prospecto.get("phone_e164") or prospecto.get("phone")))
    segmento = _clean_text(prospecto.get("segmento"))
    notas_value = metadata.get("notas")
    notas = notas_value.strip() if isinstance(notas_value, str) else None
    source_label = _describe_source(prospecto)
    pipeline_canal_label = _channel_label(prospecto)
    canal_label = (canal or metadata.get("ultimo_canal_prospeccion") or "").lower() or None

    persona_ref_id = metadata.get("crm_contacto_id")
    persona_ref = None
    if not persona_ref_id:
        try:
            existing_persona = await local_repo.worker_find_contact_by_prospecto(
                organizacion_id=org_uuid,
                prospecto_id=prospecto_uuid,
            )
        except CRMRepositoryError as exc:
            log_event(logger, "prospeccion.auto_promote_contact_lookup_failed", error=str(exc))
            existing_persona = None
        if existing_persona:
            persona_ref_id = existing_persona.get("id")
            persona_ref = existing_persona

    # Fallback de deduplicación: reutilizar contacto existente por teléfono/correo.
    if not persona_ref_id:
        if telefono:
            try:
                existing_by_phone = await local_repo.get_contact_by_phone_e164(
                    phone_e164=telefono,
                    organizacion_id=org_uuid,
                )
            except CRMRepositoryError as exc:
                log_event(
                    logger,
                    "prospeccion.auto_promote_contact_phone_lookup_failed",
                    error=str(exc),
                    prospecto_id=str(prospecto_uuid),
                )
                existing_by_phone = None
            if existing_by_phone:
                persona_ref_id = existing_by_phone.get("id")
                persona_ref = existing_by_phone
        if not persona_ref_id and correo:
            try:
                candidates = await local_repo.search_contacts(
                    organizacion_id=org_uuid,
                    query=correo,
                    limit=5,
                )
            except CRMRepositoryError as exc:
                log_event(
                    logger,
                    "prospeccion.auto_promote_contact_email_lookup_failed",
                    error=str(exc),
                    prospecto_id=str(prospecto_uuid),
                )
                candidates = []
            normalized_email = correo.casefold()
            for candidate in candidates:
                candidate_email = _clean_text(candidate.get("correo"))
                if candidate_email and candidate_email.casefold() == normalized_email:
                    persona_ref_id = candidate.get("id")
                    persona_ref = candidate
                    break

    # Si reutilizamos un contacto existente, anclamos prospecto_id en contacto_datos.
    if persona_ref_id and isinstance(persona_ref, dict):
        try:
            persona_ref_uuid = UUID(str(persona_ref_id))
        except (TypeError, ValueError):
            persona_ref_uuid = None
        if persona_ref_uuid:
            persona_contacto_datos = _ensure_dict(persona_ref.get("contacto_datos"))
            if str(persona_contacto_datos.get("prospecto_id") or "") != str(prospecto_uuid):
                persona_contacto_datos["prospecto_id"] = str(prospecto_uuid)
                try:
                    persona_ref = await local_repo.update_contact(
                        organizacion_id=org_uuid,
                        contacto_id=persona_ref_uuid,
                        payload={"contacto_datos": persona_contacto_datos},
                    )
                except CRMRepositoryError as exc:
                    log_event(
                        logger,
                        "prospeccion.auto_promote_contact_link_failed",
                        error=str(exc),
                        prospecto_id=str(prospecto_uuid),
                        contacto_id=str(persona_ref_uuid),
                    )

    if not persona_ref_id:
        owner_user_id: str | None = None
        try:
            sales_candidate = await local_repo.assign_next_sales_rep(organizacion_id=org_uuid)
        except CRMRepositoryError as exc:
            log_event(
                logger,
                "prospeccion.auto_promote_round_robin_failed",
                error=str(exc),
                prospecto_id=str(prospecto_uuid),
            )
            sales_candidate = None
        if isinstance(sales_candidate, dict):
            owner_candidate = sales_candidate.get("usuario_id")
            if owner_candidate:
                owner_user_id = str(owner_candidate)

        persona_contacto_datos = {
            "prospecto_id": str(prospecto_uuid),
            "prospeccion_fuente": source_label,
            "auto_promovido": True,
        }
        if canal_label:
            persona_contacto_datos["prospeccion_canal"] = canal_label
        persona_payload = {
            "nombre_completo": display_name,
            "correo": correo,
            "telefono_e164": telefono,
            "company_name": segmento,
            "notes": notas,
            "contacto_datos": persona_contacto_datos,
            "propietario_usuario_id": owner_user_id,
        }
        persona_payload = {k: v for k, v in persona_payload.items() if v}
        try:
            persona_ref = await local_repo.create_contact(
                organizacion_id=org_uuid,
                payload=persona_payload,
            )
        except CRMRepositoryError as exc:
            log_event(
                logger,
                "prospeccion.auto_promote_contact_failed",
                error=str(exc),
                prospecto_id=str(prospecto_uuid),
            )
            return False
        persona_ref_id = persona_ref.get("id")

    if not persona_ref_id:
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
    # Fallback adicional: si ya existe oportunidad para el contacto, reutilizarla.
    if not oportunidad_id:
        try:
            persona_uuid = UUID(str(persona_ref_id))
        except (TypeError, ValueError):
            persona_uuid = None
        if persona_uuid:
            try:
                existing_for_contact = await local_repo.get_contact_opportunity(
                    contact_id=persona_uuid,
                )
            except CRMRepositoryError as exc:
                log_event(
                    logger,
                    "prospeccion.auto_promote_opportunity_contact_lookup_failed",
                    error=str(exc),
                    prospecto_id=str(prospecto_uuid),
                    contacto_id=str(persona_uuid),
                )
                existing_for_contact = None
            if existing_for_contact:
                oportunidad_id = existing_for_contact.get("id")
                oportunidad = existing_for_contact

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
            "canal": pipeline_canal_label,
            "auto_promovido": True,
        }
        if canal_label:
            opportunity_metadata["prospeccion_canal"] = canal_label

        opportunity_payload = {
            "contacto_principal_id": str(persona_ref_id),
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

    metadata["crm_contacto_id"] = str(persona_ref_id)
    metadata["crm_oportunidad_id"] = str(oportunidad_id)
    metadata["crm_auto_promovido"] = True
    metadata["crm_auto_promovido_en"] = datetime.now(timezone.utc).isoformat()
    metadata["crm_origen_etapa"] = "prospeccion_primer_contacto"
    metadata["pipeline_ready"] = True
    # Algunos triggers multi-tenant infieren tenant desde metadata cuando no hay contexto auth.
    metadata["organizacion_id"] = str(org_uuid)
    if canal_label:
        metadata["ultimo_canal_prospeccion"] = canal_label
    metadata.setdefault("stage", "launch")

    try:
        await local_repo.worker_update_prospecto_metadata(
            prospecto_id=prospecto_uuid,
            metadata=metadata,
            organizacion_id=org_uuid,
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
