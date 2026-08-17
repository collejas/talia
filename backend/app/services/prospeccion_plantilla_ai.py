"""Generación segura de borradores de plantillas de prospección con OpenAI."""

from __future__ import annotations

import asyncio
import json
import re
import time
from datetime import datetime, timezone
from html import escape as escape_html
from html.parser import HTMLParser
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.assistants.manager import AssistantConfig
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository
from app.repositories.platform_admin import PlatformRepository
from app.services.openai import get_openai_client
from app.services import openai_usage_ledger

logger = get_logger("app.services.prospeccion_plantilla_ai")

Channel = Literal["correo", "whatsapp"]
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")
_HTML_TAG_RE = re.compile(r"</?\s*([A-Za-z0-9]+)(?:\s[^>]*)?>")
_FORBIDDEN_HTML_RE = re.compile(r"<(?:script|iframe|form|object|embed)|\son[a-z]+\s*=|javascript:", re.I)
_ALLOWED_HTML_TAGS = {"p", "br", "strong", "em", "ul", "ol", "li", "a", "h1", "h2", "table", "tr", "td", "img"}
_PLACEHOLDER_VALUE_RE = re.compile(r"^\{\{\s*[A-Za-z0-9_]+\s*\}\}$")


class TemplateAiGenerationRequest(BaseModel):
    canal: Channel
    campana_id: UUID | None = None
    variables_seleccionadas: list[str] = Field(..., min_length=1, max_length=30)
    instruccion_usuario: str = Field(..., min_length=10, max_length=4000)
    tono: str = Field(default="profesional", min_length=2, max_length=60)
    idioma: str = Field(default="es-MX", min_length=2, max_length=20)
    borrador_actual: str | None = Field(default=None, max_length=40_000)

    @field_validator("variables_seleccionadas")
    @classmethod
    def normalize_variables(cls, value: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(item.strip() for item in value if item.strip()))
        if not normalized:
            raise ValueError("variables_seleccionadas_required")
        return normalized

    @field_validator("instruccion_usuario", "tono", "idioma")
    @classmethod
    def strip_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("text_required")
        return cleaned


class TemplateAiGenerationResult(BaseModel):
    nombre_sugerido: str = Field(..., max_length=120)
    descripcion: str = Field(..., max_length=300)
    cuerpo_texto: str = Field(..., max_length=4096)
    variables_usadas: list[str] = Field(default_factory=list, max_length=30)
    advertencias: list[str] = Field(default_factory=list, max_length=20)


class WhatsAppTemplateAiResult(TemplateAiGenerationResult):
    meta_category_sugerida: Literal["marketing", "utility", "authentication", "no_determinada"]
    language_code_sugerido: str = Field(..., max_length=20)


class EmailTemplateAiResult(TemplateAiGenerationResult):
    asunto: str = Field(..., min_length=1, max_length=998)
    cuerpo_html: str = Field(..., min_length=1, max_length=40_000)


def _schema(channel: Channel) -> dict[str, Any]:
    common: dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "required": ["nombre_sugerido", "descripcion", "cuerpo_texto", "variables_usadas", "advertencias"],
        "properties": {
            "nombre_sugerido": {"type": "string", "maxLength": 120},
            "descripcion": {"type": "string", "maxLength": 300},
            "cuerpo_texto": {"type": "string", "maxLength": 4096},
            "variables_usadas": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
            "advertencias": {"type": "array", "items": {"type": "string", "maxLength": 300}},
        },
    }
    if channel == "whatsapp":
        common["required"] += ["meta_category_sugerida", "language_code_sugerido"]
        common["properties"].update(
            {
                "meta_category_sugerida": {"type": "string", "enum": ["marketing", "utility", "authentication", "no_determinada"]},
                "language_code_sugerido": {"type": "string", "maxLength": 20},
            }
        )
    else:
        common["required"] += ["asunto", "cuerpo_html"]
        common["properties"].update(
            {
                "asunto": {"type": "string", "maxLength": 998},
                "cuerpo_html": {"type": "string", "maxLength": 40_000},
            }
        )
    return common


def _extract_response_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()
    payload = response.model_dump() if hasattr(response, "model_dump") else {}
    chunks: list[str] = []
    for item in payload.get("output", []) if isinstance(payload, dict) else []:
        for content in item.get("content", []) if isinstance(item, dict) else []:
            text = content.get("text") if isinstance(content, dict) else None
            if isinstance(text, str):
                chunks.append(text)
    return "".join(chunks).strip()


