"""Helpers para formatear el contexto CRM compartido con el asistente."""

from __future__ import annotations

import json
from typing import Any


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _persona_datos(contact: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(contact, dict):
        return {}
    return _ensure_dict(
        contact.get("persona_datos") or contact.get("contacto_datos") or contact.get("metadata")
    )


def build_crm_context_lines(context_data: dict[str, Any] | None) -> list[str]:
    """Devuelve las líneas del bloque 'Contexto CRM' dado el contacto y oportunidad."""
    contact = context_data.get("contact") if context_data else None
    opportunity = context_data.get("opportunity") if context_data else None
    conversation = context_data.get("conversation") if context_data else None
    contact_lines = _build_contact_context_lines(contact)
    opportunity_lines = _build_opportunity_context_lines(opportunity)
    booking_context = context_data.get("booking_context") if context_data else None
    inbox_context = _ensure_dict(conversation.get("inbox_context")) if isinstance(conversation, dict) else {}
    welcome_document_sent = bool(inbox_context.get("welcome_document_sent"))
    if not contact_lines and not opportunity_lines and not booking_context and not welcome_document_sent:
        return []

    lines: list[str] = ["Contexto CRM:"]
    if contact_lines:
        lines.extend(contact_lines)
    if opportunity_lines:
        if contact_lines:
            lines.append("")
        lines.append("Oportunidad vinculada:")
        lines.extend(opportunity_lines)
    if booking_context:
        if contact_lines or opportunity_lines:
            lines.append("")
        lines.append("Contexto de agenda:")
        lines.append(f"- {_safe_text(booking_context)}")
    if welcome_document_sent:
        if contact_lines or opportunity_lines or booking_context:
            lines.append("")
        lines.append("Contexto operativo:")
        lines.append("- Documento de bienvenida enviado por WhatsApp")
    return lines


def _build_contact_context_lines(contact: dict[str, Any] | None) -> list[str]:
    if not isinstance(contact, dict):
        return []
    lines: list[str] = []
    persona_datos = _persona_datos(contact)
    profile_name = str(persona_datos.get("profile_name") or "").strip()
    contact_name = str(contact.get("nombre_completo") or "").strip()
    if contact_name and profile_name and contact_name.lower() == profile_name.lower():
        contact_name = ""
    lines.append(f"- Nombre: {_safe_text(contact_name)}")
    correo = _safe_text(
        contact.get("correo_principal")
        or contact.get("correo_secundario")
        or contact.get("correo")
    )
    telefono = _safe_text(
        contact.get("telefono_principal_e164")
        or contact.get("telefono_movil_1_e164")
        or contact.get("telefono_e164")
    )
    lines.append(f"- Correo: {correo}")
    lines.append(f"- Teléfono: {telefono}")
    lines.append(f"- Empresa: {_safe_text(contact.get('company_name'))}")
    necesidad = contact.get("necesidad_proposito")
    if necesidad:
        lines.append(f"- Necesidad principal: {_safe_text(necesidad)}")
    notes = contact.get("notes")
    if notes:
        lines.append(f"- Notas puntuales: {_safe_text(notes)}")
    estado = contact.get("estado")
    if estado:
        lines.append(f"- Estado del lead: {_safe_text(estado)}")
    captura = contact.get("captura_estado")
    if captura:
        lines.append(f"- Estado de captura: {_safe_text(captura)}")
    ubicacion = persona_datos.get("ubicacion") or {}
    location_parts: list[str] = []
    if ubicacion.get("nom_ent"):
        location_parts.append(str(ubicacion.get("nom_ent")).strip())
    if ubicacion.get("nom_mun"):
        location_parts.append(str(ubicacion.get("nom_mun")).strip())
    lada = ubicacion.get("lada")
    if lada:
        location_parts.append(f"LADA {lada}")
    if location_parts:
        lines.append(f"- Ubicación: {_safe_text(', '.join(location_parts))}")
    if profile_name and profile_name.lower() != contact_name.lower():
        lines.append(
            f"- Perfil WhatsApp (referencia, no nombre real): {_safe_text(profile_name)}"
        )
    return lines


def _build_opportunity_context_lines(opportunity: dict[str, Any] | None) -> list[str]:
    if not isinstance(opportunity, dict):
        return []
    lines: list[str] = []
    lines.append(f"- Título: {_safe_text(opportunity.get('titulo'))}")
    lines.append(f"- Estado: {_safe_text(opportunity.get('estado'))}")
    etapa = opportunity.get("etapa") or {}
    stage_name = etapa.get("nombre")
    stage_code = etapa.get("codigo")
    stage_category = etapa.get("categoria")
    stage_desc_parts: list[str] = []
    if stage_name:
        stage_desc_parts.append(str(stage_name).strip())
    if stage_code and stage_code not in stage_desc_parts:
        stage_desc_parts.append(str(stage_code).strip())
    if stage_category and stage_category not in stage_desc_parts:
        stage_desc_parts.append(str(stage_category).strip())
    if stage_desc_parts:
        lines.append(f"- Etapa del embudo: {_safe_text(' / '.join(stage_desc_parts))}")
    monto = opportunity.get("monto_estimado")
    if monto is not None:
        currency = opportunity.get("moneda") or ""
        amount_str = f"{monto} {currency}".strip()
        lines.append(f"- Monto estimado: {_safe_text(amount_str)}")
    probabilidad = opportunity.get("probabilidad")
    if probabilidad is not None:
        prob_text = f"{probabilidad}%"
        lines.append(f"- Probabilidad: {_safe_text(prob_text)}")
    descripcion = opportunity.get("descripcion")
    if descripcion:
        lines.append(f"- Descripción: {_safe_text(descripcion)}")
    metadata = _ensure_dict(opportunity.get("metadata"))
    project = metadata.get("project_name")
    if project:
        lines.append(f"- Proyecto: {_safe_text(project)}")
    auto_stage = metadata.get("auto_stage")
    if isinstance(auto_stage, dict):
        auto_stage_codes = ", ".join(str(key) for key in auto_stage.keys())
        if auto_stage_codes:
            lines.append(f"- Auto stage: {_safe_text(auto_stage_codes)}")
    return lines


def _safe_text(value: Any) -> str:
    if value is None:
        return "—"
    text = str(value).strip()
    return text if text else "—"


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}
