"""Funciones específicas del canal WhatsApp para resolver tool calls."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Mapping
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.webchat import service as webchat_service
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import send_email, storage, tenant_runtime
from app.services.calendar import CalendarError
from app.services.catalog_embeddings import CatalogEmbeddingService
from app.logging.catalog_debug import write_catalog_debug_entry
from app.services.catalog_fraccionamientos import (
    list_catalog_fraccionamientos,
    list_catalog_modelos,
)
from app.services.email import EmailSendError
from app.services.storage import StorageError

logger = get_logger("app.channels.whatsapp.tools")

INFORMATION_EMAIL_TEMPLATE: dict[str, Any] = {
    "intro": "Gracias por tu interés en Tal-IA. Te comparto un resumen con la información que platicamos:",
    "highlights": [
        "Automatiza la atención 24/7 en webchat, WhatsApp y voz con un solo asistente.",
        "Califica prospectos y agenda demos o recordatorios sin cargar al equipo comercial.",
        "Centraliza conversaciones, métricas y tareas en el panel de Tal-IA para dar seguimiento inteligente.",
    ],
    "resources": [
        {"label": "Sitio de Tal-IA", "url": "https://talia.mx/"},
        {"label": "Geoactiv · Casos y soluciones", "url": "https://geoactiv.ai/"},
    ],
    "closing": "Cuando quieras, puedo ayudarte a agendar una demo personalizada o resolver cualquier duda por este medio.",
    "use_summary": True,
    "use_highlights": True,
    "use_resources": True,
}


def _require(arguments: dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if value is None:
        raise ValueError(f"{key} requerido")
    text = str(value).strip()
    if not text:
        raise ValueError(f"{key} requerido")
    return text


def _optional_bool_argument(arguments: dict[str, Any], key: str) -> bool | None:
    if key not in arguments:
        return None
    value = arguments.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "si", "sí"}:
        return True
    if text in {"0", "false", "no"}:
        return False
    return None


def _optional_int_argument(arguments: dict[str, Any], key: str) -> int | None:
    if key not in arguments:
        return None
    value = arguments.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return max(0, parsed)


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return dict(parsed)
        except json.JSONDecodeError:
            return {}
    return {}


async def _resolve_org_for_catalog(
    context: ToolRuntimeContext,
    arguments: dict[str, Any],
) -> UUID:
    """Resuelve organizacion_id de forma segura para tools de catálogo."""
    contact = await _resolve_contact(context.contact_id)
    if contact:
        org_value = webchat_service._extract_contact_org(contact)
        resolved = webchat_service._resolve_org_uuid(org_value)
        if resolved:
            return UUID(resolved)

    org_value = arguments.get("organizacion_id")
    if not org_value:
        raise ValueError("organizacion_id requerido para catálogo")
    resolved = webchat_service._resolve_org_uuid(str(org_value))
    if not resolved:
        raise ValueError("organizacion_id inválido")
    return UUID(resolved)


async def execute_tool(
    name: str | None, arguments: Any, context: ToolRuntimeContext
) -> dict[str, Any]:
    if not name:
        raise ValueError("Nombre de función ausente")

    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except json.JSONDecodeError as exc:  # type: ignore[name-defined]
            raise ValueError(f"Arguments inválidos: {arguments!r}") from exc
    elif not isinstance(arguments, dict):
        raise ValueError(f"Tipo de argumentos no soportado: {type(arguments)!r}")

    func = name.strip()
    if func == "set_full_name":
        full_name = _require(arguments, "full_name")
        await storage.update_contact(context.contact_id, {"nombre_completo": full_name})
        return {"status": "ok", "full_name": full_name}

    if func == "set_email":
        email = _require(arguments, "email").lower()
        await storage.update_contact(context.contact_id, {"correo": email})
        await storage.capture_opportunity_if_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
        return {"status": "ok", "email": email}

    if func == "set_phone_number":
        phone = _require(arguments, "phone_number")
        await storage.update_contact(context.contact_id, {"telefono_e164": phone})
        await storage.capture_opportunity_if_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
        return {"status": "ok", "phone_number": phone}

    if func == "set_company_name":
        company = _require(arguments, "company_name")
        await storage.update_contact(context.contact_id, {"company_name": company})
        return {"status": "ok", "company_name": company}

    if func == "send_information_email":
        return await _handle_information_email(arguments, context)

    if func == "close_lead":
        return await _handle_close_lead(arguments, context)

    if func == "restart_conversation_cycle":
        return await _handle_restart_cycle(arguments, context)

    if func == "list_demo_slots":
        return await _handle_list_demo_slots(arguments, context)

    if func == "schedule_demo":
        return await _handle_schedule_demo(arguments, context)

    if func == "reschedule_demo":
        return await _handle_reschedule_demo(arguments, context)

    if func == "cancel_demo":
        return await _handle_cancel_demo(arguments, context)

    if func == "list_catalog_fraccionamientos":
        org_uuid = await _resolve_org_for_catalog(context, arguments)

        include_inactive_raw = arguments.get("include_inactive")
        if isinstance(include_inactive_raw, str):
            include_inactive = include_inactive_raw.strip().lower() in {
                "1",
                "true",
                "sí",
                "si",
                "yes",
            }
        else:
            include_inactive = bool(include_inactive_raw)

        prototipos_limit_raw = arguments.get("prototipos_limit")
        try:
            prototipos_limit = int(prototipos_limit_raw)
        except (TypeError, ValueError):
            prototipos_limit = 6
        prototipos_limit = max(1, min(20, prototipos_limit))

        repo = CRMRepository()
        try:
            rows = await list_catalog_fraccionamientos(
                repo,
                organizacion_id=org_uuid,
                include_inactive=include_inactive,
                prototipos_limit=prototipos_limit,
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc
        conversation_id_value = (
            str(context.conversation_id) if context and context.conversation_id else None
        )
        write_catalog_debug_entry(
            {
                "source": "whatsapp.list_catalog_fraccionamientos",
                "conversation_id": conversation_id_value,
                "organizacion_id": str(org_uuid),
                "include_inactive": include_inactive,
                "prototipos_limit": prototipos_limit,
                "row_count": len(rows),
                "fraccionamientos": [
                    {
                        "nombre": row.get("nombre"),
                        "segmento": row.get("segmento"),
                        "linea": row.get("linea"),
                        "prototipos": row.get("prototipos"),
                    }
                    for row in rows
                ],
            }
        )
        return {"status": "ok", "fraccionamientos": rows}

    if func == "list_catalog_modelos":
        org_uuid = await _resolve_org_for_catalog(context, arguments)
        include_inactive_raw = arguments.get("include_inactive")
        if isinstance(include_inactive_raw, str):
            include_inactive = include_inactive_raw.strip().lower() in {
                "1",
                "true",
                "sí",
                "si",
                "yes",
            }
        else:
            include_inactive = bool(include_inactive_raw)
        limit_raw = arguments.get("limit")
        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            limit = 500
        limit = max(1, min(500, limit))
        repo = CRMRepository()
        try:
            result = await list_catalog_modelos(
                repo,
                organizacion_id=org_uuid,
                include_inactive=include_inactive,
                limit=limit,
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc
        conversation_id_value = (
            str(context.conversation_id) if context and context.conversation_id else None
        )
        write_catalog_debug_entry(
            {
                "source": "whatsapp.list_catalog_modelos",
                "conversation_id": conversation_id_value,
                "organizacion_id": str(org_uuid),
                "include_inactive": include_inactive,
                "limit": limit,
                "familias_total": result.get("familias_total"),
                "modelos_total": result.get("modelos_total"),
                "lineas": [
                    {"nombre": linea.get("nombre"), "familias": len(linea.get("familias") or [])}
                    for linea in result.get("lineas", [])
                ],
            }
        )
        return {"status": "ok", **result}

    if func == "fetch_catalog_item_details":
        org_uuid = await _resolve_org_for_catalog(context, arguments)

        query = str(arguments.get("query") or "").strip()
        if not query:
            raise ValueError("query requerido para fetch_catalog_item_details")
        detail_level = str(arguments.get("detail_level") or "metadata").strip()
        if detail_level not in {"metadata", "overview"}:
            raise ValueError("detail_level inválido")
        limit_raw = arguments.get("limit")
        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            limit = 1
        limit = max(1, min(5, limit))

        repo = CRMRepository()
        service = CatalogEmbeddingService(repo)
        try:
            matches = await service.query_documents(
                org_uuid,
                query=query,
                limit=limit,
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc

        conversation_id_value = (
            str(context.conversation_id) if context and context.conversation_id else None
        )
        log_base = {
            "source": "whatsapp.fetch_catalog_item_details",
            "conversation_id": conversation_id_value,
            "organizacion_id": str(org_uuid),
            "query": query,
            "detail_level": detail_level,
            "limit": limit,
        }
        matches_log: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        for match in matches:
            slug = match.metadata.get("slug")
            item_data: dict[str, Any] | None = None
            if isinstance(slug, str) and slug.strip():
                try:
                    item_data = await repo.get_catalog_item_by_slug(
                        organizacion_id=org_uuid,
                        slug=slug.strip(),
                    )
                except CRMRepositoryError as exc:
                    logger.warning(
                        "catalog.item_lookup_failed",
                        extra={
                            "organizacion_id": str(org_uuid),
                            "slug": slug,
                            "error": str(exc),
                        },
                    )
            metadata_value = (
                item_data.get("metadata")
                if item_data and item_data.get("metadata")
                else item_data.get("metadatos")
                if item_data
                else None
            )
            content_metadata = webchat_service._extract_metadata_from_content(match.contenido)
            normalized_metadata = webchat_service._normalize_metadata_value(metadata_value)
            normalized_match = webchat_service._normalize_metadata_value(match.metadata)
            merged_metadata: dict[str, Any] = {}
            if normalized_match:
                merged_metadata.update(normalized_match)
            if normalized_metadata:
                merged_metadata.update(normalized_metadata)
            if content_metadata:
                merged_metadata.update(content_metadata)
            metadata: dict[str, Any] | None
            if merged_metadata:
                metadata = merged_metadata
            else:
                metadata = (
                    metadata_value
                    if isinstance(metadata_value, Mapping)
                    else match.metadata
                )
            if isinstance(metadata, Mapping):
                metadata = {str(key): val for key, val in metadata.items()}
            metadata_keys = list(metadata.keys()) if isinstance(metadata, Mapping) else []
            matches_log.append(
                {
                    "slug": slug,
                    "similarity": match.similarity,
                    "metadata_keys": metadata_keys,
                    "metadata": metadata,
                    "fallback_used": item_data is not None,
                }
            )
            items.append(
                {
                    "nombre": item_data.get("nombre") if item_data else match.metadata.get("nombre"),
                    "slug": item_data.get("slug") if item_data else match.metadata.get("slug"),
                    "tipo": item_data.get("tipo") if item_data else match.metadata.get("tipo"),
                    "unidad": item_data.get("unidad") if item_data else None,
                    "precio_base": item_data.get("precio_base") if item_data else None,
                    "moneda": item_data.get("moneda") if item_data else match.metadata.get("moneda"),
                    "activo": item_data.get("activo") if item_data else match.metadata.get("activo"),
                    "metadata": metadata,
                    "similarity": match.similarity,
                }
            )
        write_catalog_debug_entry(
            {
                **log_base,
                "match_count": len(matches),
                "items_returned": len(items),
                "matches": matches_log,
            }
        )
        return {
            "status": "ok",
            "items": items,
            "detail_level": detail_level,
            "source": "vector_store_supabase",
        }

    raise ValueError(f"La función '{func}' no está disponible en WhatsApp")


def _clone_template() -> dict[str, Any]:
    template = INFORMATION_EMAIL_TEMPLATE
    return {
        "intro": template["intro"],
        "highlights": list(template["highlights"]),
        "resources": [dict(resource) for resource in template["resources"]],
        "closing": template["closing"],
        "use_summary": template.get("use_summary", True),
        "use_highlights": template.get("use_highlights", True),
        "use_resources": template.get("use_resources", True),
    }


async def _handle_information_email(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    email_value = _require(arguments, "email")
    full_name = str(arguments.get("full_name") or "").strip() or None
    company_name = str(arguments.get("company_name") or "").strip() or None
    summary = str(arguments.get("summary") or "").strip() or None

    highlights: list[str] = []
    for item in arguments.get("highlights", []) or []:
        if isinstance(item, str) and item.strip():
            highlights.append(item.strip())

    resources: list[dict[str, str]] = []
    for item in arguments.get("resources", []) or []:
        if isinstance(item, dict):
            label = str(item.get("label") or "").strip()
            url = str(item.get("url") or "").strip()
            if label and url:
                resources.append({"label": label, "url": url})

    contact = await _resolve_contact(context.contact_id)
    contact_notes = None
    contact_need = None
    if contact:
        contact_name = str(contact.get("nombre_completo") or "").strip() or None
        contact_company = str(contact.get("company_name") or "").strip() or None
        contact_email = str(contact.get("correo") or "").strip() or None
        contact_notes = str(contact.get("notes") or "").strip() or None
        contact_need = str(contact.get("necesidad_proposito") or "").strip() or None
        if not full_name:
            full_name = contact_name
        if not company_name:
            company_name = contact_company
        if not summary:
            summary = contact_need or contact_notes
        if contact_email and contact_email.lower() != email_value.lower():
            try:
                await storage.update_contact(
                    contact.get("id") or context.contact_id, {"correo": email_value.lower()}
                )
            except StorageError as exc:
                logger.warning(
                    "whatsapp.info_email.sync_failed",
                    extra={
                        "contact_id": contact.get("id") or context.contact_id,
                        "error": str(exc),
                },
            )

    mail_org_uuid = _contact_org_uuid(contact)
    mail_settings = await tenant_runtime.get_mail_runtime_settings(organizacion_id=mail_org_uuid)
    brevo_settings = await tenant_runtime.get_brevo_runtime_settings(organizacion_id=mail_org_uuid)

    template = _clone_template()
    include_summary = bool(template.get("use_summary", True))
    include_highlights = bool(template.get("use_highlights", True))
    include_resources = bool(template.get("use_resources", True))

    if not include_highlights:
        highlights = []
    elif not highlights:
        highlights = list(template["highlights"])

    if not include_resources:
        resources = []
    elif not resources:
        resources = [dict(resource) for resource in template["resources"]]

    subject_target = company_name or full_name
    subject = (
        f"Tal-IA · Información para {subject_target}"
        if subject_target
        else "Tal-IA · Información solicitada"
    )

    body_lines = [f"Hola {full_name}," if full_name else "Hola,", "", template["intro"]]
    if include_summary and summary:
        body_lines.extend(["", summary])
    if include_highlights and highlights:
        body_lines.append("")
        body_lines.append("Puntos clave para tu equipo:")
        for item in highlights:
            body_lines.append(f"- {item}")
    if include_resources and resources:
        body_lines.append("")
        body_lines.append("Recursos para profundizar:")
        for resource in resources:
            body_lines.append(f"- {resource['label']}: {resource['url']}")
    body_lines.extend(["", template["closing"], "", "Saludos,", "Equipo Geoactiv · Tal-IA"])

    body_text = "\n".join(body_lines)

    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text=body_text,
            recipients=[email_value],
            body_html=None,
            attachments=None,
            mail_settings=mail_settings,
            brevo_settings=brevo_settings,
        )
    except EmailSendError as exc:
        logger.error(
            "whatsapp.info_email.send_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
        raise ValueError(
            "No se pudo enviar el correo en este momento. Inténtalo nuevamente más tarde."
        ) from exc
    except Exception as exc:  # pragma: no cover
        logger.exception(
            "whatsapp.info_email.send_unexpected",
            extra={"conversation_id": context.conversation_id},
        )
        raise ValueError("Ocurrió un error inesperado al enviar el correo.") from exc

    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=summary or contact_notes,
            intencion=contact_need,
            siguiente_accion="informacion_enviada_email",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.info_email.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )

    oportunidad_id = None
    try:
        oportunidad_id = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.info_email.ensure_opportunity_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    if oportunidad_id:
        try:
            await storage.maybe_auto_name_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                opportunity_id=oportunidad_id,
                intent=contact_need,
                summary=summary or contact_notes,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.info_email.auto_name_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )

    await _notify_sales_rep(
        context=context,
        trigger="information_email",
        contact=contact,
        opportunity_id=oportunidad_id,
        resumen=summary or contact_need,
        notes=contact_notes,
        email=email_value,
        extra={"highlights": highlights},
    )

    return {"status": "sent", "email": email_value, "message_id": message_id}


async def _handle_close_lead(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    contact = await _resolve_contact(context.contact_id)
    notes = _require(arguments, "notes")
    necesidad = _require(arguments, "necesidad_proposito")
    siguiente_accion = str(arguments.get("siguiente_accion") or "").strip() or None
    tarjeta_id = None
    try:
        tarjeta_id = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.ensure_opportunity_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    await storage.update_contact(
        context.contact_id,
        {"notes": notes, "necesidad_proposito": necesidad},
    )
    if tarjeta_id:
        scoring_answers = {
            key: arguments.get(key)
            for key in (
                "financing_type",
                "credit_preapproved",
                "budget_range",
                "down_payment_ready",
                "purchase_timeline",
                "hard_deadline",
                "requirements_defined",
                "comparison_mode",
                "visited_properties",
                "decision_authority",
                "buyer_type",
            )
            if key in arguments
        }
        action_text = (siguiente_accion or "").lower()
        requested = any(token in action_text for token in ("cita", "agendar", "demo", "visita"))
        appointment_requested = _optional_bool_argument(arguments, "appointment_requested")
        accepted_questions = _optional_bool_argument(
            arguments, "accepted_answering_questions"
        )
        evasive_count = _optional_int_argument(arguments, "evasive_answers_count")
        response_time_bucket_raw = str(arguments.get("response_time_bucket") or "").strip().lower()
        response_time_bucket = (
            response_time_bucket_raw
            if response_time_bucket_raw in {"fast", "medium", "slow"}
            else None
        )
        scoring_events: dict[str, Any] = {
            "channel": context.channel or "whatsapp",
            "appointment_requested": (
                appointment_requested if appointment_requested is not None else requested
            ),
            "accepted_answering_questions": (
                accepted_questions if accepted_questions is not None else True
            ),
        }
        if evasive_count is not None:
            scoring_events["evasive_answers_count"] = evasive_count
        if response_time_bucket is not None:
            scoring_events["response_time_bucket"] = response_time_bucket
        try:
            await storage.apply_lead_scoring(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                opportunity_id=str(tarjeta_id),
                answers=scoring_answers,
                events=scoring_events,
                source="close_lead",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.close_lead.scoring_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
        try:
            await storage.maybe_promote_prequalified_from_scoring(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                opportunity_id=str(tarjeta_id),
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.close_lead.prequalified_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
    try:
        # Mantener hilo único en inbox: en WhatsApp el cierre operativo del lead
        # no debe forzar una nueva conversación técnica al siguiente mensaje.
        await storage.update_conversation(context.conversation_id, {"estado": "pendiente"})
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.conversation_update_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=notes,
            intencion=necesidad,
            siguiente_accion=siguiente_accion,
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    if tarjeta_id:
        try:
            await storage.maybe_auto_name_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                opportunity_id=str(tarjeta_id),
                intent=necesidad,
                summary=notes,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.close_lead.auto_name_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )

    await _notify_sales_rep(
        context=context,
        trigger="close_lead",
        contact=contact,
        opportunity_id=tarjeta_id,
        resumen=necesidad,
        notes=notes,
        email=None,
        extra={"siguiente_accion": siguiente_accion},
    )

    return {
        "status": "ok",
        "notes": notes,
        "necesidad_proposito": necesidad,
        "siguiente_accion": siguiente_accion,
        "tarjeta_id": tarjeta_id,
    }


async def _handle_restart_cycle(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    reason = str(arguments.get("reason") or "").strip()
    ensure_payload = await storage.ensure_conversation_opportunity(
        conversation_id=context.conversation_id,
        contact_id=context.contact_id,
        channel=context.channel or "whatsapp",
        force_new_opportunity_on_restart=True,
        include_restart_metadata=True,
    )
    restart_created = False
    restart_sequence = 1
    oportunidad_id = None
    if isinstance(ensure_payload, dict):
        restart_created = bool(ensure_payload.get("restart_created"))
        restart_sequence = int(ensure_payload.get("restart_sequence") or 1)
        oportunidad_id = ensure_payload.get("oportunidad_id")
    else:
        oportunidad_id = ensure_payload

    if restart_created:
        resumen_text = reason or f"Nuevo ciclo #{restart_sequence} solicitado por el asistente."
        await _notify_sales_rep(
            context=context,
            trigger="restart_tool",
            contact=None,
            opportunity_id=oportunidad_id,
            resumen=resumen_text,
            notes="El asistente detectó un cambio de tema y abrió un ciclo nuevo.",
            email=None,
            extra={"restart_sequence": restart_sequence},
        )

    return {
        "status": "ok",
        "restart_created": restart_created,
        "restart_sequence": restart_sequence,
        "oportunidad_id": oportunidad_id,
    }


async def _handle_list_demo_slots(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    conversation_meta = await webchat_service._resolve_conversation_metadata(context.conversation_id)
    calendar_settings = await webchat_service.get_calendar_runtime_settings_for_organizacion(
        conversation_meta.get("organizacion_id")
    )
    resource_id = calendar_settings.resource_id
    if not resource_id:
        raise ValueError("No se configuró el calendario de demos para el webchat.")
    timezone_pref = webchat_service._resolve_timezone_preference(arguments.get("timezone"), calendar_settings)
    start_raw = arguments.get("start_date") or arguments.get("window_start")
    start_date = webchat_service._parse_calendar_date(start_raw)
    window_days = webchat_service._normalize_window_days(
        arguments.get("window_days") or arguments.get("days"),
        calendar_settings.default_days,
    )
    end_date = start_date + timedelta(days=window_days - 1)
    try:
        availability_raw = await webchat_service.calendar_service.list_slots(
            resource_id=resource_id,
            start_date=start_date,
            end_date=end_date,
            timezone_hint=timezone_pref,
            max_days=window_days,
            fallback_hold_minutes=calendar_settings.hold_minutes,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc

    slots = [slot for slot in availability_raw.get("slots", []) if slot.get("is_available")]
    availability_payload = dict(availability_raw)
    availability_payload["slots"] = slots

    return {
        "status": "ok",
        "resource_id": resource_id,
        "timezone": availability_payload.get("timezone"),
        "window_start": availability_payload.get("window_start"),
        "window_end": availability_payload.get("window_end"),
        "slot_duration_minutes": availability_payload.get("slot_duration_minutes"),
        "slots": availability_payload["slots"],
        "_side_effects": {"availability": availability_payload},
    }


async def _handle_schedule_demo(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    conversation_meta = await webchat_service._resolve_conversation_metadata(context.conversation_id)
    calendar_settings = await webchat_service.get_calendar_runtime_settings_for_organizacion(
        conversation_meta.get("organizacion_id")
    )
    resource_id = calendar_settings.resource_id
    if not resource_id:
        raise ValueError("No se configuró el calendario de demos para el webchat.")
    slot_id = str(arguments.get("slot_id") or "").strip()
    start_raw = arguments.get("start_at")
    if not start_raw and slot_id:
        _, _, candidate = slot_id.partition(":")
        if candidate:
            start_raw = candidate
    slot_datetime = webchat_service._parse_calendar_datetime(start_raw)
    hold_minutes = max(1, calendar_settings.hold_minutes)
    slot_identifier = slot_id or webchat_service._build_slot_identifier(resource_id, slot_datetime)
    notes = (arguments.get("notes") or "").strip() or None

    contact = await _resolve_contact(context.contact_id)
    try:
        tarjeta_id = await webchat_service._ensure_opportunity_when_contact_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel="whatsapp",
            contact=contact,
        )
    except storage.StorageError as exc:
        logger.exception(
            "calendar.ensure_opportunity_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
        raise ValueError("No pude asociar la oportunidad para agendar la demo.") from exc

    metadata_payload: dict[str, Any] = {
        "slot_id": slot_identifier,
        "source": "whatsapp",
        "conversation_id": context.conversation_id,
        "tarjeta_id": tarjeta_id,
        "oportunidad_id": tarjeta_id,
    }
    organizacion_hint = webchat_service._extract_contact_org(contact)
    if organizacion_hint:
        metadata_payload["organizacion_id"] = organizacion_hint

    contact_record = contact
    confirm_metadata = {
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
        "session_id": context.session_id,
        "tarjeta_id": tarjeta_id,
    }
    contact_org = webchat_service._extract_contact_org(contact_record)
    if contact_org:
        confirm_metadata["organizacion_id"] = contact_org

    try:
        hold = await webchat_service.calendar_service.hold_slot(
            resource_id=resource_id,
            slot_start=slot_datetime,
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            tarjeta_id=tarjeta_id,
            hold_minutes=hold_minutes,
            metadata=metadata_payload,
        )
        booking = await webchat_service.calendar_service.confirm_slot(
            hold_id=hold.get("hold_id"),
            notes=notes,
            metadata=confirm_metadata,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc

    booking_response = webchat_service._build_booking_response(booking)
    contact = await _resolve_contact(context.contact_id)
    contact = await _resolve_contact(context.contact_id)
    booking_response.hold_id = hold.get("hold_id")
    contact_record = contact
    await webchat_service._sync_booking_with_opportunity(
        booking=booking_response,
        tarjeta_id=tarjeta_id,
        contact=contact_record,
        channel="whatsapp",
    )
    await webchat_service._send_booking_confirmation_email(
        booking=booking_response,
        contact_id=context.contact_id,
        conversation_id=context.conversation_id,
        tarjeta_id=tarjeta_id,
        contact=contact_record,
    )
    try:
        await storage.apply_lead_scoring(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            opportunity_id=str(tarjeta_id),
            events={
                "channel": "whatsapp",
                "appointment_requested": True,
                "appointment_scheduled": True,
                "appointment_confirmed": True,
            },
            source="booking_confirmed",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.schedule_demo.scoring_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    try:
        await storage.maybe_promote_prequalified_from_scoring(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            opportunity_id=str(tarjeta_id),
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.schedule_demo.prequalified_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    try:
        await _notify_sales_rep(
            context=context,
            trigger="booking_confirmed",
            contact=contact_record,
            opportunity_id=tarjeta_id,
            resumen="Cita agendada",
            notes=(
                f"Cita confirmada para {booking_response.start_at.isoformat()} "
                f"(booking {booking_response.booking_id})."
            ),
            email=contact_record.get("correo"),
            extra={
                "booking_id": booking_response.booking_id,
                "slot_start": booking_response.start_at.isoformat(),
                "slot_end": booking_response.end_at.isoformat() if booking_response.end_at else None,
            },
        )
    except Exception:
        logger.warning(
            "whatsapp.booking_notify_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
            },
        )

    booking_payload = {
        "booking_id": booking_response.booking_id,
        "resource_id": booking_response.resource_id,
        "start_at": booking_response.start_at.isoformat(),
        "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
        "timezone": booking_response.timezone,
        "status": booking_response.status,
        "hold_id": booking_response.hold_id,
    }
    return {
        "status": "ok",
        **booking_payload,
        "_side_effects": {"booking": booking_payload},
    }


async def _handle_reschedule_demo(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    booking_id = str(arguments.get("booking_id") or "").strip()
    if not booking_id:
        raise ValueError("booking_id requerido para reschedule_demo")
    new_slot_raw = arguments.get("start_at") or arguments.get("slot_start")
    new_slot_datetime = webchat_service._parse_calendar_datetime(new_slot_raw)
    notes = (arguments.get("notes") or "").strip() or None
    contact = await _resolve_contact(context.contact_id)
    org_hint = webchat_service._extract_contact_org(contact) if contact else None
    if not org_hint:
        try:
            conversation_meta = await storage.fetch_conversation(context.conversation_id)
        except StorageError:
            conversation_meta = {}
        org_hint = str(conversation_meta.get("organizacion_id") or "").strip() or None
    resolved_org = webchat_service._resolve_org_uuid(org_hint)
    metadata_payload: dict[str, Any] = {
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
        "session_id": context.session_id,
    }
    if resolved_org:
        metadata_payload["organizacion_id"] = resolved_org
    try:
        booking = await webchat_service.calendar_service.reschedule_booking(
            booking_id=booking_id,
            new_slot_start=new_slot_datetime,
            notes=notes,
            metadata=metadata_payload,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc
    booking_response = webchat_service._build_booking_response(booking)
    await webchat_service._sync_booking_with_opportunity(
        booking=booking_response,
        tarjeta_id=booking_response.tarjeta_id,
        contact=contact,
        channel="whatsapp",
    )
    await webchat_service._send_booking_confirmation_email(
        booking=booking_response,
        contact_id=context.contact_id,
        conversation_id=context.conversation_id,
        tarjeta_id=booking_response.tarjeta_id,
        contact=contact,
    )
    try:
        await _notify_sales_rep(
            context=context,
            trigger="booking_confirmed",
            contact=contact,
            opportunity_id=booking_response.tarjeta_id,
            resumen="Cita agendada",
            notes=f"Cita confirmada para {booking_response.start_at.isoformat()} (booking {booking_response.booking_id}).",
            email=contact.get("correo"),
            extra={
                "booking_id": booking_response.booking_id,
                "slot_start": booking_response.start_at.isoformat(),
                "slot_end": booking_response.end_at.isoformat() if booking_response.end_at else None,
            },
        )
    except Exception:
        logger.warning(
            "whatsapp.booking_notify_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
            },
        )
    return {
        "status": "ok",
        "booking_id": booking_response.booking_id,
        "resource_id": booking_response.resource_id,
        "start_at": booking_response.start_at.isoformat(),
        "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
        "timezone": booking_response.timezone,
        "status": booking_response.status,
        "hold_id": booking_response.hold_id,
    }


async def _handle_cancel_demo(arguments: dict[str, Any], context: ToolRuntimeContext) -> dict[str, Any]:
    booking_id = str(arguments.get("booking_id") or "").strip()
    if not booking_id:
        raise ValueError("booking_id requerido para cancel_demo")
    reason = (arguments.get("reason") or "").strip() or None
    try:
        booking = await webchat_service.calendar_service.cancel_booking(
            booking_id=booking_id,
            reason=reason,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc
    booking_response = webchat_service._build_booking_response(booking)
    contact_record = await _resolve_contact(context.contact_id)
    logger.info(
        "whatsapp.cancel_notify.start",
        extra={
            "conversation_id": context.conversation_id,
            "contact_id": context.contact_id,
            "booking_id": booking_response.booking_id,
            "reason": reason,
        },
    )
    try:
        await _notify_sales_rep(
            context=context,
            trigger="booking_canceled",
            contact=contact_record,
            opportunity_id=None,
            resumen="Cita cancelada",
            notes=reason,
            email=contact_record.get("correo") if contact_record else None,
            extra={
                "booking_id": booking_response.booking_id,
                "slot_start": booking_response.start_at.isoformat(),
                "slot_end": booking_response.end_at.isoformat() if booking_response.end_at else None,
                "reason": reason or "Sin motivo",
            },
        )
    except Exception as exc:
        logger.warning(
            "whatsapp.cancel_notify_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "error": str(exc),
            },
        )
    return {
        "status": "ok",
        "booking_id": booking_response.booking_id,
        "resource_id": booking_response.resource_id,
        "start_at": booking_response.start_at.isoformat(),
        "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
        "timezone": booking_response.timezone,
        "status": booking_response.status,
        "hold_id": booking_response.hold_id,
    }


async def _resolve_contact(contact_id: str | None) -> dict[str, Any] | None:
    if not contact_id:
        return None
    try:
        return await storage.fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "whatsapp.tools.contact_lookup_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        return None


def _contact_org_uuid(contact: dict[str, Any] | None) -> UUID | None:
    if not contact:
        return None
    org_value = webchat_service._extract_contact_org(contact)
    if not org_value:
        return None
    resolved = webchat_service._resolve_org_uuid(org_value)
    if not resolved:
        return None
    try:
        return UUID(resolved)
    except ValueError:
        return None


async def _notify_sales_rep(
    *,
    context: ToolRuntimeContext,
    trigger: str,
    contact: dict[str, Any] | None,
    opportunity_id: str | None,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: dict[str, Any] | None,
) -> None:
    contact_record = contact or await _resolve_contact(context.contact_id)
    if not contact_record:
        logger.warning(
            "whatsapp.notify_sales.contact_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return
    org_id = contact_record.get("organizacion_id")
    if not org_id:
        logger.warning(
            "whatsapp.notify_sales.org_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    opp_id = opportunity_id
    if not opp_id:
        try:
            opp_id = await storage.ensure_conversation_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.notify_sales.ensure_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "trigger": trigger,
                    "error": str(exc),
                },
            )
            return

    try:
        org_uuid = UUID(str(org_id))
        opp_uuid = UUID(str(opp_id))
    except (TypeError, ValueError):
        logger.warning(
            "whatsapp.notify_sales.invalid_ids",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.notify_sales.fetch_opportunity_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    if not opportunity:
        logger.warning(
            "whatsapp.notify_sales.opportunity_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    whatsapp_settings = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=org_uuid)

    metadata = _ensure_dict(opportunity.get("metadata"))
    notifications = _ensure_dict(metadata.get("sales_notifications"))
    primary_triggers = {"close_lead", "information_email"}
    if trigger == "information_email":
        if any(
            notifications.get(existing)
            for existing in primary_triggers
            if existing != "information_email"
        ):
            logger.info(
                "whatsapp.notify_sales.primary_already_sent",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
    if notifications.get(trigger):
        logger.info(
            "whatsapp.notify_sales.already_sent",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    assigned = opportunity.get("asignado") or {}
    seller_id = assigned.get("id")
    seller_phone = assigned.get("telefono_e164") or assigned.get("telefono")
    seller_name = str(assigned.get("nombre_completo") or "").strip() or "Equipo Tal-IA"
    if not seller_id or not seller_phone:
        logger.warning(
            "whatsapp.notify_sales.no_seller",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    message_body = _compose_sales_notification_message(
        contact=contact_record,
        trigger=trigger,
        resumen=resumen,
        notes=notes,
        email=email,
        extra=extra,
    )
    appointment_template = (
        whatsapp_settings.appointment_template_sid
        or settings.whatsapp_sales_appointment_template_sid
    )
    cancel_template = (
        whatsapp_settings.cancel_template_sid
        or settings.whatsapp_sales_cancel_appointment_template_sid
    )
    template_sid: str | None = None
    template_vars: dict[str, str] | None = None
    if trigger == "booking_confirmed" and appointment_template:
        template_sid = appointment_template
        template_vars = _build_booking_template_variables(
            contact=contact_record,
            seller_name=seller_name,
            extra=extra,
        )
    elif trigger == "booking_canceled" and cancel_template:
        template_sid = cancel_template
        template_vars = _build_booking_template_variables(
            contact=contact_record,
            seller_name=seller_name,
            extra=extra,
        )
    else:
        if trigger == "booking_canceled":
            logger.info(
                "whatsapp.notify_sales.cancel_template_missing",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "trigger": trigger,
                    "seller_id": seller_id,
                },
            )
        template_sid = whatsapp_settings.sales_template_sid or settings.whatsapp_sales_template_sid
        if template_sid:
            template_vars = _build_sales_template_variables(
            contact=contact_record,
            resumen=resumen,
            notes=notes,
            extra=extra,
            seller_name=seller_name,
            email=email,
        )

    logger.info(
        "whatsapp.notify_sales.pre_send",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "seller_id": seller_id,
            "seller_phone": seller_phone,
            "template_sid": template_sid,
            "template_vars": template_vars,
        },
    )

    send_result = None
    try:
        from app.channels.whatsapp import service as whatsapp_service

        send_result = await whatsapp_service.send_manual_message(
            to_number=seller_phone,
            body=None if template_sid else message_body,
            template_sid=template_sid,
            template_variables=template_vars,
            organizacion_id=org_uuid,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    send_error = getattr(send_result, "error", None) if send_result else None
    if send_error:
        logger.warning(
            "whatsapp.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": send_error,
            },
        )
        return

    message_sid = getattr(send_result, "sid", None) if send_result else None
    status_value = getattr(send_result, "status", None) if send_result else None
    logger.info(
        "whatsapp.notify_sales.result",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "template_sid": template_sid,
            "message_sid": message_sid,
            "status": status_value,
            "seller_id": seller_id,
        },
    )

    if message_sid:
        try:
            await storage.register_whatsapp_message(
                direction="saliente",
                wa_id=None,
                phone_e164=seller_phone,
                body=message_body if not template_sid else None,
                message_sid=message_sid,
                metadata={
                    "trigger": trigger,
                    "template_sid": template_sid,
                    "sender": "sales_notification",
                },
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                organizacion_id=str(org_id),
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.notify_sales.metadata_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "trigger": trigger,
                    "error": str(exc),
                    "message_sid": message_sid,
                },
            )

    notifications[trigger] = {
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
    }
    metadata["sales_notifications"] = notifications
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )

        seller_id_value = assigned.get("id")
        if seller_id_value:
            seller_uuid = UUID(str(seller_id_value))
            assignment_metadata: dict[str, Any] = {
                "reason": extra or {},
                "notification": {
                    "trigger": trigger,
                    "uses_template": bool(template_sid),
                },
            }
            await repo.insert_sales_assignment_audit(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
                vendedor_id=seller_uuid,
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                trigger=f"notify_{trigger}",
                metadata=assignment_metadata,
                notification_sid=message_sid,
                canal="whatsapp",
            )
    except (ValueError, CRMRepositoryError) as exc:
        logger.warning(
            "whatsapp.notify_sales.metadata_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc)},
        )
        return

    logger.info(
        "whatsapp.notify_sales.sent",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "seller_id": seller_id,
        },
    )


def _compose_sales_notification_message(
    *,
    contact: dict[str, Any],
    trigger: str,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: dict[str, Any] | None,
) -> str:
    name = str(contact.get("nombre_completo") or "").strip() or "Prospecto sin nombre"
    company = str(contact.get("company_name") or "").strip()
    phone = str(contact.get("telefono_e164") or "").strip()
    correo = str(contact.get("correo") or "").strip()
    lines = [
        "🚀 Tal-IA tiene un lead listo para seguimiento.",
        f"Nombre: {name}",
    ]
    if company:
        lines.append(f"Empresa: {company}")
    if phone:
        lines.append(f"WhatsApp: {phone}")
    if correo:
        lines.append(f"Correo: {correo}")

    if trigger == "information_email":
        lines.append("Acción: solicitó información y ya se le envió por correo.")
        if email and email.lower() != correo.lower():
            lines.append(f"Correo confirmado para envío: {email}")
    elif trigger == "close_lead":
        lines.append("Acción: completó la calificación del asistente.")
    elif trigger == "booking_confirmed":
        lines.append("Acción: agendó una cita.")
    elif trigger == "booking_canceled":
        lines.append("Acción: canceló la cita.")
        reason = (extra or {}).get("reason")
        if reason:
            lines.append(f"Motivo: {reason}")

    if resumen:
        lines.append(f"Necesidad: {resumen}")
    if notes and notes != resumen:
        lines.append(f"Notas: {notes}")
    siguiente = (extra or {}).get("siguiente_accion")
    if siguiente:
        lines.append(f"Siguiente paso sugerido: {siguiente}")

    lines.append("Puedes seguir la conversación desde el panel o responder por WhatsApp.")
    return "\n".join(lines)


def _build_sales_template_variables(
    *,
    contact: dict[str, Any],
    resumen: str | None,
    notes: str | None,
    extra: dict[str, Any] | None,
    seller_name: str,
    email: str | None,
) -> dict[str, str]:
    """Mapea los valores dinámicos a las variables esperadas por la plantilla."""
    name = str(contact.get("nombre_completo") or "").strip() or "Prospecto Tal-IA"
    company = str(contact.get("company_name") or "").strip()
    summary_text = resumen or notes or "Pendiente de detalle"
    next_action = str((extra or {}).get("siguiente_accion") or "").strip()
    phone = str(
        contact.get("telefono_e164") or contact.get("telefono") or ""
    ).strip()
    email_value = str(email or contact.get("correo") or "").strip()

    return {
        "1": seller_name,
        "2": name,
        "3": summary_text,
        "4": next_action or "Contacta y confirma próximos pasos.",
        "5": phone or "N/D",
        "6": email_value or "N/D",
        "7": company or "Sin empresa",
    }


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _format_booking_datetime(value: datetime | None) -> tuple[str, str]:
    if not value:
        return "Pendiente", "Pendiente"
    tz_name = settings.webchat_calendar_timezone or "UTC"
    try:
        target_tz = ZoneInfo(tz_name)
    except Exception:
        target_tz = timezone.utc
    localized = value.astimezone(target_tz)
    return localized.strftime("%d/%m/%Y"), localized.strftime("%H:%M")


def _extract_contact_location(contact: dict[str, Any]) -> str:
    raw_data = contact.get("contacto_datos") or {}
    if isinstance(raw_data, str):
        try:
            raw_data = json.loads(raw_data)
        except json.JSONDecodeError:
            raw_data = {}
    ubicacion = raw_data.get("ubicacion") or {}
    if isinstance(ubicacion, str):
        try:
            ubicacion = json.loads(ubicacion)
        except json.JSONDecodeError:
            ubicacion = {}
    parts: list[str] = []
    for field in ("nom_mun", "nom_ent"):
        candidate = ubicacion.get(field)
        if isinstance(candidate, str):
            candidate = candidate.strip()
        if candidate:
            parts.append(candidate)
    if not parts:
        fallback = raw_data.get("formatted_address") or raw_data.get("direccion")
        if fallback:
            parts.append(str(fallback).strip())
    if not parts:
        return "Pendiente de confirmación"
    return ", ".join(parts)


def _extract_model_description(contact: dict[str, Any]) -> str:
    for key in ("notes", "necesidad_proposito"):
        candidate = contact.get(key)
        if isinstance(candidate, str):
            cleaned = candidate.strip()
            if cleaned:
                return cleaned.split("\n", 1)[0]
    return "Modelo pendiente"


def _build_booking_template_variables(
    *,
    contact: dict[str, Any],
    seller_name: str,
    extra: dict[str, Any] | None,
) -> dict[str, str]:
    slot_iso = (extra or {}).get("slot_start")
    date_text, time_text = _format_booking_datetime(_parse_iso_datetime(slot_iso))
    client_name = str(contact.get("nombre_completo") or "").strip() or "Prospecto Tal-IA"
    model = _extract_model_description(contact)
    location = _extract_contact_location(contact)
    phone = str(contact.get("telefono_e164") or contact.get("telefono") or "N/D").strip() or "N/D"
    reason = str((extra or {}).get("reason") or "").strip() or "Sin motivo especificado"
    return {
        "1": seller_name,
        "2": client_name,
        "3": date_text,
        "4": time_text,
        "5": model,
        "6": location,
        "7": phone,
        "8": reason,
    }