class _SafeEmailHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def _append_tag(self, tag: str, attrs: list[tuple[str, str | None]], self_closing: bool = False) -> None:
        if tag not in _ALLOWED_HTML_TAGS:
            return
        safe_attrs: list[str] = []
        for name, value in attrs:
            normalized_name = name.lower()
            if normalized_name not in {"href", "src", "alt", "title"} or value is None:
                continue
            if normalized_name in {"href", "src"} and not (
                value.lower().startswith("https://") or _PLACEHOLDER_VALUE_RE.fullmatch(value.strip())
            ):
                continue
            safe_attrs.append(f'{normalized_name}="{escape_html(value, quote=True)}"')
        suffix = f" {' '.join(safe_attrs)}" if safe_attrs else ""
        self.parts.append(f"<{tag}{suffix}{' /' if self_closing else ''}>")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._append_tag(tag.lower(), attrs)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._append_tag(tag.lower(), attrs, self_closing=True)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in _ALLOWED_HTML_TAGS and tag.lower() not in {"br", "img"}:
            self.parts.append(f"</{tag.lower()}>")

    def handle_data(self, data: str) -> None:
        self.parts.append(escape_html(data, quote=False))


def _sanitize_html(value: str) -> str:
    parser = _SafeEmailHtmlParser()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts).strip()


def _validate_html(value: str) -> str:
    if _FORBIDDEN_HTML_RE.search(value):
        raise ValueError("html_forbidden_content")
    for match in _HTML_TAG_RE.finditer(value):
        if match.group(1).lower() not in _ALLOWED_HTML_TAGS:
            raise ValueError("html_tag_not_allowed")
    sanitized = _sanitize_html(value)
    if not sanitized:
        raise ValueError("html_empty")
    return sanitized


def _validate_placeholders(result: TemplateAiGenerationResult, selected: set[str], channel: Channel) -> None:
    text_values = [result.cuerpo_texto]
    if channel == "correo" and isinstance(result, EmailTemplateAiResult):
        text_values.extend([result.asunto, result.cuerpo_html])
        result.cuerpo_html = _validate_html(result.cuerpo_html)
    used_in_text = {match.group(1) for value in text_values for match in _PLACEHOLDER_RE.finditer(value)}
    declared = set(result.variables_usadas)
    unknown = used_in_text - selected
    if unknown or not declared.issubset(selected) or not declared.issubset(used_in_text):
        raise ValueError("template_ai_unknown_variable")


