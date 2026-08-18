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
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository
from app.repositories.platform_admin import PlatformRepository
from app.services.openai import get_openai_client
from app.services import openai_usage_ledger
from app.services.tenant_runtime import MASTER_ORGANIZACION_ID, get_openai_api_key, get_openai_project_id

logger = get_logger("app.services.prospeccion_plantilla_ai")

Channel = Literal["correo", "whatsapp"]
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")
_HTML_TAG_RE = re.compile(r"</?\s*([A-Za-z0-9]+)(?:\s[^>]*)?>")
_FORBIDDEN_HTML_RE = re.compile(r"<(?:script|iframe|form|object|embed)|\son[a-z]+\s*=|javascript:", re.I)
_CTA_URL_VARIABLES = {"tracking_url", "website_url", "booking_url", "whatsapp_url", "custom_url"}
_TALIA_VISUAL_FALLBACK = {
    "fondo_exterior": "#f4f6f8",
    "fondo_principal": "#ffffff",
    "texto_principal": "#111827",
    "texto_secundario": "#475569",
    "acento": "#2563eb",
    "bordes": "#e5e7eb",
}
_ALLOWED_HTML_TAGS = {"p", "br", "strong", "em", "ul", "ol", "li", "a", "h1", "h2", "table", "tr", "td", "img"}
_PLACEHOLDER_VALUE_RE = re.compile(r"^\{\{\s*[A-Za-z0-9_]+\s*\}\}$")
_ALLOWED_STYLE_PROPERTIES = {
    "background",
    "background-color",
    "border",
    "border-radius",
    "box-sizing",
    "color",
    "display",
    "font-family",
    "font-size",
    "font-weight",
    "height",
    "letter-spacing",
    "line-height",
    "margin",
    "margin-bottom",
    "margin-top",
    "max-height",
    "max-width",
    "min-height",
    "padding",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "padding-top",
    "text-align",
    "text-decoration",
    "vertical-align",
    "width",
}
_SAFE_STYLE_VALUE_RE = re.compile(r"""^[A-Za-z0-9#%(),./'"\s:+_-]+$""")
_SAFE_DIMENSION_RE = re.compile(r"^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]+)?(?:px|%|em|rem|auto)?$")


def _sanitize_inline_style(value: str) -> str:
    declarations: list[str] = []
    for declaration in value.split(";"):
        if ":" not in declaration:
            continue
        property_name, property_value = declaration.split(":", 1)
        property_name = property_name.strip().lower()
        property_value = property_value.strip()
        if property_name not in _ALLOWED_STYLE_PROPERTIES:
            continue
        if (
            not property_value
            or not _SAFE_STYLE_VALUE_RE.fullmatch(property_value)
            or re.search(r"url\s*\(|expression\s*\(|@import|[{}<>]", property_value, re.I)
        ):
            continue
        declarations.append(f"{property_name}:{property_value}")
    return ";".join(declarations)


def _safe_attribute_value(name: str, value: str) -> str | None:
    normalized = value.strip()
    if name in {"width", "height", "cellpadding", "cellspacing", "border"}:
        return normalized if _SAFE_DIMENSION_RE.fullmatch(normalized) else None
    if name in {"align", "valign"}:
        return normalized.lower() if normalized.lower() in {"left", "center", "right", "top", "middle", "bottom"} else None
    if name == "role":
        return normalized if normalized == "presentation" else None
    if name == "target":
        return normalized if normalized == "_blank" else None
    if name == "rel":
        return normalized if normalized in {"noopener", "noopener noreferrer", "noreferrer"} else None
    if name == "bgcolor":
        return normalized if re.fullmatch(r"(?:#[0-9A-Fa-f]{3,8}|[A-Za-z]+)", normalized) else None
    return None


class TemplateAiGenerationRequest(BaseModel):
    canal: Channel
    campana_id: UUID | None = None
    variables_seleccionadas: list[str] = Field(..., min_length=1, max_length=30)
    instruccion_usuario: str = Field(..., min_length=10, max_length=4000)
    tono: str = Field(default="profesional", min_length=2, max_length=60)
    idioma: str = Field(default="es-MX", min_length=2, max_length=20)
    estilo_diseno: str = Field(default="automatico", min_length=2, max_length=80)
    borrador_actual: str | None = Field(default=None, max_length=40_000)

    @field_validator("variables_seleccionadas")
    @classmethod
    def normalize_variables(cls, value: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(item.strip() for item in value if item.strip()))
        if not normalized:
            raise ValueError("variables_seleccionadas_required")
        return normalized

    @field_validator("instruccion_usuario", "tono", "idioma", "estilo_diseno")
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
    estilo_diseno: str = Field(default="automatico", min_length=2, max_length=80)


