"""Guardrails de calidad para respuestas de asistente."""

from __future__ import annotations

from typing import Any

_TRAILING_CONNECTORS = {
    "y",
    "e",
    "de",
    "que",
    "para",
    "con",
    "por",
    "si",
    "o",
    "u",
    "pero",
    "aunque",
    "porque",
}
_KNOWN_FAILURE_PHRASES = {
    "no pude procesar bien",
    "no pude procesar tu mensaje",
    "tuve un problema al procesar",
    "ocurrio un problema al procesar",
}


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text


def evaluate_reply_quality(text: Any) -> tuple[bool, str]:
    """Evalúa si una respuesta textual parece completa y publicable."""

    value = _normalize_text(text)
    if not value:
        return False, "empty"

    lowered = value.lower()
    if any(phrase in lowered for phrase in _KNOWN_FAILURE_PHRASES):
        return False, "known_failure_phrase"

    if value.endswith(("...", "…", ":", ";", ",", "-")):
        return False, "suspicious_trailing_punctuation"

    tokens = value.split()
    if tokens:
        last_token = tokens[-1].strip(".,;:!?()[]{}\"'").lower()
        if last_token in _TRAILING_CONNECTORS:
            return False, "trailing_connector"

    if value.count("```") % 2 != 0:
        return False, "unbalanced_code_fence"
    if value.count('"') % 2 != 0 and value.count('"') >= 3:
        return False, "unbalanced_quote"
    if value.count("(") != value.count(")"):
        return False, "unbalanced_parentheses"

    return True, "ok"