async def generate_template_draft(
    *,
    request: TemplateAiGenerationRequest,
    organizacion_id: UUID,
    usuario_id: UUID,
    crm_repo: CRMRepository,
    platform_repo: PlatformRepository,
) -> dict[str, Any]:
    configs = await platform_repo.list_prospeccion_template_ai_prompt_configs(organizacion_id=UUID("00000000-0000-0000-0000-000000000001"))
    config = next((row for row in configs if row.get("canal") == request.canal and row.get("activo") is True), None)
    if not config:
        raise ValueError("template_ai_prompt_not_configured")

    variables_rows = await platform_repo.list_prospeccion_template_ai_variables(canal=request.canal)
    variable_map: dict[str, dict[str, Any]] = {}
    for row in variables_rows:
        variable = row.get("variable")
        if isinstance(variable, dict) and isinstance(variable.get("clave"), str):
            variable_map[variable["clave"]] = {**variable, **{key: row.get(key) for key in ("permite_asunto", "permite_cuerpo_texto", "permite_cuerpo_html", "permite_header_media")}}
    selected = set(request.variables_seleccionadas)
    unknown = selected - variable_map.keys()
    if unknown:
        raise ValueError("template_ai_variable_not_allowed")
    campaign = None
    if request.campana_id:
        campaign = await crm_repo.get_campaign(organizacion_id=organizacion_id, campana_id=request.campana_id)
        if not campaign:
            raise ValueError("campana_not_found")
        if str(campaign.get("canal") or "").strip().lower() != request.canal:
            raise ValueError("template_ai_campaign_channel_mismatch")
    organization = await platform_repo.get_organizacion_details(organizacion_id=organizacion_id) or {}
    context = {
        "nombre": organization.get("nombre"),
        "nombre_comercial": organization.get("nombre_comercial"),
        "sitio_web": organization.get("sitio_web") or organization.get("dominio_principal"),
        "ciudad": organization.get("ciudad"),
        "estado": organization.get("estado"),
    }
    prompt_id = str(config.get("prompt_id") or "").strip()
    prompt_version = str(config.get("prompt_version") or "").strip()
    if not prompt_id or not prompt_version:
        raise ValueError("template_ai_prompt_not_configured")
    generation = await platform_repo.create_prospeccion_template_ai_generation(
        payload={
            "organizacion_id": str(organizacion_id),
            "usuario_id": str(usuario_id),
            "campana_id": str(request.campana_id) if request.campana_id else None,
            "canal": request.canal,
            "prompt_id": prompt_id,
            "prompt_version": prompt_version,
            "modelo": "prompt_configured",
            "instruccion_usuario": request.instruccion_usuario,
            "tono": request.tono,
            "idioma": request.idioma,
            "resultado_estado": "solicitada",
        }
    )
    generation_id = UUID(str(generation["id"]))
    await platform_repo.create_prospeccion_template_ai_generation_variables(
        rows=[
            {"organizacion_id": str(organizacion_id), "generacion_id": str(generation_id), "variable_id": str(variable_map[key]["id"]), "seleccionada_por_usuario": True, "utilizada_por_modelo": False}
            for key in request.variables_seleccionadas
        ]
    )
    started = time.perf_counter()
    try:
        assistant = AssistantConfig(prompt_id=prompt_id, prompt_version=prompt_version)
        client = get_openai_client(project_id=None)
        prompt_variables = {
            "instruccion_usuario": request.instruccion_usuario,
            "idioma": request.idioma,
            "tono": request.tono,
            "variables_seleccionadas": json.dumps(request.variables_seleccionadas, ensure_ascii=False),
            "catalogo_variables": json.dumps([variable_map[key] for key in request.variables_seleccionadas], ensure_ascii=False),
            "contexto_empresa": json.dumps(context, ensure_ascii=False),
            "borrador_actual": request.borrador_actual or "",
            "restricciones_canal": json.dumps({"canal": request.canal, "max_body_chars": 4096}, ensure_ascii=False),
        }
        response = await asyncio.wait_for(
            client.responses.create(
                prompt={"id": prompt_id, "version": prompt_version, "variables": prompt_variables},
                text={"format": {"type": "json_schema", "name": f"prospeccion_plantilla_{request.canal}", "strict": True, "schema": _schema(request.canal)}},
            ),
            timeout=45,
        )
        response_payload = response.model_dump()
        await openai_usage_ledger.record_response_usage(
            organizacion_id=organizacion_id,
            channel=request.canal,
            feature="prospeccion_template_ai",
            assistant=assistant,
            response_payload=response_payload,
            request_purpose="template_draft_generation",
            latency_ms=int((time.perf_counter() - started) * 1000),
            request_metadata={"generation_id": str(generation_id), "campana_id": str(request.campana_id) if request.campana_id else None, "selected_variables_count": len(selected)},
        )
        raw_result = json.loads(_extract_response_text(response))
        result = WhatsAppTemplateAiResult.model_validate(raw_result) if request.canal == "whatsapp" else EmailTemplateAiResult.model_validate(raw_result)
        _validate_placeholders(result, selected, request.canal)
        usage = await platform_repo.get_openai_usage_by_response_id(organizacion_id=organizacion_id, response_id=str(response_payload.get("id") or ""))
        update_payload: dict[str, Any] = {
            "resultado_estado": "generada",
            "finalizado_en": datetime.now(timezone.utc).isoformat(),
            "modelo": str(response_payload.get("model") or "unknown"),
            "openai_request_id": response_payload.get("id"),
        }
        if usage:
            update_payload.update({"openai_request_usage_id": usage.get("id"), "input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens"), "costo_estimado": usage.get("estimated_total_cost_usd")})
        await platform_repo.update_prospeccion_template_ai_generation(organizacion_id=organizacion_id, generation_id=generation_id, payload=update_payload)
        await platform_repo.update_prospeccion_template_ai_generation_variables(
            organizacion_id=organizacion_id,
            generation_id=generation_id,
            used_variables=list(result.variables_usadas),
            variable_ids={key: UUID(str(variable_map[key]["id"])) for key in result.variables_usadas},
        )
        return {"ok": True, "canal": request.canal, "resultado": result.model_dump(), "auditoria": {"generation_id": str(generation_id), "prompt_version": prompt_version, "request_id": response_payload.get("id")}}
    except Exception as exc:
        await platform_repo.update_prospeccion_template_ai_generation(organizacion_id=organizacion_id, generation_id=generation_id, payload={"resultado_estado": "respuesta_invalida" if isinstance(exc, (ValueError, json.JSONDecodeError)) else "error", "error_codigo": str(exc)[:120], "finalizado_en": datetime.now(timezone.utc).isoformat()})
        logger.warning("template_ai_generation_failed", extra={"organizacion_id": str(organizacion_id), "generation_id": str(generation_id), "error": str(exc)})
        raise
