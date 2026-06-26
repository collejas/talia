#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.repositories.crm import CRMRepository, CRMRepositoryError


def _norm_email(value: Any) -> str | None:
    raw = str(value or "").strip().lower()
    return raw or None


def _norm_phone(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits or None


def _norm_rfc(value: Any) -> str | None:
    raw = str(value or "").strip().upper()
    return raw or None


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raw = str(value or "").strip()
    if not raw:
        return datetime.max.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return datetime.max.replace(tzinfo=timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


@dataclass
class Cluster:
    entity: str
    organizacion_id: UUID
    key_type: str
    key_value: str
    ids: list[UUID]


class UnionFind:
    def __init__(self, items: list[UUID]) -> None:
        self.parent = {item: item for item in items}
        self.rank = {item: 0 for item in items}

    def find(self, item: UUID) -> UUID:
        parent = self.parent[item]
        if parent != item:
            self.parent[item] = self.find(parent)
        return self.parent[item]

    def union(self, a: UUID, b: UUID) -> None:
        ra = self.find(a)
        rb = self.find(b)
        if ra == rb:
            return
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1


async def _fetch_all_rows(repo: CRMRepository, *, path: str, select: str, filters: dict[str, str], page_size: int = 200) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params = dict(filters)
        params["select"] = select
        params["order"] = "creado_en.asc,id.asc"
        params["limit"] = str(page_size)
        params["offset"] = str(offset)
        resp = await repo._request("GET", path, params=params)  # noqa: SLF001 - script interno
        batch = resp.json()
        if not isinstance(batch, list):
            raise CRMRepositoryError(f"Respuesta inválida al listar {path}: {batch!r}")
        page = [row for row in batch if isinstance(row, dict)]
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def _build_clusters(entity: str, rows: list[dict[str, Any]]) -> list[Cluster]:
    rows_by_id = {UUID(str(row["id"])): row for row in rows if row.get("id")}
    all_ids = list(rows_by_id.keys())
    uf = UnionFind(all_ids)
    org_key_to_ids: dict[tuple[UUID, str, str], list[UUID]] = defaultdict(list)

    for row_id, row in rows_by_id.items():
        org_id = UUID(str(row["organizacion_id"]))
        if entity == "personas":
            keys = [
                ("email", _norm_email(row.get("correo_principal"))),
                ("email", _norm_email(row.get("correo_secundario"))),
                ("email", _norm_email(row.get("correo_institucional"))),
                ("email", _norm_email(row.get("correo_personal_3"))),
                ("email", _norm_email(row.get("correo"))),
                ("phone", _norm_phone(row.get("telefono_principal_e164") or row.get("telefono_movil_1_e164") or row.get("telefono"))),
                ("phone", _norm_phone(row.get("telefono_secundario_e164") or row.get("telefono_movil_2_e164"))),
                ("phone", _norm_phone(row.get("telefono_empresa_1_e164"))),
                ("phone", _norm_phone(row.get("telefono_empresa_2_e164"))),
            ]
        else:
            keys = [
                ("rfc", _norm_rfc(row.get("rfc"))),
                ("email", _norm_email(row.get("correo_principal"))),
                ("email", _norm_email(row.get("correo_secundario"))),
                ("email", _norm_email(row.get("correo") or row.get("email"))),
                ("phone", _norm_phone(row.get("telefono_principal_e164") or row.get("telefono"))),
                ("phone", _norm_phone(row.get("telefono_secundario_e164"))),
            ]
        for key_type, key_value in keys:
            if key_value:
                org_key_to_ids[(org_id, key_type, key_value)].append(row_id)

    for (org_id, key_type, key_value), ids in org_key_to_ids.items():
        if len(ids) < 2:
            continue
        first = ids[0]
        for other in ids[1:]:
            uf.union(first, other)

    # Recalcular componentes reales con un pase determinista.
    seen_roots: set[UUID] = set()
    result: list[Cluster] = []
    for row_id, row in rows_by_id.items():
        root = uf.find(row_id)
        if root in seen_roots:
            continue
        seen_roots.add(root)
        component_rows = [r for rid, r in rows_by_id.items() if uf.find(rid) == root]
        if len(component_rows) < 2:
            continue
        component_rows_sorted = sorted(
            component_rows,
            key=lambda row: (_parse_dt(row.get("creado_en")), str(row.get("id") or "")),
        )
        org_id = UUID(str(component_rows_sorted[0]["organizacion_id"]))
        key_summary: list[dict[str, str]] = []
        for row in component_rows_sorted:
            if entity == "personas":
                candidates = [
                    ("email", _norm_email(row.get("correo_principal"))),
                    ("phone", _norm_phone(row.get("telefono_principal_e164") or row.get("telefono_movil_1_e164") or row.get("telefono"))),
                ]
            else:
                candidates = [
                    ("rfc", _norm_rfc(row.get("rfc"))),
                    ("email", _norm_email(row.get("correo_principal"))),
                    ("phone", _norm_phone(row.get("telefono_principal_e164") or row.get("telefono"))),
                ]
            for key_type, key_value in candidates:
                if key_value and not any(item["key_type"] == key_type and item["key_value"] == key_value for item in key_summary):
                    key_summary.append({"key_type": key_type, "key_value": key_value})
        result.append(
            Cluster(
                entity=entity,
                organizacion_id=org_id,
                key_type=" / ".join(sorted({item["key_type"] for item in key_summary})),
                key_value="; ".join(f'{item["key_type"]}={item["key_value"]}' for item in key_summary[:4]),
                ids=[UUID(str(row["id"])) for row in component_rows_sorted],
            )
        )
    return result


async def _merge_persona_cluster_impl(repo: CRMRepository, cluster: Cluster, *, dry_run: bool) -> dict[str, Any]:
    ids = cluster.ids
    if len(ids) < 2:
        return {"merged": 0}
    canonical = ids[0]
    merged = 0
    target_row = await repo.get_persona_by_id(persona_id=str(canonical))
    if not target_row:
        raise CRMRepositoryError(f"persona_canonical_not_found:{canonical}")

    for source_id in ids[1:]:
        source_row = await repo.get_persona_by_id(persona_id=str(source_id))
        if not source_row:
            continue
        if dry_run:
            print(f"[DRY-RUN] personas {source_id} -> {canonical} ({cluster.key_type}: {cluster.key_value})")
            merged += 1
            continue

        def _pick_missing(target_value: Any, source_value: Any) -> Any:
            if target_value not in (None, "", [], {}):
                return target_value
            return source_value

        target_patch: dict[str, Any] = {}
        for key in (
            "nombre",
            "apellido_paterno",
            "apellido_materno",
            "nombre_completo",
            "correo",
            "correo_principal",
            "telefono",
            "telefono_e164",
            "telefono_principal_e164",
            "area",
            "rol_decision",
            "estado",
            "origen",
            "company_name",
            "notas",
            "necesidad_proposito",
            "persona_datos",
            "metadata",
        ):
            target_value = target_row.get(key)
            source_value = source_row.get(key)
            if key == "metadata":
                source_meta = source_value if isinstance(source_value, dict) else {}
                target_meta = target_value if isinstance(target_value, dict) else {}
                merged_meta = dict(source_meta)
                merged_meta.update(target_meta)
                merged_meta["merged_from_persona_id"] = str(source_id)
                merged_meta["merge_reason"] = "dedupe_cleanup"
                merged_meta["merge_status"] = "merged"
                target_patch[key] = merged_meta
                continue
            picked = _pick_missing(target_value, source_value)
            if picked not in (None, "", [], {}):
                target_patch[key] = picked
        target_patch.setdefault("estado", target_row.get("estado") or "lead")
        target_patch["actualizado_en"] = datetime.now(timezone.utc).isoformat()

        await repo.update_persona(
            organizacion_id=cluster.organizacion_id,
            persona_id=canonical,
            payload=target_patch,
        )

        source_relations = await repo.list_persona_account_relations(
            organizacion_id=cluster.organizacion_id,
            persona_id=source_id,
            activo=None,
        )
        target_relations = await repo.list_persona_account_relations(
            organizacion_id=cluster.organizacion_id,
            persona_id=canonical,
            activo=None,
        )
        target_relations_by_account = {
            str(row.get("cuenta_id") or ""): row
            for row in target_relations
            if str(row.get("cuenta_id") or "").strip()
        }
        for relation in source_relations:
            account_id_raw = str(relation.get("cuenta_id") or "").strip()
            if not account_id_raw:
                continue
            target_relation = target_relations_by_account.get(account_id_raw)
            relation_payload = {
                "rol_en_cuenta": relation.get("rol_en_cuenta"),
                "es_contacto_principal": bool(relation.get("es_contacto_principal")),
                "es_contacto_facturacion": bool(relation.get("es_contacto_facturacion")),
                "es_representante_legal": bool(relation.get("es_representante_legal")),
                "activo": bool(relation.get("activo", True)),
                "fecha_inicio": relation.get("fecha_inicio"),
                "fecha_fin": relation.get("fecha_fin"),
                "notas": relation.get("notas"),
                "metadata": relation.get("metadata"),
            }
            if target_relation and target_relation.get("id"):
                merged_relation_payload = {
                    "rol_en_cuenta": target_relation.get("rol_en_cuenta") or relation_payload["rol_en_cuenta"],
                    "es_contacto_principal": bool(target_relation.get("es_contacto_principal")) or relation_payload["es_contacto_principal"],
                    "es_contacto_facturacion": bool(target_relation.get("es_contacto_facturacion")) or relation_payload["es_contacto_facturacion"],
                    "es_representante_legal": bool(target_relation.get("es_representante_legal")) or relation_payload["es_representante_legal"],
                    "activo": bool(target_relation.get("activo", True)) or relation_payload["activo"],
                    "fecha_inicio": target_relation.get("fecha_inicio") or relation_payload["fecha_inicio"],
                    "fecha_fin": target_relation.get("fecha_fin") or relation_payload["fecha_fin"],
                    "notas": target_relation.get("notas") or relation_payload["notas"],
                    "metadata": {
                        **(relation_payload["metadata"] if isinstance(relation_payload["metadata"], dict) else {}),
                        **(target_relation.get("metadata") if isinstance(target_relation.get("metadata"), dict) else {}),
                        "merged_from_persona_id": str(source_id),
                    },
                }
                await repo.update_persona_account_relation(
                    organizacion_id=cluster.organizacion_id,
                    persona_id=canonical,
                    relacion_id=UUID(str(target_relation["id"])),
                    payload=merged_relation_payload,
                )
            else:
                relation_payload["metadata"] = {
                    **(relation_payload["metadata"] if isinstance(relation_payload["metadata"], dict) else {}),
                    "merged_from_persona_id": str(source_id),
                }
                await repo.create_persona_account_relation(
                    organizacion_id=cluster.organizacion_id,
                    persona_id=canonical,
                    payload={key: value for key, value in relation_payload.items() if value not in (None, "", {}, [])}
                    | {"cuenta_id": account_id_raw},
                )
            await repo.delete_persona_account_relation(
                organizacion_id=cluster.organizacion_id,
                persona_id=source_id,
                relacion_id=UUID(str(relation["id"])),
            )

        opportunities_moved = 0
        offset = 0
        limit = 200
        while True:
            rows, _ = await repo.list_opportunities(
                organizacion_id=cluster.organizacion_id,
                limit=limit,
                offset=offset,
                persona_id=source_id,
                include_contact_rows=False,
            )
            if not rows:
                break
            for opportunity in rows:
                opportunity_id = UUID(str(opportunity["id"]))
                metadata = opportunity.get("metadata") if isinstance(opportunity.get("metadata"), dict) else {}
                metadata = dict(metadata)
                metadata["merged_from_persona_id"] = str(source_id)
                metadata["merged_into_persona_id"] = str(canonical)
                metadata["merge_reason"] = "dedupe_cleanup"
                patch = {"contacto_principal_id": str(canonical), "metadata": metadata}
                if not str(opportunity.get("contacto_nombre") or "").strip():
                    target_name = str(target_row.get("nombre_completo") or target_row.get("company_name") or "").strip()
                    if target_name:
                        patch["contacto_nombre"] = target_name
                await repo.update_opportunity(
                    organizacion_id=cluster.organizacion_id,
                    oportunidad_id=opportunity_id,
                    payload=patch,
                )
                opportunities_moved += 1
            if len(rows) < limit:
                break
            offset += limit

        await repo.update_persona(
            organizacion_id=cluster.organizacion_id,
            persona_id=source_id,
            payload={
                "estado": "fusionado",
                "notas": f"Fusionado automáticamente con {canonical}",
                "metadata": {
                    **(source_row.get("metadata") if isinstance(source_row.get("metadata"), dict) else {}),
                    "merged_into_persona_id": str(canonical),
                    "merge_status": "archived",
                    "merge_reason": "dedupe_cleanup",
                },
            },
        )
        await repo.mark_persona_merged(
            organizacion_id=cluster.organizacion_id,
            persona_id=source_id,
            merged_into_persona_id=canonical,
            merge_metadata={
                "merge_reason": "dedupe_cleanup",
                "merged_into_persona_id": str(canonical),
                "source_persona_id": str(source_id),
                "opportunities_moved": opportunities_moved,
            },
        )
        print(f"[OK] personas {source_id} -> {canonical} ({cluster.key_type}: {cluster.key_value})")
        merged += 1
        target_row = await repo.get_persona_by_id(persona_id=str(canonical)) or target_row
    return {"merged": merged, "canonical": str(canonical), "count": len(ids)}


async def _merge_persona_cluster(repo: CRMRepository, cluster: Cluster, *, dry_run: bool) -> dict[str, Any]:
    return await _merge_persona_cluster_impl(repo, cluster, dry_run=dry_run)


async def _merge_account_cluster(repo: CRMRepository, cluster: Cluster, *, dry_run: bool) -> dict[str, Any]:
    ids = cluster.ids
    if len(ids) < 2:
        return {"merged": 0}
    canonical = ids[0]
    merged = 0
    for source_id in ids[1:]:
        if dry_run:
            print(f"[DRY-RUN] cuentas {source_id} -> {canonical} ({cluster.key_type}: {cluster.key_value})")
            merged += 1
            continue
        await repo.merge_account(
            organizacion_id=cluster.organizacion_id,
            source_account_id=source_id,
            target_account_id=canonical,
            merge_metadata={
                "merge_reason": "dedupe_cleanup",
                "duplicate_key_type": cluster.key_type,
                "duplicate_key_value": cluster.key_value,
                "source_cuenta_id": str(source_id),
                "target_cuenta_id": str(canonical),
            },
        )
        merged += 1
        print(f"[OK] cuentas {source_id} -> {canonical} ({cluster.key_type}: {cluster.key_value})")
    return {"merged": merged, "canonical": str(canonical), "count": len(ids)}


async def main() -> int:
    parser = argparse.ArgumentParser(description="Audita y consolida duplicados de CRM.")
    parser.add_argument("--apply", action="store_true", help="Ejecuta la consolidación.")
    parser.add_argument(
        "--entity",
        choices=("both", "personas", "cuentas"),
        default="both",
        help="Limita la ejecución a personas, cuentas o ambas entidades.",
    )
    parser.add_argument("--limit-clusters", type=int, default=0, help="Límite opcional de clusters a procesar.")
    args = parser.parse_args()

    repo = CRMRepository()
    if args.entity in {"both", "personas"}:
        personas = await _fetch_all_rows(
            repo,
            path="/rest/v1/personas",
            select=(
                "id,organizacion_id,creado_en,estado,archived_at,merged_into_persona_id,"
                "correo_principal,correo_secundario,correo_institucional,correo_personal_3,correo,"
                "telefono_principal_e164,telefono_movil_1_e164,telefono_secundario_e164,telefono_movil_2_e164,"
                "telefono_empresa_1_e164,telefono_empresa_2_e164"
            ),
            filters={
                "archived_at": "is.null",
                "merged_into_persona_id": "is.null",
                "estado": "neq.fusionado",
            },
        )
        persona_clusters = _build_clusters("personas", personas)
        print(f"Personas activas: {len(personas)}")
        print(f"Clusters de personas: {len(persona_clusters)}")
        if not args.apply:
            for cluster in persona_clusters[: args.limit_clusters or None]:
                print(f"[AUDIT] personas org={cluster.organizacion_id} ids={len(cluster.ids)} canonical={cluster.ids[0]}")
        else:
            for index, cluster in enumerate(persona_clusters, start=1):
                if args.limit_clusters and index > args.limit_clusters:
                    break
                await _merge_persona_cluster(repo, cluster, dry_run=False)

    if args.entity in {"both", "cuentas"}:
        cuentas = await _fetch_all_rows(
            repo,
            path="/rest/v1/cuentas",
            select=(
                "id,organizacion_id,creado_en,estado,archived_at,merged_into_cuenta_id,"
                "correo_principal,correo_secundario,correo,email,"
                "telefono_principal_e164,telefono_secundario_e164,telefono,rfc"
            ),
            filters={
                "archived_at": "is.null",
                "merged_into_cuenta_id": "is.null",
                "estado": "neq.fusionado",
            },
        )
        account_clusters = _build_clusters("cuentas", cuentas)
        print(f"Cuentas activas: {len(cuentas)}")
        print(f"Clusters de cuentas: {len(account_clusters)}")
        if not args.apply:
            for cluster in account_clusters[: args.limit_clusters or None]:
                print(f"[AUDIT] cuentas org={cluster.organizacion_id} ids={len(cluster.ids)} canonical={cluster.ids[0]}")
        else:
            for index, cluster in enumerate(account_clusters, start=1):
                if args.limit_clusters and index > args.limit_clusters:
                    break
                await _merge_account_cluster(repo, cluster, dry_run=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
