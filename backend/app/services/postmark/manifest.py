"""Compactación sin pérdida del contenido repetido en manifiestos de correo."""

import json
from typing import Any, Sequence


def compact_manifest(entries: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    payloads: dict[str, int] = {}
    for entry in entries:
        row = dict(entry)
        key = json.dumps(row.get("payload", {}), sort_keys=True, ensure_ascii=False)
        if key in payloads:
            row.pop("payload", None)
            row["payload_ref"] = payloads[key]
        else:
            payloads[key] = len(result)
        result.append(row)
    return result


def expand_manifest(entries: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for entry in entries:
        row = dict(entry)
        if "payload_ref" in row:
            ref = row.pop("payload_ref")
            if type(ref) is not int or not 0 <= ref < len(result):
                raise ValueError("postmark_manifest_payload_reference_invalid")
            row["payload"] = dict(result[ref]["payload"])
        result.append(row)
    return result