def _schema(channel: Channel) -> dict[str, Any]:
    common: dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "required": ["nombre_sugerido", "descripcion", "cuerpo_texto", "variables_usadas", "advertencias"],
        "properties": {
            "nombre_sugerido": {"type": "string", "maxLength": 120},
            "descripcion": {"type": "string", "maxLength": 300},
            "cuerpo_texto": {"type": "string", "maxLength": 4096},
            # OpenAI Structured Outputs no admite `uniqueItems`; la
            # validación de variables permitidas se hace en backend.
            "variables_usadas": {"type": "array", "items": {"type": "string"}},
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
        common["required"] += ["asunto", "cuerpo_html", "estilo_diseno"]
        common["properties"].update(
            {
                "asunto": {"type": "string", "maxLength": 998},
                "cuerpo_html": {"type": "string", "maxLength": 40_000},
                "estilo_diseno": {"type": "string", "maxLength": 80},
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
            if value is None:
                continue
            if normalized_name == "style":
                safe_style = _sanitize_inline_style(value)
                if safe_style:
                    safe_attrs.append(f'style="{escape_html(safe_style, quote=True)}"')
                continue
            if normalized_name in {"href", "src"} and not (
                value.lower().startswith("https://") or _PLACEHOLDER_VALUE_RE.fullmatch(value.strip())
            ):
                continue
            if normalized_name in {"href", "src", "alt", "title"}:
                safe_attrs.append(f'{normalized_name}="{escape_html(value, quote=True)}"')
                continue
            safe_value = _safe_attribute_value(normalized_name, value)
            if safe_value is not None:
                safe_attrs.append(f'{normalized_name}="{escape_html(safe_value, quote=True)}"')
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
    missing_selected_cta = (selected & _CTA_URL_VARIABLES) - used_in_text
    booking_text_without_url = "booking_link_text" in used_in_text and "booking_url" not in used_in_text
    if (
        unknown
        or not declared.issubset(selected)
        or not declared.issubset(used_in_text)
        or missing_selected_cta
        or booking_text_without_url
    ):
        if missing_selected_cta:
            raise ValueError("template_ai_selected_cta_not_used")
        if booking_text_without_url:
            raise ValueError("template_ai_booking_link_dependency")
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
    layout_rows = await platform_repo.list_prospeccion_template_ai_layouts(
        canal=request.canal,
        organizacion_id=organizacion_id,
    )
    enabled_layouts = [row for row in layout_rows if row.get("activo") is True and row.get("habilitado") is True]
    enabled_layout_codes = {str(row.get("codigo")) for row in enabled_layouts}
    requested_layout = request.estilo_diseno.strip().lower()
    if request.canal == "correo" and requested_layout != "automatico" and requested_layout not in enabled_layout_codes:
        raise ValueError("template_ai_layout_not_allowed")
    default_layout = next(
        (str(row.get("codigo")) for row in enabled_layouts if row.get("predeterminado") is True),
        None,
    )
    resolved_layout_request = default_layout if requested_layout == "automatico" and default_layout else requested_layout
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
        "descripcion_empresa": organization.get("ia_descripcion_empresa"),
        "productos_servicios": organization.get("ia_productos_servicios"),
        "publico_objetivo": organization.get("ia_publico_objetivo"),
        "propuesta_valor": organization.get("ia_propuesta_valor"),
        "diferenciadores": organization.get("ia_diferenciadores"),
        "restricciones_comerciales": organization.get("ia_restricciones_comerciales"),
    }
    design = {
        "color_primario": organization.get("ia_color_primario") or _TALIA_VISUAL_FALLBACK["acento"],
        "color_secundario": organization.get("ia_color_secundario") or _TALIA_VISUAL_FALLBACK["texto_secundario"],
        "color_acento": organization.get("ia_color_acento") or _TALIA_VISUAL_FALLBACK["acento"],
        "color_fondo": organization.get("ia_color_fondo") or _TALIA_VISUAL_FALLBACK["fondo_principal"],
        "estilo": organization.get("ia_estilo_visual") or "neutral_sobrio_talia",
        "logo_url": organization.get("logo_url"),
        "border_radius": organization.get("ia_radio_bordes") or "12px",
        "fallback_talia": _TALIA_VISUAL_FALLBACK,
        "fallback_aplicado": any(
            not organization.get(key)
            for key in ("ia_color_primario", "ia_color_secundario", "ia_color_acento", "ia_color_fondo")
        ),
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
            "estilo_diseno_solicitado": resolved_layout_request if request.canal == "correo" else None,
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
        # Los prompts de esta funcionalidad pertenecen al tenant maestro. La
        # credencial debe resolverse con el mismo mecanismo seguro usado por
        # el resto de las integraciones OpenAI, no únicamente desde .env.
        openai_api_key = await get_openai_api_key(organizacion_id=MASTER_ORGANIZACION_ID)
        openai_project_id = await get_openai_project_id(organizacion_id=MASTER_ORGANIZACION_ID)
        assistant = AssistantConfig(
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            project_id=openai_project_id,
        )
        client = get_openai_client(api_key=openai_api_key, project_id=openai_project_id)
        prompt_variables = {
            "instruccion_usuario": request.instruccion_usuario,
            "idioma": request.idioma,
            "tono": request.tono,
            "variables_seleccionadas": json.dumps(request.variables_seleccionadas, ensure_ascii=False),
            "catalogo_variables": json.dumps([variable_map[key] for key in request.variables_seleccionadas], ensure_ascii=False),
            "contexto_empresa": json.dumps(context, ensure_ascii=False),
            "sistema_diseno_empresa": json.dumps(design, ensure_ascii=False),
            "borrador_actual": request.borrador_actual or "",
            "restricciones_canal": json.dumps({"canal": request.canal, "max_body_chars": 4096}, ensure_ascii=False),
        }
        if request.canal == "correo":
            prompt_variables.update(
                {
                    "estilo_diseno": resolved_layout_request,
                    "layouts_permitidos": json.dumps(
                        [
                            {
                                "codigo": row.get("codigo"),
                                "nombre": row.get("nombre"),
                                "descripcion": row.get("descripcion"),
                                "instrucciones_composicion": row.get("instrucciones_composicion"),
                            }
                            for row in enabled_layouts
                        ],
                        ensure_ascii=False,
                    ),
                }
            )
        response = await asyncio.wait_for(
            client.responses.create(
                prompt={"id": prompt_id, "version": prompt_version, "variables": prompt_variables},
                text={"format": {"type": "json_schema", "name": f"prospeccion_plantilla_{request.canal}", "strict": True, "schema": _schema(request.canal)}},
            ),
            timeout=settings.prospeccion_template_ai_timeout_seconds,
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
            api_key=openai_api_key,
            project_id=openai_project_id,
            request_metadata={"generation_id": str(generation_id), "campana_id": str(request.campana_id) if request.campana_id else None, "selected_variables_count": len(selected)},
        )
        raw_result = json.loads(_extract_response_text(response))
        result = WhatsAppTemplateAiResult.model_validate(raw_result) if request.canal == "whatsapp" else EmailTemplateAiResult.model_validate(raw_result)
        if request.canal == "correo":
            applied_layout = str(result.estilo_diseno).strip().lower()  # type: ignore[union-attr]
            if applied_layout not in enabled_layout_codes:
                raise ValueError("template_ai_layout_not_allowed")
            if requested_layout != "automatico" and applied_layout != requested_layout:
                raise ValueError("template_ai_layout_mismatch")
        else:
            applied_layout = None
        _validate_placeholders(result, selected, request.canal)
        usage = await platform_repo.get_openai_usage_by_response_id(organizacion_id=organizacion_id, response_id=str(response_payload.get("id") or ""))
        update_payload: dict[str, Any] = {
            "resultado_estado": "generada",
            "finalizado_en": datetime.now(timezone.utc).isoformat(),
            "modelo": str(response_payload.get("model") or "unknown"),
            "openai_request_id": response_payload.get("id"),
            "estilo_diseno_aplicado": applied_layout,
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
        is_timeout = isinstance(exc, asyncio.TimeoutError)
        error_code = "template_ai_provider_timeout" if is_timeout else str(exc)[:120]
        await platform_repo.update_prospeccion_template_ai_generation(organizacion_id=organizacion_id, generation_id=generation_id, payload={"resultado_estado": "respuesta_invalida" if isinstance(exc, (ValueError, json.JSONDecodeError)) else "error", "error_codigo": error_code, "finalizado_en": datetime.now(timezone.utc).isoformat()})
        logger.warning("template_ai_generation_failed", extra={"organizacion_id": str(organizacion_id), "generation_id": str(generation_id), "error": error_code, "timeout_seconds": settings.prospeccion_template_ai_timeout_seconds if is_timeout else None})
        raise
