"""Sincroniza catálogos geo de México desde archivos locales a Supabase.

Fuente:
- app/data/geo/municipios/manifest.json
- app/data/geo/municipios/municipios_*_clean.geojson

Objetivo:
- public.geo_estados_mexico
- public.geo_municipios_mexico
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings

BASE_DIR = Path(__file__).resolve().parents[1]
GEO_DIR = BASE_DIR / "app" / "data" / "geo" / "municipios"
MANIFEST_PATH = GEO_DIR / "manifest.json"


@dataclass(slots=True)
class SyncStats:
    states_upserted: int = 0
    municipalities_upserted: int = 0
    municipalities_deactivated: int = 0


def _headers() -> dict[str, str]:
    token = settings.supabase_service_role or ""
    return {
        "apikey": token,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _require_supabase() -> None:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise RuntimeError("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE en entorno.")


def _load_source() -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise RuntimeError("Manifest inválido.")

    states: list[dict[str, Any]] = []
    municipalities_by_state: dict[str, list[dict[str, Any]]] = {}

    for raw_state_code, entry in sorted(manifest.items()):
        state_code = str(raw_state_code).strip().zfill(2)
        if not isinstance(entry, dict):
            continue
        state_name = str(entry.get("name") or "").strip()
        rel_path = str(entry.get("path") or "").strip()
        if not state_name or not rel_path:
            continue
        geo_path = GEO_DIR / rel_path
        if not geo_path.exists():
            raise RuntimeError(f"No existe archivo de municipios: {geo_path}")

        payload = json.loads(geo_path.read_text(encoding="utf-8"))
        features = payload.get("features") or []
        if not isinstance(features, list):
            raise RuntimeError(f"Formato inválido en {geo_path}")

        municipalities: dict[str, dict[str, Any]] = {}
        for feature in features:
            if not isinstance(feature, dict):
                continue
            props = feature.get("properties") or {}
            if not isinstance(props, dict):
                continue
            municipality_code = str(props.get("cve_mun") or "").strip().zfill(3)
            municipality_name = str(props.get("nom_mun") or "").strip()
            if not municipality_code or not municipality_name:
                continue
            municipalities[municipality_code] = {
                "clave_entidad": state_code,
                "clave_municipio": municipality_code,
                "cvegeo": f"{state_code}{municipality_code}",
                "nombre": municipality_name,
                "activo": True,
            }

        states.append(
            {
                "clave_entidad": state_code,
                "pais_codigo": "MX",
                "nombre": state_name,
                "activo": True,
            }
        )
        municipalities_by_state[state_code] = [municipalities[code] for code in sorted(municipalities.keys())]

    return states, municipalities_by_state


def _postgrest(
    client: httpx.Client,
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    payload: Any = None,
    prefer: str | None = None,
) -> Any:
    base = settings.supabase_url.rstrip("/")
    url = f"{base}{path}"
    headers = _headers()
    if prefer:
        headers["Prefer"] = prefer
    response = client.request(method, url, params=params, headers=headers, json=payload, timeout=120.0)
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase error {response.status_code} en {path}: {response.text[:800]}")
    if response.text:
        return response.json()
    return None


def _chunked(rows: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [rows[idx : idx + size] for idx in range(0, len(rows), size)]


def _fetch_active_municipality_codes(client: httpx.Client, state_codes: list[str]) -> dict[str, set[str]]:
    by_state: dict[str, set[str]] = defaultdict(set)
    for state_code in sorted(state_codes):
        rows = _postgrest(
            client,
            "GET",
            "/rest/v1/geo_municipios_mexico",
            params={
                "select": "clave_municipio",
                "clave_entidad": f"eq.{state_code}",
                "activo": "eq.true",
                "order": "clave_municipio.asc",
                "limit": "2000",
            },
        )
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            municipality_code = str(row.get("clave_municipio") or "").strip().zfill(3)
            if municipality_code:
                by_state[state_code].add(municipality_code)
    return by_state


def run_sync(*, apply: bool, batch_size: int) -> SyncStats:
    _require_supabase()
    states, municipalities_by_state = _load_source()
    stats = SyncStats()

    with httpx.Client() as client:
        expected_by_state: dict[str, set[str]] = {
            state_code: {row["clave_municipio"] for row in rows}
            for state_code, rows in municipalities_by_state.items()
        }

        if not apply:
            print(f"[dry-run] Estados fuente: {len(states)}")
            print(f"[dry-run] Municipios fuente: {sum(len(v) for v in municipalities_by_state.values())}")
            existing_active = _fetch_active_municipality_codes(client, list(expected_by_state.keys()))
            for state_code in sorted(expected_by_state.keys()):
                expected = expected_by_state[state_code]
                active = existing_active.get(state_code, set())
                if len(active) != len(expected):
                    print(
                        f"[dry-run] Estado {state_code}: activos_db={len(active)} esperado={len(expected)} "
                        f"faltantes={len(expected - active)} extra={len(active - expected)}"
                    )
            return stats

        _postgrest(
            client,
            "POST",
            "/rest/v1/geo_estados_mexico",
            params={"on_conflict": "clave_entidad"},
            payload=states,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        stats.states_upserted = len(states)

        all_municipalities: list[dict[str, Any]] = []
        for state_code in sorted(municipalities_by_state.keys()):
            all_municipalities.extend(municipalities_by_state[state_code])

        for chunk in _chunked(all_municipalities, max(1, batch_size)):
            _postgrest(
                client,
                "POST",
                "/rest/v1/geo_municipios_mexico",
                params={"on_conflict": "clave_entidad,clave_municipio"},
                payload=chunk,
                prefer="resolution=merge-duplicates,return=minimal",
            )
            stats.municipalities_upserted += len(chunk)

        existing_active = _fetch_active_municipality_codes(client, list(expected_by_state.keys()))
        for state_code in sorted(expected_by_state.keys()):
            expected = expected_by_state[state_code]
            active = existing_active.get(state_code, set())
            to_deactivate = sorted(active - expected)
            if not to_deactivate:
                continue
            in_clause = ",".join(to_deactivate)
            _postgrest(
                client,
                "PATCH",
                "/rest/v1/geo_municipios_mexico",
                params={
                    "clave_entidad": f"eq.{state_code}",
                    "clave_municipio": f"in.({in_clause})",
                },
                payload={"activo": False},
                prefer="return=minimal",
            )
            stats.municipalities_deactivated += len(to_deactivate)

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza catálogos geo de México (estados/municipios) a Supabase.")
    parser.add_argument("--apply", action="store_true", help="Ejecuta cambios. Sin este flag corre en dry-run.")
    parser.add_argument("--batch-size", type=int, default=500, help="Tamaño de lote para upsert de municipios.")
    args = parser.parse_args()

    stats = run_sync(apply=args.apply, batch_size=args.batch_size)
    if args.apply:
        print(
            "Sincronización completada:"
            f" estados_upserted={stats.states_upserted},"
            f" municipios_upserted={stats.municipalities_upserted},"
            f" municipios_deactivated={stats.municipalities_deactivated}"
        )


if __name__ == "__main__":
    main()
