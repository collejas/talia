"""Integraciones con Supabase/Postgres vía REST."""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.phone_utils import normalize_phone
from app.services import tenant_runtime

logger = get_logger(__name__)

DEFAULT_CALENDAR_SETTINGS_SLUG = "default"


class StorageError(RuntimeError):
    """Errores de persistencia para servicios externos."""


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


def _normalize_manual_override(raw: Any) -> bool:
    """Normaliza diferentes formas de representar manual_override."""
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return False
    if isinstance(raw, (int, float)):
        return bool(raw)
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in {"true", "t", "1", "yes", "y"}:
            return True
        if lowered in {"false", "f", "0", "no", "n", ""}:
            return False
        return False
    if isinstance(raw, dict):
        if "manual_override" in raw:
            return _normalize_manual_override(raw.get("manual_override"))
        # Si viene anidado con otra clave, intenta con el primer valor.
        for value in raw.values():
            normalized = _normalize_manual_override(value)
            if normalized:
                return True
        return False
    if isinstance(raw, Iterable):
        for item in raw:
            if _normalize_manual_override(item):
                return True
        return False
    return False


def _contact_has_minimum_info(contact: dict[str, Any]) -> bool:
    """Determina si el contacto ya tiene al menos teléfono o correo."""
    if not contact:
        return False
    phone = str(contact.get("telefono_e164") or "").strip()
    email = str(contact.get("correo") or "").strip()
    return bool(phone or email)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    return " ".join(text.split())


def _normalize_title_fragment(value: Any, *, max_len: int = 96) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    # Prioriza la primera idea concreta para mantener títulos cortos y legibles.
    parts = re.split(r"[.?!;\n]+", text)
    fragment = next((part.strip(" -:\t") for part in parts if part and part.strip()), "")
    if not fragment:
        return None
    lowered = fragment.lower()
    prefixes = (
        "quiero ",
        "quisiera ",
        "necesito ",
        "necesitamos ",
        "me interesa ",
        "nos interesa ",
        "busco ",
        "buscamos ",
        "informacion sobre ",
        "información sobre ",
    )
    for prefix in prefixes:
        if lowered.startswith(prefix):
            fragment = fragment[len(prefix) :].strip()
            break
    if len(fragment) < 4:
        return None
    if len(fragment) > max_len:
        fragment = fragment[: max_len - 1].rstrip() + "…"
    return fragment


def _looks_like_placeholder_name(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered:
        return True
    return lowered in {
        "visitante webchat",
        "visitante whatsapp",
        "visitante",
        "lead webchat",
        "lead whatsapp",
    }


def _build_opportunity_title(
    *,
    contact: dict[str, Any],
    intent: str | None = None,
    summary: str | None = None,
) -> str | None:
    fragment = (
        _normalize_title_fragment(intent)
        or _normalize_title_fragment(summary)
        or _normalize_title_fragment(contact.get("necesidad_proposito"))
        or _normalize_title_fragment(contact.get("notes"))
    )
    if not fragment:
        return None

    contact_name = _clean_text(contact.get("nombre_completo"))
    company_name = _clean_text(contact.get("company_name"))
    suffix = ""
    if contact_name and not _looks_like_placeholder_name(contact_name):
        suffix = contact_name
    elif company_name:
        suffix = company_name

    title = fragment
    if suffix:
        title = f"{fragment} - {suffix}"
    if len(title) > 140:
        title = title[:139].rstrip() + "…"
    return title


def _build_opportunity_description(
    *,
    contact: dict[str, Any],
    intent: str | None = None,
    summary: str | None = None,
) -> str | None:
    description = (
        _normalize_title_fragment(summary, max_len=280)
        or _normalize_title_fragment(intent, max_len=280)
        or _normalize_title_fragment(contact.get("notes"), max_len=280)
        or _normalize_title_fragment(contact.get("necesidad_proposito"), max_len=280)
    )
    return description


def _is_generic_opportunity_title(
    *,
    current_title: str,
    contact: dict[str, Any],
    auto_generated: bool,
) -> bool:
    if auto_generated:
        return True
    normalized = current_title.strip().lower()
    if not normalized:
        return True
    if normalized.startswith("conversación ") or normalized.startswith("conversation "):
        return True
    if _looks_like_placeholder_name(normalized):
        return True
    contact_data = _ensure_dict(contact.get("contacto_datos"))
    profile_name = _clean_text(contact_data.get("profile_name")).lower()
    if profile_name and normalized == profile_name:
        return True
    contact_name = _clean_text(contact.get("nombre_completo")).lower()
    company_name = _clean_text(contact.get("company_name")).lower()
    if contact_name and normalized == contact_name:
        return True
    if company_name and normalized == company_name:
        return True
    return False


_SCORE_VALUE_MAP: dict[str, dict[str, int]] = {
    "financing_type": {
        "contado": 100,
        "mixto": 90,
        "credito": 80,
        "unknown": 40,
        "refused": 20,
    },
    "credit_preapproved": {
        "yes": 100,
        "in_process": 70,
        "no": 30,
        "unknown": 40,
        "refused": 20,
    },
    "down_payment_ready": {
        "yes": 100,
        "partial": 70,
        "no": 30,
        "unknown": 40,
        "refused": 20,
    },
    "purchase_timeline": {
        "<3m": 100,
        "3-6m": 80,
        "6-12m": 60,
        ">12m": 30,
        "unknown": 40,
        "refused": 20,
    },
    "hard_deadline": {
        "yes": 100,
        "no": 50,
        "unknown": 40,
        "refused": 20,
    },
    "requirements_defined": {
        "high": 100,
        "medium": 70,
        "low": 40,
        "unknown": 40,
        "refused": 20,
    },
    "comparison_mode": {
        "shortlist": 100,
        "comparing": 75,
        "exploring": 45,
        "unknown": 40,
        "refused": 20,
    },
    "visited_properties": {
        "yes": 100,
        "no": 50,
        "unknown": 40,
        "refused": 20,
    },
    "decision_authority": {
        "full": 100,
        "shared": 75,
        "advisor": 40,
        "unknown": 40,
        "refused": 20,
    },
    "buyer_type": {
        "individual": 80,
        "couple": 80,
        "family": 80,
        "company": 90,
        "investor": 90,
        "unknown": 40,
        "refused": 20,
    },
    "response_time_bucket": {
        "fast": 100,
        "medium": 70,
        "slow": 40,
    },
}

_CRITICAL_SCORING_FIELDS: tuple[str, ...] = (
    "financing_type",
    "budget_range",
    "purchase_timeline",
    "decision_authority",
)

_FIELD_FACTOR_MAP: dict[str, str] = {
    "financing_type": "capacidad_financiera",
    "credit_preapproved": "capacidad_financiera",
    "budget_range": "capacidad_financiera",
    "down_payment_ready": "capacidad_financiera",
    "purchase_timeline": "urgencia",
    "hard_deadline": "urgencia",
    "requirements_defined": "nivel_decision",
    "comparison_mode": "nivel_decision",
    "visited_properties": "nivel_decision",
    "decision_authority": "autoridad",
    "buyer_type": "autoridad",
}

_SCORING_FIELD_ALIASES: dict[str, dict[str, str]] = {
    "financing_type": {
        "credito": "credito",
        "con credito": "credito",
        "con credito hipotecario": "credito",
        "contado": "contado",
        "cash": "contado",
        "mixto": "mixto",
        "ambas": "mixto",
        "both": "mixto",
    },
    "credit_preapproved": {
        "preapproved": "yes",
        "preaprobado": "yes",
        "preaprobada": "yes",
        "yes": "yes",
        "si": "yes",
        "in_process": "in_process",
        "en proceso": "in_process",
        "proceso": "in_process",
        "none": "no",
        "no": "no",
    },
    "purchase_timeline": {
        "immediate": "<3m",
        "short_term": "3-6m",
        "medium_term": "6-12m",
        "long_term": ">12m",
    },
    "requirements_defined": {
        "clear": "high",
        "high": "high",
        "partial": "medium",
        "medium": "medium",
        "exploring": "low",
        "low": "low",
    },
    "comparison_mode": {
        "active": "shortlist",
        "shortlist": "shortlist",
        "light": "comparing",
        "comparing": "comparing",
        "none": "exploring",
        "exploring": "exploring",
    },
    "decision_authority": {
        "self": "full",
        "full": "full",
        "shared": "shared",
        "advisor": "advisor",
    },
    "buyer_type": {
        "end_user": "individual",
        "individual": "individual",
        "couple": "couple",
        "family": "family",
        "company": "company",
        "investor": "investor",
    },
}


def _as_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "si", "sí"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return None


def _as_ratio(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(number, 1.0))


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_answer_value(field: str, value: Any) -> Any:
    if isinstance(value, str):
        normalized = (
            unicodedata.normalize("NFKD", value.strip())
            .encode("ascii", "ignore")
            .decode("ascii")
            .lower()
        )
    else:
        normalized = value
    if field in _SCORE_VALUE_MAP and isinstance(normalized, str):
        alias_map = _SCORING_FIELD_ALIASES.get(field, {})
        normalized = alias_map.get(normalized, normalized)
    if field in _SCORE_VALUE_MAP and isinstance(normalized, str):
        if normalized in _SCORE_VALUE_MAP[field]:
            return normalized
    if field == "budget_range":
        if isinstance(value, str) and value.strip():
            return value.strip()
        return "unknown"
    return normalized


def _field_score(field: str, value: Any) -> int:
    score_map = _SCORE_VALUE_MAP.get(field)
    if score_map is None:
        return 50
    if isinstance(value, str):
        return score_map.get(value.strip().lower(), 50)
    return 50


def _mean_score(values: list[int], default: int = 40) -> int:
    if not values:
        return default
    return int(round(sum(values) / len(values)))


def _compute_lead_scoring(
    answers: dict[str, Any],
    events: dict[str, Any],
    scoring_settings: tenant_runtime.LeadScoringRuntimeSettings | None = None,
) -> dict[str, Any]:
    runtime_settings = scoring_settings or tenant_runtime.LeadScoringRuntimeSettings.from_defaults()
    finanzas_values = [
        _field_score("financing_type", answers.get("financing_type")),
        _field_score("credit_preapproved", answers.get("credit_preapproved")),
        _field_score("down_payment_ready", answers.get("down_payment_ready")),
    ]
    budget_value = answers.get("budget_range")
    if isinstance(budget_value, str) and budget_value.strip() and budget_value not in {"unknown", "refused"}:
        finanzas_values.append(100)
    else:
        finanzas_values.append(40)
    financiera = _mean_score(finanzas_values)

    urgencia = _mean_score(
        [
            _field_score("purchase_timeline", answers.get("purchase_timeline")),
            _field_score("hard_deadline", answers.get("hard_deadline")),
        ]
    )

    decision = _mean_score(
        [
            _field_score("requirements_defined", answers.get("requirements_defined")),
            _field_score("comparison_mode", answers.get("comparison_mode")),
            _field_score("visited_properties", answers.get("visited_properties")),
        ]
    )

    autoridad = _mean_score(
        [
            _field_score("decision_authority", answers.get("decision_authority")),
            _field_score("buyer_type", answers.get("buyer_type")),
        ]
    )

    interaction_values: list[int] = []
    accepted_questions = _as_bool(events.get("accepted_answering_questions"))
    if accepted_questions is not None:
        interaction_values.append(100 if accepted_questions else 30)
    ratio = _as_ratio(events.get("answered_fields_ratio"))
    if ratio is not None:
        interaction_values.append(int(round(ratio * 100)))
    for event_key, positive_score, negative_score in (
        ("appointment_requested", 80, 30),
        ("appointment_scheduled", 100, 30),
        ("appointment_confirmed", 100, 40),
        ("appointment_attended", 100, 50),
    ):
        event_value = _as_bool(events.get(event_key))
        if event_value is not None:
            interaction_values.append(positive_score if event_value else negative_score)
    evasive_count_raw = events.get("evasive_answers_count")
    try:
        evasive_count = max(0, int(evasive_count_raw))
    except (TypeError, ValueError):
        evasive_count = 0
    interaction_values.append(max(20, 100 - min(evasive_count, 8) * 10))
    interaction_values.append(_field_score("response_time_bucket", events.get("response_time_bucket")))
    interaccion = _mean_score(interaction_values)

    score_total = round(
        financiera * (runtime_settings.capacidad_financiera_weight / 100.0)
        + urgencia * (runtime_settings.urgencia_weight / 100.0)
        + decision * (runtime_settings.nivel_decision_weight / 100.0)
        + autoridad * (runtime_settings.autoridad_weight / 100.0)
        + interaccion * (runtime_settings.interaccion_compromiso_weight / 100.0),
        2,
    )
    if score_total <= runtime_settings.explorando_max:
        grade = "explorando"
    elif score_total <= runtime_settings.interesado_max:
        grade = "interesado"
    else:
        grade = "listo"

    missing_fields: list[str] = []
    refused_fields: list[str] = []
    for field in _CRITICAL_SCORING_FIELDS:
        value = answers.get(field)
        if value in (None, "", "unknown"):
            missing_fields.append(field)
        if value == "refused":
            refused_fields.append(field)

    completed_critical = len([field for field in _CRITICAL_SCORING_FIELDS if field not in missing_fields])
    completion_ratio = completed_critical / max(1, len(_CRITICAL_SCORING_FIELDS))
    if completion_ratio >= runtime_settings.confidence_high_min:
        confidence = "high"
    elif completion_ratio >= runtime_settings.confidence_medium_min:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "score_total": score_total,
        "grade": grade,
        "confidence": confidence,
        "factors": {
            "capacidad_financiera": financiera,
            "urgencia": urgencia,
            "nivel_decision": decision,
            "autoridad": autoridad,
            "interaccion_compromiso": interaccion,
        },
        "missing_fields": missing_fields,
        "refused_fields": refused_fields,
    }


