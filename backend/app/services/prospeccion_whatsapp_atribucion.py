"""Utilidades de atribución de publicidad WhatsApp por frase."""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Sequence

VALID_MATCH_TYPES = {"exacta", "contiene", "regex"}


def normalize_whatsapp_phrase(value: Any) -> str:
    """Normaliza texto para matching: trim, minúsculas, sin acentos y espacios compactados."""

    raw = str(value or "")
    folded = unicodedata.normalize("NFKD", raw)
    no_accents = "".join(ch for ch in folded if not unicodedata.combining(ch))
    lowered = no_accents.strip().lower()
    cleaned = "".join(ch if (ch.isalnum() or ch.isspace()) else " " for ch in lowered)
    return " ".join(cleaned.split())


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _resolve_match_type(value: Any) -> str:
    candidate = str(value or "").strip().lower()
    if candidate in VALID_MATCH_TYPES:
        return candidate
    return "contiene"


def match_phrase_against_rule(
    *,
    incoming_raw: str,
    incoming_normalized: str,
    rule: dict[str, Any],
) -> tuple[bool, str]:
    """Evalúa si una frase matchea una regla y devuelve tipo de match aplicado."""

    phrase_target = _safe_text(rule.get("frase_objetivo"))
    if not phrase_target:
        return False, _resolve_match_type(rule.get("tipo_match"))

    target_normalized = normalize_whatsapp_phrase(phrase_target)
    match_type = _resolve_match_type(rule.get("tipo_match"))
    if not incoming_normalized or not target_normalized:
        return False, match_type

    if match_type == "exacta":
        return incoming_normalized == target_normalized, match_type
    if match_type == "contiene":
        return target_normalized in incoming_normalized, match_type

    # Compatibilidad robusta:
    # 1) intenta regex contra texto original entrante,
    # 2) si no matchea, intenta regex normalizado contra texto normalizado.
    try:
        pattern_raw = re.compile(phrase_target, flags=re.IGNORECASE)
    except re.error:
        if target_normalized and target_normalized in incoming_normalized:
            return True, "contiene"
        return False, "regex"
    if pattern_raw.search(str(incoming_raw or "")):
        return True, "regex"
    pattern_normalized_source = normalize_whatsapp_phrase(
        _safe_text(rule.get("frase_normalizada")) or phrase_target
    )
    if not pattern_normalized_source:
        if target_normalized and target_normalized in incoming_normalized:
            return True, "contiene"
        return False, "regex"
    try:
        pattern_normalized = re.compile(pattern_normalized_source, flags=re.IGNORECASE)
    except re.error:
        if target_normalized and target_normalized in incoming_normalized:
            return True, "contiene"
        return False, "regex"
    if pattern_normalized.search(incoming_normalized):
        return True, "regex"
    if target_normalized and target_normalized in incoming_normalized:
        return True, "contiene"
    return False, "regex"


def resolve_first_matching_rule(
    *,
    incoming_text: str,
    rules: Sequence[dict[str, Any]],
) -> tuple[dict[str, Any] | None, str | None, str]:
    """Devuelve la primera regla activa que matchea, respetando el orden recibido."""

    normalized_incoming = normalize_whatsapp_phrase(incoming_text)
    if not normalized_incoming:
        return None, None, normalized_incoming

    for rule in rules:
        if not isinstance(rule, dict):
            continue
        if rule.get("activo") is False:
            continue
        matched, applied_match = match_phrase_against_rule(
            incoming_raw=incoming_text,
            incoming_normalized=normalized_incoming,
            rule=rule,
        )
        if matched:
            return rule, applied_match, normalized_incoming
    return None, None, normalized_incoming
