"""Servicios de alto nivel para sincronizar el pipeline de leads."""

from __future__ import annotations

from typing import Any

from app.core.logging import get_logger, log_event
from app.repositories.leads import LeadsRepository, LeadsRepositoryError

logger = get_logger(__name__)


class LeadPipelineError(RuntimeError):
    """Errores de alto nivel al operar el pipeline."""


class LeadPipelineService:
    """Orquestra las operaciones recurrentes del kanban de leads."""

    def __init__(self, repository: LeadsRepository | None = None) -> None:
        self._repo = repository or LeadsRepository()

    async def ensure_card_for_conversation(
        self,
        *,
        conversation_id: str,
        canal: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Garantiza que la conversación tenga una tarjeta asociada."""
        try:
            card = await self._repo.fetch_card_by_conversation(
                conversation_id=conversation_id,
                token=None,
            )
        except LeadsRepositoryError as exc:  # pragma: no cover - depende de Supabase
            raise LeadPipelineError(str(exc)) from exc

        meta_updates = {k: v for k, v in (metadata or {}).items() if v is not None}
        if card:
            patch: dict[str, Any] = {}
            if canal and not card.get("canal"):
                patch["canal"] = canal
            if meta_updates:
                current_meta = (
                    card.get("metadata") if isinstance(card.get("metadata"), dict) else {}
                )
                merged = dict(current_meta)
                merged.update(meta_updates)
                patch["metadata"] = merged
            if patch:
                patch["fuente"] = meta_updates.get("fuente") or "asistente"
                try:
                    updated = await self._repo.update_card(
                        card_id=str(card["id"]),
                        patch=patch,
                        token=None,
                    )
                    log_event(
                        logger,
                        "leads.card_updated",
                        card_id=updated["id"],
                        conversation_id=conversation_id,
                    )
                    return updated
                except LeadsRepositoryError as exc:  # pragma: no cover - depende de Supabase
                    raise LeadPipelineError(str(exc)) from exc
            return card

        try:
            conv = await self._repo.fetch_conversation(conversation_id=conversation_id, token=None)
        except LeadsRepositoryError as exc:  # pragma: no cover
            raise LeadPipelineError(str(exc)) from exc

        if not conv:
            raise LeadPipelineError("Conversación no encontrada para crear tarjeta")

        payload: dict[str, Any] = {
            "contacto_id": conv.get("contacto_id"),
            "conversacion_id": conversation_id,
            "canal": canal or conv.get("canal"),
            "propietario_usuario_id": conv.get("asignado_a_usuario_id"),
            "asignado_a_usuario_id": conv.get("asignado_a_usuario_id"),
            "fuente": meta_updates.get("fuente") or "asistente",
            "metadata": meta_updates or {},
        }
        try:
            created = await self._repo.create_card(payload=payload, token=None)
            log_event(
                logger,
                "leads.card_created",
                card_id=created["id"],
                conversation_id=conversation_id,
            )
            return created
        except LeadsRepositoryError as exc:  # pragma: no cover
            raise LeadPipelineError(str(exc)) from exc

    async def move_lead(
        self,
        *,
        card_id: str,
        stage_id: str,
        motivo: str | None = None,
        fuente: str = "humano",
        token: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        patch: dict[str, Any] = {"etapa_id": stage_id, "fuente": fuente}
        if motivo is not None:
            patch["motivo_cierre"] = motivo or None
        if metadata:
            patch["metadata"] = metadata
        try:
            updated = await self._repo.update_card(card_id=card_id, patch=patch, token=token)
            log_event(logger, "leads.card_moved", card_id=card_id, stage_id=stage_id)
            return updated
        except LeadsRepositoryError as exc:  # pragma: no cover
            raise LeadPipelineError(str(exc)) from exc

    async def assign_lead(
        self,
        *,
        card_id: str,
        usuario_id: str | None,
        fuente: str = "humano",
        token: str | None = None,
    ) -> dict[str, Any]:
        patch: dict[str, Any] = {
            "asignado_a_usuario_id": usuario_id,
            "fuente": fuente,
        }
        try:
            updated = await self._repo.update_card(card_id=card_id, patch=patch, token=token)
            log_event(logger, "leads.card_assigned", card_id=card_id, usuario_id=usuario_id)
            return updated
        except LeadsRepositoryError as exc:  # pragma: no cover
            raise LeadPipelineError(str(exc)) from exc
