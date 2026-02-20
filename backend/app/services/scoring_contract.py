"""Utilidades compartidas para contrato de scoring/perfilamiento multi-canal."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
import unicodedata


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _normalize_financing_value(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    normalized = (
        unicodedata.normalize("NFKD", value.strip())
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    compact = " ".join(normalized.split())
    if compact in {"contado", "cash"} or "contado" in compact:
        return "contado"
    if compact in {"credito", "con credito"} or "credito" in compact:
        return "credito"
    if compact in {"mixto", "ambas", "both"}:
        return "mixto"
    return compact


def normalize_required_fields_for_answers(
    required_fields: Sequence[str],
    answers: Mapping[str, Any] | None,
) -> list[str]:
    """Normaliza campos requeridos y aplica dependencias condicionales."""
    normalized: list[str] = []
    for item in required_fields:
        field = str(item or "").strip()
        if field and field not in normalized:
            normalized.append(field)
    financing = _normalize_financing_value((answers or {}).get("financing_type"))
    if financing == "contado":
        normalized = [field for field in normalized if field != "credit_preapproved"]
    return normalized


def build_profile_summary_text(opportunity_metadata: Mapping[str, Any]) -> str | None:
    """Construye resumen compacto de respuestas de perfilamiento para notificación."""
    scoring = _ensure_dict(opportunity_metadata.get("lead_scoring"))
    answers = _ensure_dict(scoring.get("answers"))
    if not answers:
        return None

    finance_map = {"credito": "crédito", "contado": "contado", "mixto": "mixto"}
    credit_map = {
        "in_process": "crédito en trámite",
        "preapproved": "crédito preaprobado",
        "none": "sin crédito",
    }
    decision_map = {
        "self": "individual",
        "full": "individual",
        "shared": "compartida",
        "advisor": "con asesor",
    }
    visited_map = {"yes": "sí", "no": "no"}

    fields: list[str] = []
    budget = str(answers.get("budget_range") or "").strip()
    if budget:
        fields.append(f"Presupuesto {budget}")

    financing = str(answers.get("financing_type") or "").strip().lower()
    if financing:
        fields.append(f"Financiamiento {finance_map.get(financing, financing)}")

    credit = str(answers.get("credit_preapproved") or "").strip().lower()
    if credit:
        fields.append(f"Estatus crédito {credit_map.get(credit, credit)}")

    timeline = str(answers.get("purchase_timeline") or "").strip()
    if timeline:
        fields.append(f"Plazo {timeline}")

    decision = str(answers.get("decision_authority") or "").strip().lower()
    if decision:
        fields.append(f"Decisión {decision_map.get(decision, decision)}")

    visited = str(answers.get("visited_properties") or "").strip().lower()
    if visited:
        fields.append(f"Visitas previas {visited_map.get(visited, visited)}")

    score_value = scoring.get("score_total")
    grade = str(scoring.get("grade") or "").strip()
    if score_value is not None:
        try:
            score_text = f"{float(score_value):.0f}"
            fields.append(f"Lead score {score_text}{f' ({grade})' if grade else ''}")
        except (TypeError, ValueError):
            pass

    if not fields:
        return None
    return " | ".join(fields)