def _evaluate_interaction_score_from_events(events: dict[str, Any]) -> int:
    interaction_values: list[int] = []
    accepted_questions = _as_bool(events.get("accepted_answering_questions"))
    if accepted_questions is not None:
        interaction_values.append(100 if accepted_questions else 30)
    ratio = _as_ratio(events.get("answered_fields_ratio"))
    if ratio is not None:
        interaction_values.append(int(round(ratio * 100)))
    for event_key, positive_score, negative_score in (
        ("appointment_requested", 80, 30),
        ("appointment_scheduled", 100, 30),
        ("appointment_confirmed", 100, 40),
        ("appointment_attended", 100, 50),
    ):
        event_value = _as_bool(events.get(event_key))
        if event_value is not None:
            interaction_values.append(positive_score if event_value else negative_score)
    evasive_count_raw = events.get("evasive_answers_count")
    try:
        evasive_count = max(0, int(evasive_count_raw))
    except (TypeError, ValueError):
        evasive_count = 0
    interaction_values.append(max(20, 100 - min(evasive_count, 8) * 10))
    interaction_values.append(_field_score("response_time_bucket", events.get("response_time_bucket")))
    return _mean_score(interaction_values)


def _coerce_profile_weights(
    profile: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> dict[str, float]:
    weights_raw = _ensure_dict(profile.get("weights"))
    candidates = {
        "capacidad_financiera": _as_float(
            weights_raw.get("capacidad_financiera_weight")
            if "capacidad_financiera_weight" in weights_raw
            else weights_raw.get("capacidad_financiera")
        ),
        "urgencia": _as_float(
            weights_raw.get("urgencia_weight")
            if "urgencia_weight" in weights_raw
            else weights_raw.get("urgencia")
        ),
        "nivel_decision": _as_float(
            weights_raw.get("nivel_decision_weight")
            if "nivel_decision_weight" in weights_raw
            else weights_raw.get("nivel_decision")
        ),
        "autoridad": _as_float(
            weights_raw.get("autoridad_weight")
            if "autoridad_weight" in weights_raw
            else weights_raw.get("autoridad")
        ),
        "interaccion_compromiso": _as_float(
            weights_raw.get("interaccion_compromiso_weight")
            if "interaccion_compromiso_weight" in weights_raw
            else weights_raw.get("interaccion_compromiso")
        ),
    }
    if all(value is not None for value in candidates.values()):
        total = round(sum(float(value) for value in candidates.values()), 4)
        if abs(total - 100.0) < 0.0001:
            return {key: float(value) for key, value in candidates.items() if value is not None}
    return {
        "capacidad_financiera": runtime_settings.capacidad_financiera_weight,
        "urgencia": runtime_settings.urgencia_weight,
        "nivel_decision": runtime_settings.nivel_decision_weight,
        "autoridad": runtime_settings.autoridad_weight,
        "interaccion_compromiso": runtime_settings.interaccion_compromiso_weight,
    }


def _coerce_profile_thresholds(
    profile: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> tuple[float, float, float]:
    thresholds = _ensure_dict(profile.get("thresholds"))
    explorando = _as_float(thresholds.get("explorando_max"))
    interesado = _as_float(thresholds.get("interesado_max"))
    listo = _as_float(thresholds.get("listo_min"))
    if (
        explorando is not None
        and interesado is not None
        and listo is not None
        and 0.0 <= explorando <= interesado <= 100.0
        and 0.0 <= listo <= 100.0
        and listo >= interesado
    ):
        return explorando, interesado, listo
    return (
        runtime_settings.explorando_max,
        runtime_settings.interesado_max,
        runtime_settings.listo_min,
    )


def _coerce_profile_confidence_thresholds(
    profile: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> tuple[float, float]:
    confidence = _ensure_dict(profile.get("confidence_thresholds"))
    high = _as_ratio(confidence.get("high_min"))
    medium = _as_ratio(confidence.get("medium_min"))
    if high is not None and medium is not None and 0.0 <= medium <= high <= 1.0:
        return high, medium
    return runtime_settings.confidence_high_min, runtime_settings.confidence_medium_min


def _rule_matches_answer(rule: dict[str, Any], value: Any) -> bool:
    rule_type = str(rule.get("rule_type") or "equals").strip().lower()
    match_value = rule.get("match_value")

    if rule_type == "any":
        return True
    if value is None:
        return False

    if rule_type == "range":
        numeric = _as_float(value)
        if numeric is None:
            return False
        min_value = _as_float(rule.get("min_value"))
        max_value = _as_float(rule.get("max_value"))
        if min_value is not None and numeric < min_value:
            return False
        if max_value is not None and numeric > max_value:
            return False
        return True

    value_text = str(value).strip().lower()
    if not value_text:
        return False
    match_text = str(match_value or "").strip().lower()
    if rule_type == "contains":
        return bool(match_text) and match_text in value_text
    if rule_type == "in_set":
        options = {item.strip().lower() for item in match_text.split(",") if item.strip()}
        return value_text in options
    return bool(match_text) and value_text == match_text


def _score_answer_from_rules(
    *,
    field_key: str,
    answer_value: Any,
    question: dict[str, Any],
    rules: list[dict[str, Any]],
) -> int:
    for rule in rules:
        if _rule_matches_answer(rule, answer_value):
            score = rule.get("score")
            try:
                return max(0, min(int(score), 100))
            except (TypeError, ValueError):
                continue
    metadata = _ensure_dict(question.get("metadata"))
    if isinstance(answer_value, str):
        normalized = answer_value.strip().lower()
        if normalized in {"unknown", "refused"}:
            key = "unknown_score" if normalized == "unknown" else "refused_score"
            fallback = _as_float(metadata.get(key))
            if fallback is not None:
                return max(0, min(int(round(fallback)), 100))
    if answer_value in (None, ""):
        missing_score = _as_float(metadata.get("missing_score"))
        if missing_score is not None:
            return max(0, min(int(round(missing_score)), 100))
    return _field_score(field_key, answer_value)


async def _compute_lead_scoring_from_catalog(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    channel: Literal["whatsapp", "webchat"],
    answers: dict[str, Any],
    events: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> dict[str, Any] | None:
    profiles = await repo.list_scoring_profiles(
        organizacion_id=organizacion_id,
        canal=channel,
        only_active=True,
    )
    questions = await repo.list_scoring_questions(
        organizacion_id=organizacion_id,
        canal=channel,
        include_inactive=False,
    )
    rules = await repo.list_scoring_rules(
        organizacion_id=organizacion_id,
        canal=channel,
        include_inactive=False,
    )
    if not questions or not rules:
        return None

    profile = profiles[0] if profiles else {}
    question_rules: dict[str, list[dict[str, Any]]] = {}
    for row in rules:
        question_id = str(row.get("question_id") or "").strip()
        if not question_id:
            continue
        question_rules.setdefault(question_id, []).append(row)
    for bucket in question_rules.values():
        bucket.sort(
            key=lambda item: (
                int(item.get("priority") or 100),
                str(item.get("id") or ""),
            )
        )

    factor_scores: dict[str, list[int]] = {
        "capacidad_financiera": [],
        "urgencia": [],
        "nivel_decision": [],
        "autoridad": [],
        "interaccion_compromiso": [],
    }
    for question in questions:
        field_key = str(question.get("field_key") or "").strip()
        question_id = str(question.get("id") or "").strip()
        if not field_key or not question_id:
            continue
        metadata = _ensure_dict(question.get("metadata"))
        factor_name = str(metadata.get("factor") or _FIELD_FACTOR_MAP.get(field_key) or "").strip()
        if factor_name not in factor_scores:
            continue
        answer_value = answers.get(field_key)
        score_value = _score_answer_from_rules(
            field_key=field_key,
            answer_value=answer_value,
            question=question,
            rules=question_rules.get(question_id, []),
        )
        factor_scores[factor_name].append(score_value)

    factor_values = {
        "capacidad_financiera": _mean_score(factor_scores["capacidad_financiera"]),
        "urgencia": _mean_score(factor_scores["urgencia"]),
        "nivel_decision": _mean_score(factor_scores["nivel_decision"]),
        "autoridad": _mean_score(factor_scores["autoridad"]),
        "interaccion_compromiso": _mean_score(factor_scores["interaccion_compromiso"]),
    }
    event_interaction = _evaluate_interaction_score_from_events(events)
    factor_values["interaccion_compromiso"] = int(
        round((factor_values["interaccion_compromiso"] + event_interaction) / 2)
    )

    weights = _coerce_profile_weights(profile, runtime_settings)
    score_total = round(
        factor_values["capacidad_financiera"] * (weights["capacidad_financiera"] / 100.0)
        + factor_values["urgencia"] * (weights["urgencia"] / 100.0)
        + factor_values["nivel_decision"] * (weights["nivel_decision"] / 100.0)
        + factor_values["autoridad"] * (weights["autoridad"] / 100.0)
        + factor_values["interaccion_compromiso"] * (weights["interaccion_compromiso"] / 100.0),
        2,
    )

    explorando_max, interesado_max, _ = _coerce_profile_thresholds(profile, runtime_settings)
    if score_total <= explorando_max:
        grade = "explorando"
    elif score_total <= interesado_max:
        grade = "interesado"
    else:
        grade = "listo"

    missing_fields: list[str] = []
    refused_fields: list[str] = []
    for field in _CRITICAL_SCORING_FIELDS:
        value = answers.get(field)
        if value in (None, "", "unknown"):
            missing_fields.append(field)
        if value == "refused":
            refused_fields.append(field)
    completed_critical = len([field for field in _CRITICAL_SCORING_FIELDS if field not in missing_fields])
    completion_ratio = completed_critical / max(1, len(_CRITICAL_SCORING_FIELDS))
    high_min, medium_min = _coerce_profile_confidence_thresholds(profile, runtime_settings)
    if completion_ratio >= high_min:
        confidence = "high"
    elif completion_ratio >= medium_min:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "score_total": score_total,
        "grade": grade,
        "confidence": confidence,
        "factors": factor_values,
        "missing_fields": missing_fields,
        "refused_fields": refused_fields,
        "scoring_config_source": "catalog_db",
    }


async def register_webchat_message(
    *,
    session_id: str,
    author: str,
    content: str,
    response_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
    organizacion_id: str | None = None,
) -> dict[str, str | None]:
    """Invoca la RPC `registrar_mensaje_webchat` a través del repositorio CRM."""
    repo = CRMRepository()
    try:
        result = await repo.register_webchat_message(
            session_id=session_id,
            author=author,
            content=content,
            response_id=response_id,
            metadata=metadata or {},
            inactivity_hours=inactivity_hours,
            attachments=attachments or [],
            organizacion_id=organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    conversation_id = result.get("conversation_id")
    if conversation_id:
        try:
            await repo.update_conversation(
                conversation_id=conversation_id, patch={"canal": "webchat"}
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.webchat_channel_patch_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
    return result


async def register_whatsapp_message(
    *,
    direction: Literal["entrante", "saliente"],
    wa_id: str | None,
    phone_e164: str | None,
    body: str | None,
    message_sid: str | None,
    profile_name: str | None = None,
    conversation_id: str | None = None,
    contact_id: str | None = None,
    response_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    inactivity_minutes: int | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
    webhook_payload: dict[str, Any] | None = None,
    organizacion_id: str | None = None,
) -> dict[str, Any]:
    """Invoca registrar_mensaje_whatsapp para almacenar interacciones del canal y ligar el webhook."""
    repo = CRMRepository()
    metadata_payload = dict(metadata or {})
    if organizacion_id and "resolved_organizacion_id" not in metadata_payload:
        metadata_payload["resolved_organizacion_id"] = organizacion_id
    resolved_contact_id = contact_id
    resolved_conversation_id = conversation_id

    # Reusar conversación activa del mismo contacto para evitar abrir hilos
    # separados cuando no hay una oportunidad nueva.
    if not resolved_conversation_id:
        org_uuid: UUID | None = None
        if organizacion_id:
            try:
                org_uuid = UUID(str(organizacion_id))
            except (TypeError, ValueError):
                org_uuid = None

        contact_row: dict[str, Any] | None = None
        if resolved_contact_id:
            contact_row = await repo.get_contact_by_id(contact_id=resolved_contact_id)
        else:
            if wa_id:
                contact_row = await repo.get_contact_by_whatsapp_id(
                    wa_id=wa_id,
                    organizacion_id=org_uuid,
                )
            if not contact_row and phone_e164:
                contact_row = await repo.get_contact_by_phone_e164(
                    phone_e164=phone_e164,
                    organizacion_id=org_uuid,
                )

        if contact_row:
            contact_id_value = contact_row.get("id")
            if contact_id_value:
                resolved_contact_id = str(contact_id_value)
                latest_conversation = await repo.get_latest_whatsapp_conversation(
                    contact_id=resolved_contact_id
                )
                if latest_conversation and latest_conversation.get("id"):
                    resolved_conversation_id = str(latest_conversation.get("id"))

    # Si ya resolvimos una conversación activa, no apliques timeout corto de inactividad:
    # la RPC corta hilos entrantes cuando excede p_inactivity_minutes.
    effective_inactivity_minutes = (
        None
        if resolved_conversation_id
        else (
            inactivity_minutes
            if inactivity_minutes is not None
            else (inactivity_hours * 60 if inactivity_hours is not None else None)
        )
    )

    try:
        result = await repo.register_whatsapp_message(
            direction=direction,
            wa_id=wa_id,
            phone_e164=phone_e164,
            body=body,
            message_sid=message_sid,
            profile_name=profile_name,
            conversation_id=resolved_conversation_id,
            contact_id=resolved_contact_id,
            response_id=response_id,
            metadata=metadata_payload,
            inactivity_minutes=effective_inactivity_minutes,
            attachments=attachments,
            webhook_payload=webhook_payload,
            organizacion_id=organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    conversation_id = result.get("conversation_id")
    if conversation_id:
        try:
            await repo.update_conversation(
                conversation_id=conversation_id, patch={"canal": "whatsapp"}
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.whatsapp_channel_patch_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
    return result


async def register_messenger_message(
    *,
    sender_id: str,
    recipient_id: str | None = None,
    message_id: str | None = None,
    text: str | None = None,
    direction: Literal["entrante", "saliente"] = "entrante",
    metadata: dict[str, Any] | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
    response_id: str | None = None,
    organizacion_id: str | None = None,
) -> dict[str, Any]:
    """Registra un mensaje inbound del canal Messenger y marca la conversación."""

    repo = CRMRepository()
    metadata_payload = dict(metadata or {})
    if organizacion_id and "resolved_organizacion_id" not in metadata_payload:
        metadata_payload["resolved_organizacion_id"] = organizacion_id
    try:
        result = await repo.register_messenger_message(
            sender_id=sender_id,
            recipient_id=recipient_id,
            message_id=message_id,
            content=text,
            direction=direction,
            metadata=metadata_payload,
            inactivity_hours=inactivity_hours,
            attachments=attachments or [],
            response_id=response_id,
            organizacion_id=organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    conversation_id = result.get("conversation_id")
    if conversation_id:
        try:
            await repo.update_conversation(
                conversation_id=conversation_id, patch={"canal": "messenger"}
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.messenger_channel_patch_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
    return result


async def fetch_message_by_twilio_sid(message_sid: str | None) -> dict[str, Any] | None:
    """Recupera un mensaje existente usando el SID de Twilio."""
    if not message_sid:
        return None
    repo = CRMRepository()
    try:
        return await repo.get_message_by_twilio_sid(message_sid=message_sid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_conversation(conversation_id: str) -> dict[str, Any]:
    """Recupera metadatos de una conversación incluyendo control manual."""
    repo = CRMRepository()
    try:
        row = await repo.get_conversation_with_controls(conversation_id=conversation_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    ctrl = row.get("conversaciones_controles")
    manual_override = _normalize_manual_override(ctrl)
    return {
        "id": row.get("id"),
        "contact_id": row.get("contacto_id"),
        "channel": row.get("canal"),
        "openai_conversation_id": row.get("conversacion_openai_id"),
        "last_response_id": row.get("last_response_id"),
        "manual_override": manual_override,
    }


async def fetch_webchat_conversation(conversation_id: str) -> dict[str, Any]:
    """Alias mantenido por compatibilidad para el canal webchat."""
    return await fetch_conversation(conversation_id)


async def get_webchat_contact_id(session_id: str) -> str | None:
    """Devuelve el contacto asociado a un session_id para el canal webchat."""
    repo = CRMRepository()
    try:
        return await repo.get_webchat_contact_id_by_session(session_id=session_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_webchat_session_id(contact_id: str) -> str | None:
    """Obtiene el session_id asociado al contacto para el canal webchat."""
    repo = CRMRepository()
    try:
        return await repo.get_webchat_session_by_contact(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def resolve_webchat_conversation_from_session(
    session_id: str,
) -> dict[str, Any] | None:
    """Obtiene la última conversación webchat asociada a un session_id."""
    contact_id = await get_webchat_contact_id(session_id)
    if not contact_id:
        return None

    repo = CRMRepository()
    try:
        row = await repo.get_latest_webchat_conversation(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        return None
    ctrl = row.get("conversaciones_controles")
    manual_override = _normalize_manual_override(ctrl)
    return {
        "id": row.get("id"),
        "contact_id": row.get("contacto_id"),
        "channel": row.get("canal"),
        "openai_conversation_id": row.get("conversacion_openai_id"),
        "last_response_id": row.get("last_response_id"),
        "manual_override": manual_override,
    }


async def record_webchat_session_closure(session_id: str) -> None:
    """Persiste el cierre explícito de una sesión webchat."""
    repo = CRMRepository()
    try:
        await repo.record_webchat_session_closure(session_id=session_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def record_webchat_visit(
    session_id: str,
    *,
    ip: str | None = None,
    device_type: str | None = None,
    geo: dict[str, Any] | None = None,
    cve_ent: str | None = None,
    nom_ent: str | None = None,
    cve_mun: str | None = None,
    nom_mun: str | None = None,
    cvegeo: str | None = None,
    referrer: str | None = None,
    landing_url: str | None = None,
    organizacion_id: str | None = None,
) -> None:
    """Actualiza/crea el registro del visitante con metadata adicional."""
    repo = CRMRepository()

    payload: dict[str, Any] = {}
    if ip:
        payload["p_ip"] = ip
    if device_type:
        payload["p_device_type"] = device_type
    if geo:
        payload["p_geo"] = geo
    if cve_ent:
        payload["p_cve_ent"] = cve_ent
    if nom_ent:
        payload["p_nom_ent"] = nom_ent
    if cve_mun:
        payload["p_cve_mun"] = cve_mun
    if nom_mun:
        payload["p_nom_mun"] = nom_mun
    if cvegeo:
        payload["p_cvegeo"] = cvegeo
    if referrer:
        payload["p_referrer"] = referrer
    if landing_url:
        payload["p_landing_url"] = landing_url
    if organizacion_id:
        payload["p_organizacion_id"] = organizacion_id

    try:
        await repo.record_webchat_visit(session_id=session_id, payload=payload)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def update_conversation(conversation_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Actualiza campos de una conversación."""
    repo = CRMRepository()
    try:
        return await repo.update_conversation(conversation_id=conversation_id, patch=patch)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upsert_conversation_insights(
    *,
    conversation_id: str,
    resumen: str | None = None,
    intencion: str | None = None,
    siguiente_accion: str | None = None,
    lead_score: int | None = None,
) -> None:
    """Actualiza o inserta insights de conversación."""
    repo = CRMRepository()
    try:
        await repo.upsert_conversation_insights(
            conversation_id=conversation_id,
            resumen=resumen,
            intencion=intencion,
            siguiente_accion=siguiente_accion,
            lead_score=lead_score,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def get_manual_override(conversation_id: str) -> bool:
    """Indica si la conversación está en modo manual (sin asistente)."""
    repo = CRMRepository()
    try:
        return await repo.get_manual_override(conversation_id=conversation_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_manual_overrides(conversation_ids: list[str]) -> dict[str, bool]:
    """Obtiene flags manual_override para un conjunto de conversaciones."""
    repo = CRMRepository()
    try:
        return await repo.fetch_manual_overrides(conversation_ids=conversation_ids)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def set_manual_override(conversation_id: str, manual: bool) -> None:
    """Activa o desactiva el modo manual para una conversación."""
    repo = CRMRepository()
    try:
        await repo.set_manual_override(conversation_id=conversation_id, manual=manual)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_recent_messages(*, conversation_id: str, limit: int = 8) -> list[dict[str, Any]]:
    """Obtiene los últimos mensajes de una conversación para construir historial.

    Retorna elementos con claves: direccion (entrante/saliente), texto, creado_en, datos.
    """
    repo = CRMRepository()
    try:
        return await repo.fetch_recent_messages(conversation_id=conversation_id, limit=limit)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def create_conversation_summary(
    *,
    conversation_id: str,
    resumen: str,
    contacto_id: str | None = None,
    organizacion_id: str | None = None,
    tipo: str | None = None,
    metadatos: dict[str, Any] | None = None,
    creado_por_usuario_id: str | None = None,
) -> dict[str, Any]:
    """Inserta un resumen de conversación generado por el asistente."""
    repo = CRMRepository()
    try:
        return await repo.create_conversation_summary(
            conversacion_id=conversation_id,
            resumen=resumen,
            contacto_id=contacto_id,
            organizacion_id=organizacion_id,
            tipo=tipo,
            metadatos=metadatos,
            creado_por_usuario_id=creado_por_usuario_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_latest_conversation_summary(
    *, conversation_id: str, tipo: str | None = None
) -> dict[str, Any] | None:
    """Recupera el resumen más reciente para una conversación."""
    repo = CRMRepository()
    try:
        return await repo.fetch_latest_conversation_summary(
            conversation_id=conversation_id,
            tipo=tipo,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upload_webchat_attachment(
    *,
    file: UploadFile,
    session_id: str | None,
    conversation_id: str | None,
) -> dict[str, Any]:
    """Sube un adjunto al bucket `webchat` y devuelve metadatos normalizados."""

    content = await file.read()
    if not content:
        raise StorageError("El archivo a subir está vacío")

    original_name = file.filename or "adjunto"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix
    prefix = conversation_id or session_id or "general"
    key = f"{prefix}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_webchat_object(
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/") if settings.supabase_url else ""
    public_url = f"{base_url}/storage/v1/object/public/{public_path}" if base_url else public_path

    return {
        "url": public_url,
        "name": safe_name,
        "mime": file.content_type,
        "size": len(content),
        "provider_id": public_path,
        "path": public_path,
    }


async def upload_quote_document(
    *,
    content: bytes,
    filename: str,
    lead_id: str,
    content_type: str = "application/pdf",
) -> dict[str, str]:
    """Sube el PDF de una cotización al bucket `quotes`."""

    safe_name = Path(filename).name or "cotizacion.pdf"
    key = f"{lead_id}/{uuid4().hex}-{safe_name}"
    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="quotes",
            object_key=key,
            content=content,
            content_type=content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    try:
        signed_url = await repo.create_signed_storage_url(
            bucket="quotes",
            object_path=public_path,
            expires_in=3600,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return {
        "url": signed_url,
        "path": public_path,
        "bucket": "quotes",
        "name": safe_name,
    }


async def generate_quote_signed_url(*, path: str, expires_in: int = 300) -> str:
    """Genera un enlace firmado temporal para una cotización almacenada."""

    normalized = path.strip().lstrip("/")
    if not normalized:
        raise StorageError("quote_path_required")

    bucket, _, key = normalized.partition("/")
    if not bucket or not key:
        raise StorageError("quote_path_invalid")

    repo = CRMRepository()
    try:
        return await repo.create_signed_storage_url(
            bucket=bucket,
            object_path=f"{bucket}/{key}",
            expires_in=expires_in,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upload_logo_asset(*, file: UploadFile, folder: str = "general") -> dict[str, str]:
    """Sube un logo general al bucket `logos` y devuelve metadatos básicos."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de logo está vacío")

    original_name = file.filename or "logo.png"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix or ".png"
    key = f"{folder}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="logos",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    public_url = f"{base_url}/storage/v1/object/public/{public_path}"

    return {
        "url": public_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type or "application/octet-stream",
    }


async def upload_media_asset(
    *,
    file: UploadFile,
    folder: str = "general",
) -> dict[str, str]:
    """Sube una imagen de catálogo al bucket `recursos` y devuelve metadatos básicos."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de recursos está vacío")

    original_name = file.filename or "recurso"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix or ".png"
    key = f"{folder}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="recursos",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    public_url = f"{base_url}/storage/v1/object/public/{public_path}"

    return {
        "url": public_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type or "application/octet-stream",
    }


async def upload_cliente_document(
    *, file: UploadFile, cliente_id: str, document_type: str
) -> dict[str, Any]:
    """Sube un documento de cliente al bucket `clientes`."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de cliente está vacío")

    original_name = file.filename or "documento"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix
    key = f"{cliente_id}/{document_type}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="clientes",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    storage_url = f"{base_url}/storage/v1/object/{public_path}"

    return {
        "url": storage_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type,
        "size": len(content),
    }


async def fetch_contact(contact_id: str) -> dict[str, Any]:
    """Obtiene la representación del contacto indicado."""
    repo = CRMRepository()
    try:
        row = await repo.get_contact_by_id(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        raise StorageError("Contacto no encontrado")
    datos = row.get("contacto_datos")
    if isinstance(datos, str):
        try:
            row["contacto_datos"] = json.loads(datos)
        except json.JSONDecodeError:
            row["contacto_datos"] = {}
    elif datos is None:
        row["contacto_datos"] = {}
    return row


async def fetch_contact_context(*, conversation_id: str, contact_id: str) -> dict[str, Any]:
    """Obtiene el contacto y la oportunidad más relevante asociada."""
    repo = CRMRepository()
    try:
        contact = await repo.get_contact_by_id(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not contact:
        return {"contact": None, "opportunity": None}

    try:
        contact_uuid = UUID(str(contact.get("id") or contact_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("contacto_id_invalido") from exc

    try:
        opportunity = await repo.get_contact_opportunity(
            contact_id=contact_uuid,
            conversation_id=conversation_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return {"contact": contact, "opportunity": opportunity}


async def fetch_contact_identities(contact_id: str) -> list[dict[str, Any]]:
    """Recupera identidades de canal asociadas al contacto."""
    repo = CRMRepository()
    try:
        return await repo.list_contact_identities(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def record_delivery_event(
    *,
    provider: str,
    message_sid: str,
    event: str,
    raw_payload: dict[str, Any] | None = None,
    error_code: str | None = None,
    provider_timestamp: str | None = None,
) -> None:
    """Inserta un registro en eventos_entrega vinculado a un mensaje."""
    repo = CRMRepository()
    try:
        await repo.record_delivery_event(
            provider=provider,
            message_sid=message_sid,
            event=event,
            raw_payload=raw_payload,
            error_code=error_code,
            provider_timestamp=provider_timestamp,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_calendar_settings(slug: str = DEFAULT_CALENDAR_SETTINGS_SLUG) -> dict[str, Any]:
    """Obtiene la configuración de recordatorios del calendario (activación y offset)."""
    repo = CRMRepository()
    try:
        record = await repo.get_calendar_settings(slug=slug)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if record is None:
        record = {}
    return {
        "reminder_enabled": bool(record.get("reminder_enabled", True)),
        "reminder_offset_minutes": int(record.get("reminder_offset_minutes") or 120),
        "updated_at": record.get("updated_at"),
    }


async def update_calendar_booking_metadata(
    *,
    booking_id: str,
    metadata_patch: dict[str, Any],
    current_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fusiona y persiste metadata asociada a una reserva del calendario."""
    if not metadata_patch:
        return current_metadata or {}
    merged: dict[str, Any] = {}
    if current_metadata:
        merged.update(current_metadata)
    merged.update(metadata_patch)

    repo = CRMRepository()
    try:
        await repo.update_calendar_booking_metadata(booking_id=booking_id, metadata=merged)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return merged


async def fetch_email_template(slug: str = "default") -> dict[str, Any] | None:
    """Recupera el template de correo configurado para envíos manuales."""
    repo = CRMRepository()
    try:
        row = await repo.get_email_template(slug=slug)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        return None

    intro = row.get("intro")
    intro_text = intro.strip() if isinstance(intro, str) else ""

    closing = row.get("closing")
    closing_text = closing.strip() if isinstance(closing, str) else ""

    highlights_raw = row.get("highlights")
    if isinstance(highlights_raw, str):
        try:
            highlights_raw = json.loads(highlights_raw)
        except json.JSONDecodeError:
            highlights_raw = []
    if not isinstance(highlights_raw, list):
        highlights_raw = []
    highlights = [
        str(item).strip()
        for item in highlights_raw
        if isinstance(item, (str, int, float)) and str(item).strip()
    ]

    resources_raw = row.get("resources")
    if isinstance(resources_raw, str):
        try:
            resources_raw = json.loads(resources_raw)
        except json.JSONDecodeError:
            resources_raw = []
    if not isinstance(resources_raw, list):
        resources_raw = []
    resources: list[dict[str, str]] = []
    for entry in resources_raw:
        if not isinstance(entry, dict):
            continue
        label = str(entry.get("label") or "").strip()
        url = str(entry.get("url") or "").strip()
        if not label or not url:
            continue
        resources.append({"label": label, "url": url})

    use_summary = row.get("use_summary")
    use_highlights = row.get("use_highlights")
    use_resources = row.get("use_resources")

    signature_salutation = row.get("signature_salutation")
    signature_text = row.get("signature")

    return {
        "intro": intro_text,
        "highlights": highlights,
        "resources": resources,
        "closing": closing_text,
        "use_summary": (bool(use_summary) if isinstance(use_summary, bool) else use_summary),
        "use_highlights": (
            bool(use_highlights) if isinstance(use_highlights, bool) else use_highlights
        ),
        "use_resources": (
            bool(use_resources) if isinstance(use_resources, bool) else use_resources
        ),
        "signature_salutation": (
            signature_salutation.strip()
            if isinstance(signature_salutation, str)
            else signature_salutation
        ),
        "signature": (
            signature_text.strip() if isinstance(signature_text, str) else signature_text
        ),
        "updated_at": row.get("updated_at"),
    }


async def update_contact(contact_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Actualiza campos del contacto indicado y devuelve la fila resultante."""
    if not patch:
        raise StorageError("No se proporcionaron datos para actualizar el contacto")
    phone_value = patch.get("telefono_e164")
    if phone_value is not None:
        patch["telefono_e164"] = normalize_phone(phone_value)
    repo = CRMRepository()
    try:
        row = await repo.update_contact_by_id(contact_id=contact_id, patch=patch)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    datos = row.get("contacto_datos")
    if isinstance(datos, str):
        try:
            row["contacto_datos"] = json.loads(datos)
        except json.JSONDecodeError:
            row["contacto_datos"] = {}
    elif datos is None:
        row["contacto_datos"] = {}
    return row


async def fetch_visitantes_estados(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes sin chat agregados por estado."""
    repo = CRMRepository()
    try:
        return await repo.visitas_estados(date_from=date_from, date_to=date_to)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_visitantes_municipios(
    state_code: str,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes sin chat agregados por municipio."""
    repo = CRMRepository()
    try:
        return await repo.visitas_municipios(
            state_code=state_code,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_visitantes_paises(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes agrupados por país."""
    repo = CRMRepository()
    try:
        return await repo.visitas_paises(date_from=date_from, date_to=date_to)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_webchat_visitas_detalle(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    has_chat: bool | None = None,
    session: str | None = None,
    ip: str | None = None,
    state: str | None = None,
    country: str | None = None,
    city: str | None = None,
    search: str | None = None,
    visit_min: int | None = None,
    visit_max: int | None = None,
    first_from: datetime | None = None,
    first_to: datetime | None = None,
    last_from: datetime | None = None,
    last_to: datetime | None = None,
    stay_min: float | None = None,
    stay_max: float | None = None,
    avg_stay_min: float | None = None,
    avg_stay_max: float | None = None,
    contact_status: str | None = None,
    device_types: list[str] | None = None,
    referrer: str | None = None,
    landing: str | None = None,
    order_by: str | None = None,
    order_dir: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Consulta visitas (con y sin chat) del webchat para el panel."""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    country_value = country.strip() if isinstance(country, str) else country
    if isinstance(country_value, str) and not country_value:
        country_value = None
    city_value = city.strip() if isinstance(city, str) else city
    if isinstance(city_value, str) and not city_value:
        city_value = None

    payload: dict[str, Any] = {
        "p_limit": limit,
        "p_offset": offset,
        "p_country": country_value,
        "p_city": city_value,
    }
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()
    if has_chat is not None:
        payload["p_has_chat"] = has_chat
    if state:
        payload["p_state"] = state
    if search:
        payload["p_search"] = search
    if session:
        payload["p_session"] = session
    if ip:
        payload["p_ip"] = ip
    if visit_min is not None:
        payload["p_visit_min"] = visit_min
    if visit_max is not None:
        payload["p_visit_max"] = visit_max
    if first_from:
        payload["p_first_from"] = first_from.isoformat()
    if first_to:
        payload["p_first_to"] = first_to.isoformat()
    if last_from:
        payload["p_last_from"] = last_from.isoformat()
    if last_to:
        payload["p_last_to"] = last_to.isoformat()
    if stay_min is not None:
        payload["p_stay_min"] = stay_min
    if stay_max is not None:
        payload["p_stay_max"] = stay_max
    if avg_stay_min is not None:
        payload["p_avg_stay_min"] = avg_stay_min
    if avg_stay_max is not None:
        payload["p_avg_stay_max"] = avg_stay_max
    if contact_status:
        payload["p_contact_status"] = contact_status
    if device_types:
        payload["p_device_types"] = device_types
    if referrer:
        payload["p_referrer"] = referrer
    if landing:
        payload["p_landing"] = landing
    if order_by:
        payload["p_order_by"] = order_by
    if order_dir:
        payload["p_order_dir"] = order_dir

    repo = CRMRepository()
    try:
        data = await repo.visitas_detalle_custom(payload=payload)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    total = 0
    total_chat = 0
    total_no_chat = 0
    cleaned: list[dict[str, Any]] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        if total == 0:
            try:
                total = int(row.get("total_rows") or 0)
            except (TypeError, ValueError):
                total = 0
        if total_chat == 0:
            try:
                total_chat = int(row.get("total_chat_rows") or 0)
            except (TypeError, ValueError):
                total_chat = 0
        if total_no_chat == 0:
            try:
                total_no_chat = int(row.get("total_no_chat_rows") or 0)
            except (TypeError, ValueError):
                total_no_chat = 0
        row.pop("total_rows", None)
        row.pop("total_chat_rows", None)
        row.pop("total_no_chat_rows", None)
        cleaned.append(row)

    return {
        "items": cleaned,
        "total": total,
        "total_chat": total_chat,
        "total_no_chat": total_no_chat,
        "limit": limit,
        "offset": offset,
    }


async def fetch_leads_states(
    *,
    channels: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de leads agrupados por estado."""
    repo = CRMRepository()
    try:
        return await repo.leads_estados(
            channels=channels,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_leads_municipios(
    state_code: str,
    *,
    channels: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de leads agrupados por municipio."""
    repo = CRMRepository()
    try:
        return await repo.leads_municipios(
            state_code=state_code,
            channels=channels,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def ensure_conversation_opportunity(
    *,
    conversation_id: str,
    contact_id: str | None,
    channel: str | None = None,
    force_new_opportunity_on_restart: bool = False,
    include_restart_metadata: bool = False,
    require_contact_ready: bool | None = None,
) -> str | dict[str, Any]:
    """Resuelve o crea una oportunidad CRM asociada a la conversación actual."""

    if not contact_id:
        raise StorageError("No fue posible resolver contacto para crear la oportunidad")

    contact = await fetch_contact(contact_id)
    organizacion_value = contact.get("organizacion_id")
    if not organizacion_value:
        raise StorageError("El contacto no tiene organizacion_id asociado")

    try:
        organizacion_uuid = UUID(str(organizacion_value))
    except (TypeError, ValueError) as exc:
        raise StorageError("organizacion_id_invalido") from exc

    try:
        contacto_uuid = UUID(str(contact_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("contacto_id_invalido") from exc

    normalized_channel = (channel or "").strip().lower()
    requires_ready = (
        bool(require_contact_ready)
        if require_contact_ready is not None
        else normalized_channel == "webchat"
    )
    contact_ready = _contact_has_minimum_info(contact)

    repo = CRMRepository()
    try:
        opportunity_id, restart_created, restart_sequence = await repo.ensure_conversation_opportunity(
            organizacion_id=organizacion_uuid,
            contacto_id=contacto_uuid,
            conversation_id=conversation_id,
            canal=channel,
            contacto_nombre=contact.get("nombre_completo"),
            contacto_empresa=contact.get("company_name"),
            force_new_opportunity_on_restart=force_new_opportunity_on_restart,
            contact_ready=contact_ready,
            require_contact_ready=requires_ready,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if include_restart_metadata:
        return {
            "oportunidad_id": str(opportunity_id),
            "restart_created": restart_created,
            "restart_sequence": restart_sequence,
        }
    return str(opportunity_id)


async def ensure_lead_tarjeta(
    *,
    tarjeta_id: str | None,
    conversation_id: str,
    contact_id: str | None,
    channel: str | None = None,
) -> str:
    """Compatibilidad: delega a ensure_conversation_opportunity."""

    return await ensure_conversation_opportunity(
        conversation_id=conversation_id,
        contact_id=contact_id,
        channel=channel,
    )


async def maybe_auto_name_opportunity(
    *,
    conversation_id: str,
    contact_id: str,
    summary: str | None = None,
    intent: str | None = None,
    channel: str | None = None,
    opportunity_id: str | None = None,
) -> str | None:
    """Renombra la oportunidad con base en insights cuando el título actual es genérico."""

    try:
        contact = await fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "storage.auto_name_opportunity.contact_lookup_failed",
            extra={"contact_id": contact_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return None

    proposed_title = _build_opportunity_title(contact=contact, intent=intent, summary=summary)
    proposed_description = _build_opportunity_description(
        contact=contact,
        intent=intent,
        summary=summary,
    )
    if not proposed_title and not proposed_description:
        return None

    opportunity_value = (opportunity_id or "").strip()
    if not opportunity_value:
        try:
            resolved = await ensure_conversation_opportunity(
                conversation_id=conversation_id,
                contact_id=contact_id,
                channel=channel,
            )
            opportunity_value = str(resolved)
        except StorageError as exc:
            logger.warning(
                "storage.auto_name_opportunity.ensure_failed",
                extra={
                    "contact_id": contact_id,
                    "conversation_id": conversation_id,
                    "error": str(exc),
                },
            )
            return None

    try:
        opportunity_uuid = UUID(opportunity_value)
    except (TypeError, ValueError):
        return None

    org_value = contact.get("organizacion_id")
    if not org_value:
        return None
    try:
        org_uuid = UUID(str(org_value))
    except (TypeError, ValueError):
        return None

    repo = CRMRepository()
    scoring_runtime = await tenant_runtime.get_lead_scoring_runtime_settings(organizacion_id=org_uuid)
    if not scoring_runtime.enabled:
        return None
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opportunity_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.auto_name_opportunity.lookup_failed",
            extra={
                "opportunity_id": opportunity_value,
                "conversation_id": conversation_id,
                "error": str(exc),
            },
        )
        return None
    if not opportunity:
        return None

    current_title = _clean_text(opportunity.get("titulo"))
    current_description = _clean_text(opportunity.get("descripcion"))
    metadata = _ensure_dict(opportunity.get("metadata"))
    title_auto_generated = _normalize_manual_override(metadata.get("title_auto_generated"))
    description_auto_generated = _normalize_manual_override(
        metadata.get("description_auto_generated")
    )

    should_update_title = bool(proposed_title) and _is_generic_opportunity_title(
        current_title=current_title,
        contact=contact,
        auto_generated=title_auto_generated,
    )
    if should_update_title and proposed_title == current_title:
        should_update_title = False

    should_update_description = bool(proposed_description) and (
        not current_description or description_auto_generated
    )
    if should_update_description and proposed_description == current_description:
        should_update_description = False

    if not should_update_title and not should_update_description:
        return current_title or None

    payload: dict[str, Any] = {}
    now_iso = datetime.now(timezone.utc).isoformat()
    if should_update_title and proposed_title:
        payload["titulo"] = proposed_title
        metadata["title_auto_generated"] = True
        metadata["title_auto_source"] = "conversation_insights"
        metadata["title_auto_updated_at"] = now_iso
    if should_update_description and proposed_description:
        payload["descripcion"] = proposed_description
        metadata["description_auto_generated"] = True
        metadata["description_auto_source"] = "conversation_insights"
        metadata["description_auto_updated_at"] = now_iso

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opportunity_uuid,
            payload={**payload, "metadata": metadata},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.auto_name_opportunity.update_failed",
            extra={
                "opportunity_id": opportunity_value,
                "conversation_id": conversation_id,
                "error": str(exc),
            },
        )
        return None
    return proposed_title or current_title or None


async def apply_lead_scoring(
    *,
    conversation_id: str,
    contact_id: str,
    opportunity_id: str | None = None,
    answers: dict[str, Any] | None = None,
    events: dict[str, Any] | None = None,
    source: str = "ai_progressive_scoring",
) -> dict[str, Any] | None:
    """Calcula y persiste scoring en oportunidad, contacto, insights e historial."""

    try:
        contact = await fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "storage.lead_scoring.contact_lookup_failed",
            extra={"contact_id": contact_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return None

    opportunity_value = (opportunity_id or "").strip()
    if not opportunity_value:
        try:
            opportunity_value = await ensure_conversation_opportunity(
                conversation_id=conversation_id,
                contact_id=contact_id,
                channel=str((events or {}).get("channel") or "").strip() or None,
            )
        except StorageError as exc:
            logger.warning(
                "storage.lead_scoring.ensure_opportunity_failed",
                extra={"contact_id": contact_id, "conversation_id": conversation_id, "error": str(exc)},
            )
            return None

    try:
        opp_uuid = UUID(str(opportunity_value))
    except (TypeError, ValueError):
        return None

    org_value = contact.get("organizacion_id")
    if not org_value:
        return None
    try:
        org_uuid = UUID(str(org_value))
    except (TypeError, ValueError):
        return None

    scoring_runtime = await tenant_runtime.get_lead_scoring_runtime_settings(
        organizacion_id=org_uuid
    )
    if not scoring_runtime.enabled:
        return None

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.lead_scoring.opportunity_lookup_failed",
            extra={"opportunity_id": str(opp_uuid), "conversation_id": conversation_id, "error": str(exc)},
        )
        return None
    if not opportunity:
        return None

    metadata = _ensure_dict(opportunity.get("metadata"))
    previous_scoring = _ensure_dict(metadata.get("lead_scoring"))
    previous_answers = _ensure_dict(previous_scoring.get("answers"))
    previous_events = _ensure_dict(previous_scoring.get("events"))

    normalized_answers = dict(previous_answers)
    for key, value in (answers or {}).items():
        normalized_answers[key] = _normalize_answer_value(key, value)

    merged_events = dict(previous_events)
    merged_events.update(_ensure_dict(events))

    scoring = _compute_lead_scoring(normalized_answers, merged_events, scoring_runtime)
    channel_value = str(merged_events.get("channel") or "").strip().lower()
    if channel_value in {"whatsapp", "webchat"}:
        try:
            dynamic_scoring = await _compute_lead_scoring_from_catalog(
                repo=repo,
                organizacion_id=org_uuid,
                channel=channel_value,
                answers=normalized_answers,
                events=merged_events,
                runtime_settings=scoring_runtime,
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.lead_scoring.catalog_lookup_failed",
                extra={
                    "opportunity_id": str(opp_uuid),
                    "conversation_id": conversation_id,
                    "channel": channel_value,
                    "error": str(exc),
                },
            )
            dynamic_scoring = None
        if dynamic_scoring:
            scoring = dynamic_scoring

    now_iso = datetime.now(timezone.utc).isoformat()
    scoring_payload = {
        **scoring,
        "answers": normalized_answers,
        "events": merged_events,
        "version": "v1",
        "source": source,
        "last_scored_at": now_iso,
    }

    metadata["lead_scoring"] = scoring_payload
    metadata["lead_score"] = int(round(scoring_payload["score_total"]))
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.lead_scoring.opportunity_update_failed",
            extra={"opportunity_id": str(opp_uuid), "conversation_id": conversation_id, "error": str(exc)},
        )
        return None

    contact_data = _ensure_dict(contact.get("contacto_datos"))
    contact_data["lead_scoring"] = {
        "answers": normalized_answers,
        "missing_fields": scoring_payload["missing_fields"],
        "refused_fields": scoring_payload["refused_fields"],
        "last_scored_at": now_iso,
    }
    try:
        await update_contact(contact_id, {"contacto_datos": contact_data})
    except StorageError as exc:
        logger.warning(
            "storage.lead_scoring.contact_update_failed",
            extra={"contact_id": contact_id, "conversation_id": conversation_id, "error": str(exc)},
        )

    try:
        await upsert_conversation_insights(
            conversation_id=conversation_id,
            lead_score=int(round(scoring_payload["score_total"])),
        )
    except StorageError as exc:
        logger.warning(
            "storage.lead_scoring.insights_update_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )

    event_payload = {
        "organizacion_id": str(org_uuid),
        "oportunidad_id": str(opp_uuid),
        "conversacion_id": conversation_id,
        "score_total": scoring_payload["score_total"],
        "grade": scoring_payload["grade"],
        "confidence": scoring_payload["confidence"],
        "factors": scoring_payload["factors"],
        "missing_fields": scoring_payload["missing_fields"],
        "refused_fields": scoring_payload["refused_fields"],
        "events": merged_events,
    }
    try:
        await repo.create_opportunity_scoring_event(payload=event_payload)
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.lead_scoring.event_insert_failed",
            extra={"opportunity_id": str(opp_uuid), "conversation_id": conversation_id, "error": str(exc)},
        )

    return {
        "oportunidad_id": str(opp_uuid),
        "score_total": scoring_payload["score_total"],
        "grade": scoring_payload["grade"],
        "confidence": scoring_payload["confidence"],
        "missing_fields": scoring_payload["missing_fields"],
    }


async def maybe_promote_prequalified_from_scoring(
    *,
    conversation_id: str,
    contact_id: str,
    opportunity_id: str,
    channel: str,
) -> bool:
    """Promueve a precalificado cuando se cumplen condiciones minimas de scoring."""
    try:
        contact = await fetch_contact(contact_id)
    except StorageError:
        return False
    org_id = contact.get("organizacion_id")
    if not org_id:
        return False

    try:
        org_uuid = UUID(str(org_id))
        opp_uuid = UUID(str(opportunity_id))
    except (TypeError, ValueError):
        return False

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError:
        return False
    if not opportunity:
        return False

    metadata = _ensure_dict(opportunity.get("metadata"))
    scoring = _ensure_dict(metadata.get("lead_scoring"))
    events = _ensure_dict(scoring.get("events"))
    answers = _ensure_dict(scoring.get("answers"))

    appointment_scheduled = _as_bool(events.get("appointment_scheduled"))
    has_financial = bool(
        (answers.get("financing_type") and answers.get("financing_type") not in {"unknown", "refused"})
        or (answers.get("budget_range") and answers.get("budget_range") not in {"unknown", "refused"})
    )
    has_timeline = bool(
        answers.get("purchase_timeline")
        and answers.get("purchase_timeline") not in {"unknown", "refused"}
    )
    has_authority = bool(
        answers.get("decision_authority")
        and answers.get("decision_authority") not in {"unknown", "refused"}
    )

    if not (appointment_scheduled and has_financial and has_timeline and has_authority):
        metadata["precalificacion_incompleta"] = True
        try:
            await repo.update_opportunity(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
                payload={"metadata": metadata},
            )
        except CRMRepositoryError:
            pass
        return False

    try:
        return await promote_opportunity_stage(
            oportunidad_id=str(opp_uuid),
            organizacion_id=str(org_uuid),
            stage_code="precalificado",
            source="lead_scoring_rules",
            channel=channel,
        )
    except StorageError:
        return False


async def promote_opportunity_stage(
    *,
    oportunidad_id: str,
    organizacion_id: str,
    stage_code: str,
    source: str | None = None,
    channel: str | None = None,
) -> bool:
    """Promueve una oportunidad a la etapa indicada (por código) si aún no ha llegado ahí."""
    normalized_code = (stage_code or "").strip().lower()
    if not normalized_code:
        return False

    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    log_context = {
        "oportunidad_id": str(opp_uuid),
        "organizacion_id": str(org_uuid),
        "stage_code": normalized_code,
        "source": source or "system",
        "channel": channel,
    }
    try:
        stage = await repo.get_stage_by_code(
            organizacion_id=org_uuid,
            codigo=normalized_code,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not stage:
        log_event(logger, "promote_stage.stage_not_found", **log_context)
        return False

    stage_id = stage.get("id")
    if not isinstance(stage_id, UUID):
        try:
            stage_id = UUID(str(stage_id))
        except (TypeError, ValueError) as exc:
            raise StorageError("opportunity_stage_invalid_target") from exc

    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        log_event(logger, "promote_stage.opportunity_missing", **log_context)
        return False

    current_stage_value = opportunity.get("etapa_id")
    try:
        current_stage_uuid = UUID(str(current_stage_value)) if current_stage_value else None
    except (TypeError, ValueError):
        current_stage_uuid = None

    if current_stage_uuid == stage_id:
        log_event(logger, "promote_stage.already_in_stage", **log_context)
        return False

    current_stage_order = (opportunity.get("etapa") or {}).get("orden")
    target_order = stage.get("orden")
    if isinstance(current_stage_order, (int, float)) and isinstance(target_order, (int, float)):
        if current_stage_order >= target_order:
            log_event(
                logger,
                "promote_stage.skipped_order",
                current_stage_order=current_stage_order,
                target_order=target_order,
                **log_context,
            )
            return False

    metadata = _ensure_dict(opportunity.get("metadata"))
    auto_stage = _ensure_dict(metadata.get("auto_stage"))
    auto_stage[normalized_code] = {
        "stage_code": normalized_code,
        "source": source or "system",
        "channel": channel,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    metadata["auto_stage"] = auto_stage

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"etapa_id": str(stage_id), "metadata": metadata},
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    log_event(logger, "promote_stage.success", **log_context)
    return True


async def record_demo_booking_metadata(
    *,
    oportunidad_id: str,
    organizacion_id: str,
    scheduled_at: datetime,
    booking_id: str | None = None,
) -> None:
    """Actualiza stage_prep.demo con la hora agendada y el booking_id."""
    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    log_context = {
        "oportunidad_id": str(opp_uuid),
        "organizacion_id": str(org_uuid),
        "booking_id": booking_id,
    }
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        log_event(logger, "demo_booking.opportunity_missing", **log_context)
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    stage_prep = _ensure_dict(metadata.get("stage_prep"))
    demo_prep = _ensure_dict(stage_prep.get("demo"))
    demo_prep["demo_scheduled_at"] = scheduled_at.astimezone(timezone.utc).isoformat()
    if booking_id:
        demo_prep["demo_booking_id"] = booking_id
    stage_prep["demo"] = demo_prep
    metadata["stage_prep"] = stage_prep

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    log_event(logger, "demo_booking.metadata_updated", **log_context)


async def fetch_demo_booking_metadata(
    *,
    oportunidad_id: str,
    organizacion_id: str,
) -> dict[str, Any] | None:
    """Obtiene la metadata de la etapa stage_prep.demo para la oportunidad."""
    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        return None

    metadata = _ensure_dict(opportunity.get("metadata"))
    stage_prep = _ensure_dict(metadata.get("stage_prep"))
    demo_prep = _ensure_dict(stage_prep.get("demo"))
    if not demo_prep:
        return None
    return {k: v for k, v in demo_prep.items() if v is not None}


async def fetch_opportunity_contact(
    *,
    oportunidad_id: str,
    organizacion_id: str | None,
) -> dict[str, Any] | None:
    """Obtiene el contacto principal ligado a la oportunidad indicada.

    Si no se proporciona organizacion_id, se busca directamente por oportunidad
    usando credenciales de service role (válido para tareas internas).
    """
    org_uuid: UUID | None = None
    try:
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_contact_invalid_id") from exc
    if organizacion_id:
        try:
            org_uuid = UUID(str(organizacion_id))
        except (TypeError, ValueError) as exc:
            raise StorageError("opportunity_contact_invalid_org") from exc

    repo = CRMRepository()
    try:
        if org_uuid:
            opportunity = await repo.get_pipeline_opportunity(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
            )
        else:
            opportunity = await repo.get_pipeline_opportunity_by_id(
                oportunidad_id=opp_uuid,
            )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        return None
    contact = opportunity.get("contacto")
    if not isinstance(contact, dict):
        return None
    result = dict(contact)
    resolved_org = opportunity.get("organizacion_id") or (str(org_uuid) if org_uuid else None)
    if resolved_org:
        result.setdefault("organizacion_id", resolved_org)
    return result


async def fetch_calendar_booking(booking_id: str) -> dict[str, Any] | None:
    """Obtiene una cita del calendario utilizando credenciales de servicio."""
    booking_key = str(booking_id or "").strip()
    if not booking_key:
        return None
    try:
        booking_uuid = UUID(booking_key)
    except (TypeError, ValueError) as exc:
        raise StorageError("calendar_booking_invalid_id") from exc
    repo = CRMRepository()
    try:
        return await repo.get_calendar_booking_by_id(booking_id=booking_uuid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_calendar_booking_by_conversation(conversation_id: str) -> dict[str, Any] | None:
    """Busca la cita asociada a la conversación dada."""
    if not conversation_id:
        return None
    try:
        conv_uuid = UUID(str(conversation_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("calendar_booking_invalid_conversation_id") from exc
    repo = CRMRepository()
    try:
        return await repo.get_calendar_booking_by_conversation(conversation_id=conv_uuid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_calendar_booking_by_contact(contact_id: str) -> dict[str, Any] | None:
    """Busca la cita asociada al contacto dado."""
    if not contact_id:
        return None
    try:
        contact_uuid = UUID(str(contact_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("calendar_booking_invalid_contact_id") from exc
    repo = CRMRepository()
    try:
        return await repo.get_calendar_booking_by_contact(contact_id=contact_uuid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def capture_opportunity_if_ready(
    *,
    conversation_id: str,
    contact_id: str,
    channel: str | None = None,
) -> tuple[bool, str | None]:
    """Crea/promueve la oportunidad cuando el contacto ya tiene al menos un dato válido."""
    capture_channel = channel or "assistant"
    log_context = {
        "conversation_id": conversation_id,
        "contact_id": contact_id,
        "channel": capture_channel,
    }

    try:
        contact = await fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.contact_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        log_event(
            logger,
            "capture_opportunity.contact_lookup_failed",
            error=str(exc),
            **log_context,
        )
        return False, None

    correo = str(contact.get("correo") or "").strip()
    telefono = str(contact.get("telefono_e164") or "").strip()
    if not correo and not telefono:
        log_event(logger, "capture_opportunity.skipped_no_contact_data", **log_context)
        return False, None

    try:
        oportunidad_id = await ensure_conversation_opportunity(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel=capture_channel,
        )
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.ensure_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        log_event(
            logger,
            "capture_opportunity.ensure_failed",
            error=str(exc),
            **log_context,
        )
        return False, None

    organizacion_id = contact.get("organizacion_id")
    if not organizacion_id:
        log_event(
            logger,
            "capture_opportunity.no_org_context",
            opportunity_id=oportunidad_id,
            **log_context,
        )
        return True, oportunidad_id

    try:
        await promote_opportunity_stage(
            oportunidad_id=oportunidad_id,
            organizacion_id=str(organizacion_id),
            stage_code="captado",
            source="capture_opportunity",
            channel=capture_channel,
        )
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.promote_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        log_event(
            logger,
            "capture_opportunity.promote_failed",
            opportunity_id=oportunidad_id,
            error=str(exc),
            **log_context,
        )
        return True, oportunidad_id

    log_event(
        logger,
        "capture_opportunity.promoted",
        opportunity_id=oportunidad_id,
        stage_code="captado",
        **log_context,
    )
    return True, oportunidad_id


async def capture_lead_if_ready(
    *,
    conversation_id: str,
    contact_id: str,
    channel: str | None = None,
) -> tuple[bool, str | None]:
    """Compatibilidad: delega a capture_opportunity_if_ready."""

    return await capture_opportunity_if_ready(
        conversation_id=conversation_id,
        contact_id=contact_id,
        channel=channel,
    )
