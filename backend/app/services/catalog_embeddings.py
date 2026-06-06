"""Servicios para indexar el catálogo en la tabla de embeddings."""

from __future__ import annotations

from dataclasses import dataclass
import json
from collections import defaultdict
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal, Mapping, Sequence
from time import monotonic
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import tenant_runtime
from app.services.openai import get_openai_client

logger = get_logger("app.services.catalog_embeddings")

_TRIVIAL_QUERY_TOKENS = {
    "ok",
    "oka",
    "vale",
    "listo",
    "si",
    "sí",
    "no",
    "hola",
    "gracias",
}
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\+?\d[\d\-\s]{7,}\d")


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _truncate(value: str, max_length: int = 400) -> str:
    if len(value) <= max_length:
        return value
    return value[:max_length].rstrip() + "..."


def _metadata_summary(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        try:
            serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError):
            serialized = str(value)
    else:
        serialized = str(value)
    return _safe_text(_truncate(serialized))


def _serialize_metadata_value(value: Any) -> Any | None:
    if value is None:
        return None
    if isinstance(value, (str, bool, int, float)):
        if isinstance(value, float) and not (value == value and value != float("inf") and value != float("-inf")):
            return str(value)
        return value
    if isinstance(value, Decimal):
        return float(value)
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return str(value)


def _resource_block(resources: Sequence[Mapping[str, Any]]) -> str | None:
    lines: list[str] = []
    for resource in resources:
        label = _safe_text(resource.get("tipo")) or _safe_text(resource.get("objeto_type")) or "Recurso"
        status = "Activo" if resource.get("activo") else "Inactivo"
        description = _safe_text(resource.get("descripcion"))
        url = _safe_text(resource.get("url"))
        parts = [f"{label.title()} ({status})"]
        if description:
            parts.append(description)
        if url:
            parts.append(f"URL: {url}")
        if parts:
            lines.append(" - ".join(parts))
    return "\n".join(lines) if lines else None


@dataclass
class CatalogDocumentMatch:
    entity_type: str
    entity_id: UUID | None
    contenido: str
    metadata: dict[str, Any]
    similarity: float | None


def _coerce_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _coerce_similarity(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class CatalogEmbeddingService:
    """Orquesta la creación de embeddings y el upsert en Supabase."""

    def __init__(self, repo: CRMRepository) -> None:
        self._repo = repo
        self._model = settings.embeddings_model or "text-embedding-3-small"
        self._query_cache_enabled = bool(settings.catalog_query_embedding_cache_enabled)
        self._query_cache_ttl = int(settings.catalog_query_embedding_cache_ttl_seconds)
        self._query_cache_max_entries = int(settings.catalog_query_embedding_cache_max_entries)
        self._query_embedding_cache: dict[tuple[str, str, str], tuple[float, list[float]]] = {}

    async def reindex_catalog(
        self,
        organizacion_id: UUID,
        *,
        include_inactive: bool = False,
        limit: int = 500,
        resources_limit: int = 1000,
    ) -> None:
        """Reindexa todas las entidades relevantes del catálogo por tenant."""
        logger.info(
            "vector_store.reindex.start",
            extra={"organizacion_id": str(organizacion_id), "limit": limit},
        )
        resource_rows = await self._repo.list_recursos_media(
            organizacion_id=organizacion_id, limit=resources_limit
        )
        resource_map = self._group_resources(resource_rows)

        processed_entity_ids: dict[str, list[str]] = {
            "linea": [],
            "familia": [],
            "modelo": [],
            "producto": [],
        }

        total = 0

        lineas = await self._repo.list_lineas_de_negocio(
            organizacion_id=organizacion_id, include_inactive=include_inactive, limit=limit
        )
        for linea in lineas:
            entity_id = linea.get("id")
            if entity_id:
                processed_entity_ids["linea"].append(str(entity_id))
            await self._index_linea(linea, organizacion_id, resource_map)
            total += 1

        familias = await self._repo.list_familias_productos(
            organizacion_id=organizacion_id, include_inactive=include_inactive, limit=limit
        )
        for familia in familias:
            entity_id = familia.get("id")
            if entity_id:
                processed_entity_ids["familia"].append(str(entity_id))
            await self._index_familia(familia, organizacion_id, resource_map)
            total += 1

        modelos = await self._repo.list_modelos_productos(
            organizacion_id=organizacion_id, include_inactive=include_inactive, limit=limit
        )
        for modelo in modelos:
            entity_id = modelo.get("id")
            if entity_id:
                processed_entity_ids["modelo"].append(str(entity_id))
            await self._index_modelo(modelo, organizacion_id, resource_map)
            total += 1

        catalog_items = await self._repo.list_catalog_items(
            organizacion_id=organizacion_id,
            include_inactive=include_inactive,
            limit=limit,
        )
        for item in catalog_items:
            entity_id = item.get("id")
            if entity_id:
                processed_entity_ids["producto"].append(str(entity_id))
            await self._index_producto(item, organizacion_id, resource_map)
            total += 1

        await self._cleanup_deleted_entities(organizacion_id, processed_entity_ids)

        logger.info(
            "vector_store.reindex.complete",
            extra={"organizacion_id": str(organizacion_id), "processed": total},
        )

    async def reindex_entity(
        self,
        organizacion_id: UUID,
        *,
        entity_type: Literal["linea", "familia", "modelo", "producto"],
        entity_id: UUID,
    ) -> Literal["indexed", "deleted", "not_found", "inactive"]:
        resource_map = self._group_resources(
            await self._repo.list_recursos_media(
                organizacion_id=organizacion_id,
                objeto_type=entity_type,
                objeto_ids=[entity_id],
                limit=200,
            )
        )

        if entity_type == "linea":
            row = await self._repo.get_linea_de_negocio(
                organizacion_id=organizacion_id,
                linea_id=entity_id,
            )
            if not row:
                await self._repo.delete_catalog_document_embedding_entity(
                    organizacion_id=organizacion_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                )
                return "not_found"
            if row.get("activo") is False:
                await self._repo.delete_catalog_document_embedding_entity(
                    organizacion_id=organizacion_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                )
                return "inactive"
            await self._index_linea(row, organizacion_id, resource_map)
            return "indexed"

        if entity_type == "familia":
            row = await self._repo.get_familia_producto(
                organizacion_id=organizacion_id,
                familia_id=entity_id,
            )
            if not row:
                await self._repo.delete_catalog_document_embedding_entity(
                    organizacion_id=organizacion_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                )
                return "not_found"
            if row.get("activo") is False:
                await self._repo.delete_catalog_document_embedding_entity(
                    organizacion_id=organizacion_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                )
                return "inactive"
            await self._index_familia(row, organizacion_id, resource_map)
            return "indexed"

        if entity_type == "modelo":
            row = await self._repo.get_modelo_producto(
                organizacion_id=organizacion_id,
                modelo_id=entity_id,
            )
            if not row:
                await self._repo.delete_catalog_document_embedding_entity(
                    organizacion_id=organizacion_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                )
                return "not_found"
            if row.get("activo") is False:
                await self._repo.delete_catalog_document_embedding_entity(
                    organizacion_id=organizacion_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                )
                return "inactive"
            await self._index_modelo(row, organizacion_id, resource_map)
            return "indexed"

        row = await self._repo.get_catalog_item(
            organizacion_id=organizacion_id,
            item_id=entity_id,
        )
        if not row:
            await self._repo.delete_catalog_document_embedding_entity(
                organizacion_id=organizacion_id,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            return "not_found"
        if row.get("activo") is False:
            await self._repo.delete_catalog_document_embedding_entity(
                organizacion_id=organizacion_id,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            return "inactive"
        await self._index_producto(row, organizacion_id, resource_map)
        return "indexed"

    async def _cleanup_deleted_entities(
        self,
        organizacion_id: UUID,
        processed_entity_ids: Mapping[str, Sequence[str]],
    ) -> None:
        for entity_type in ("linea", "familia", "modelo", "producto"):
            entity_ids = processed_entity_ids.get(entity_type) or []
            await self._repo.delete_catalog_document_embeddings_missing(
                organizacion_id=organizacion_id,
                entity_type=entity_type,
                keep_entity_ids=entity_ids or None,
            )

    async def _index_linea(
        self,
        row: Mapping[str, Any],
        organizacion_id: UUID,
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> None:
        entity_id = row.get("id")
        if not entity_id:
            return
        text = self._build_linea_text(row, resource_map)
        metadata = {
            "source": "lineas_de_negocio",
            "activo": row.get("activo", True),
            "nombre": _serialize_metadata_value(row.get("nombre")),
        }
        await self._index_entity(
            organizacion_id,
            "linea",
            entity_id,
            text,
            metadata,
        )

    async def _index_familia(
        self,
        row: Mapping[str, Any],
        organizacion_id: UUID,
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> None:
        entity_id = row.get("id")
        if not entity_id:
            return
        text = self._build_familia_text(row, resource_map)
        metadata = {
            "source": "familias_productos",
            "linea_id": _serialize_metadata_value(row.get("linea_id")),
            "activo": row.get("activo", True),
            "nombre": _serialize_metadata_value(row.get("nombre")),
        }
        await self._index_entity(
            organizacion_id,
            "familia",
            entity_id,
            text,
            metadata,
        )

    async def _index_modelo(
        self,
        row: Mapping[str, Any],
        organizacion_id: UUID,
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> None:
        entity_id = row.get("id")
        if not entity_id:
            return
        text = self._build_modelo_text(row, resource_map)
        metadata = {
            "source": "modelos_productos",
            "activo": row.get("activo", True),
            "nombre": _serialize_metadata_value(row.get("nombre")),
        }
        await self._index_entity(
            organizacion_id,
            "modelo",
            entity_id,
            text,
            metadata,
        )

    async def _index_producto(
        self,
        row: Mapping[str, Any],
        organizacion_id: UUID,
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> None:
        entity_id = row.get("id")
        if not entity_id:
            return
        text = self._build_producto_text(row, resource_map)
        metadata = {
            "source": "catalog_items",
            "slug": _serialize_metadata_value(row.get("slug")),
            "tipo": _serialize_metadata_value(row.get("tipo")),
            "linea_id": _serialize_metadata_value(row.get("linea_id")),
            "familia_id": _serialize_metadata_value(row.get("familia_id")),
            "modelo_id": _serialize_metadata_value(row.get("modelo_id")),
            "precio_base": _serialize_metadata_value(row.get("precio_base")),
            "moneda": _serialize_metadata_value(row.get("moneda")),
            "requiere_factura": _serialize_metadata_value(row.get("requiere_factura")),
            "nombre": _serialize_metadata_value(row.get("nombre")),
            "metadata": _serialize_metadata_value(row.get("metadata")),
        }
        resources = self._resources_for("producto", entity_id, resource_map)
        if resources:
            ids = [
                serialized
                for item in resources
                if (serialized := _serialize_metadata_value(item.get("id"))) is not None
            ]
            if ids:
                metadata["resource_ids"] = ids
        await self._index_entity(
            organizacion_id,
            "producto",
            entity_id,
            text,
            metadata,
        )

    async def _index_entity(
        self,
        organizacion_id: UUID,
        entity_type: str,
        entity_id: Any,
        contenido: str | None,
        metadata: Mapping[str, Any] | None,
    ) -> None:
        if not contenido:
            return
        text = str(contenido).strip()
        if not text:
            return
        embedding = await self._create_embedding(text, organizacion_id)
        payload = {
            "organizacion_id": str(organizacion_id),
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "contenido": text,
            "embedding": json.dumps(embedding, separators=(",", ":"), ensure_ascii=False),
            "metadata": self._clean_metadata(metadata),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }
        await self._repo.upsert_catalog_document_embeddings(rows=[payload])

    async def _create_embedding(self, text: str, organizacion_id: UUID | None = None) -> Sequence[float]:
        try:
            api_key = await tenant_runtime.get_openai_api_key(organizacion_id=organizacion_id)
            client = get_openai_client(api_key=api_key)
            response = await client.embeddings.create(input=text, model=self._model)
        except Exception as exc:  # pragma: no cover - depende del proveedor externo
            logger.exception(
                "vector_store.embedding_failed",
                extra={"model": self._model, "error": str(exc)},
            )
            raise CRMRepositoryError("embedding_error") from exc
        data = getattr(response, "data", [])
        if not data or not isinstance(data, Sequence):
            raise CRMRepositoryError("embedding_missing_data")
        embedding_entry = data[0]
        embedding_value = getattr(embedding_entry, "embedding", None)
        if not isinstance(embedding_value, Sequence):
            raise CRMRepositoryError("embedding_invalid")
        return list(embedding_value)

    async def query_documents(
        self,
        organizacion_id: UUID,
        *,
        query: str,
        limit: int = 5,
        user_id: str | None = None,
        channel: str | None = None,
        reason: str | None = None,
    ) -> list[CatalogDocumentMatch]:
        prompt = query.strip()
        if not prompt:
            return []
        embedding = await self._get_or_create_query_embedding(prompt, organizacion_id)
        rows = await self._repo.search_catalog_document_embeddings(
            organizacion_id=organizacion_id,
            embedding=embedding,
            limit=limit,
        )
        matches: list[CatalogDocumentMatch] = []
        for row in rows:
            matches.append(
                CatalogDocumentMatch(
                    entity_type=str(row.get("entity_type") or ""),
                    entity_id=_coerce_uuid(row.get("entity_id")),
                    contenido=str(row.get("contenido") or ""),
                    metadata=self._clean_metadata(
                        row.get("metadata") if isinstance(row.get("metadata"), Mapping) else {}
                    ),
                    similarity=_coerce_similarity(row.get("similarity")),
                )
            )
        await self.audit_event(
            organizacion_id,
            "query",
            usuario_id=user_id,
            canal=channel,
            metadata={
                "query": prompt,
                "matches": len(matches),
                "embedding_cache_eligible": self._is_query_cache_eligible(prompt),
                "reason": reason,
            },
        )
        return matches

    def _cache_key(self, organizacion_id: UUID, prompt: str) -> tuple[str, str, str]:
        normalized = " ".join(prompt.lower().split())
        return (str(organizacion_id), self._model, normalized)

    @staticmethod
    def _is_query_cache_eligible(prompt: str) -> bool:
        normalized = " ".join(prompt.strip().lower().split())
        if len(normalized) < 3:
            return False
        if normalized in _TRIVIAL_QUERY_TOKENS:
            return False
        if _EMAIL_RE.search(normalized):
            return False
        if _PHONE_RE.search(normalized):
            return False
        return True

    def _purge_expired_cache_entries(self) -> None:
        if not self._query_embedding_cache:
            return
        now = monotonic()
        stale_keys = [
            key
            for key, (expires_at, _) in self._query_embedding_cache.items()
            if expires_at <= now
        ]
        for key in stale_keys:
            self._query_embedding_cache.pop(key, None)

    async def _get_or_create_query_embedding(
        self,
        prompt: str,
        organizacion_id: UUID,
    ) -> Sequence[float]:
        if not self._query_cache_enabled or not self._is_query_cache_eligible(prompt):
            return await self._create_embedding(prompt, organizacion_id)

        self._purge_expired_cache_entries()
        key = self._cache_key(organizacion_id, prompt)
        now = monotonic()
        entry = self._query_embedding_cache.get(key)
        if entry:
            expires_at, embedding = entry
            if expires_at > now:
                return list(embedding)
            self._query_embedding_cache.pop(key, None)

        embedding = list(await self._create_embedding(prompt, organizacion_id))
        self._query_embedding_cache[key] = (now + self._query_cache_ttl, embedding)
        if len(self._query_embedding_cache) > self._query_cache_max_entries:
            oldest_key = min(
                self._query_embedding_cache.items(),
                key=lambda item: item[1][0],
            )[0]
            self._query_embedding_cache.pop(oldest_key, None)
        return embedding

    async def audit_event(
        self,
        organizacion_id: UUID,
        tipo: Literal["reindex", "query"],
        *,
        usuario_id: str | None = None,
        canal: str | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        await self._log_audit_event(
            organizacion_id,
            tipo,
            usuario_id=usuario_id,
            canal=canal,
            metadata=metadata,
        )

    async def _log_audit_event(
        self,
        organizacion_id: UUID,
        tipo: Literal["reindex", "query"],
        *,
        usuario_id: str | None = None,
        canal: str | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "tipo": tipo,
            "usuario_id": str(usuario_id) if usuario_id else None,
            "canal": canal,
            "metadata": self._clean_metadata(metadata) if metadata else {},
        }
        try:
            await self._repo.create_catalog_embeddings_audit(rows=[payload])
        except CRMRepositoryError as exc:
            logger.warning(
                "vector_store.audit_log_failed",
                extra={"organizacion_id": str(organizacion_id), "error": str(exc)},
            )

    @staticmethod
    def _clean_metadata(metadata: Mapping[str, Any] | None) -> dict[str, Any]:
        if not metadata:
            return {}
        cleaned: dict[str, Any] = {}
        for key, value in metadata.items():
            clean_value = _serialize_metadata_value(value)
            if clean_value is not None:
                cleaned[str(key)] = clean_value
        return cleaned

    @staticmethod
    def _group_resources(
        rows: Sequence[Mapping[str, Any]]
    ) -> Mapping[tuple[str, str], list[Mapping[str, Any]]]:
        grouped: dict[tuple[str, str], list[Mapping[str, Any]]] = defaultdict(list)
        for entry in rows:
            objeto_type = _safe_text(entry.get("objeto_type"))
            objeto_id = entry.get("objeto_id")
            if not objeto_type or not objeto_id:
                continue
            key = (objeto_type, str(objeto_id))
            grouped[key].append(entry)
        return grouped

    @staticmethod
    def _resources_for(
        objeto_type: str,
        objeto_id: Any,
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> Sequence[Mapping[str, Any]]:
        return resource_map.get((objeto_type, str(objeto_id)), [])

    def _build_linea_text(
        self,
        row: Mapping[str, Any],
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> str:
        sections = []
        name = _safe_text(row.get("nombre"))
        if name:
            sections.append(f"Línea de negocio: {name}")
        description = _safe_text(row.get("descripcion"))
        if description:
            sections.append(f"Descripción: {description}")
        activo = row.get("activo")
        if activo is not None:
            sections.append(f"Activo: {'sí' if activo else 'no'}")
        summary = _metadata_summary(row.get("metadata"))
        if summary:
            sections.append(f"Metadata: {summary}")
        resources = self._resources_for("linea", row.get("id"), resource_map)
        resource_block = _resource_block(resources)
        if resource_block:
            sections.append(f"Recursos relacionados:\n{resource_block}")
        return "\n".join(sections)

    def _build_familia_text(
        self,
        row: Mapping[str, Any],
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> str:
        sections = []
        name = _safe_text(row.get("nombre"))
        if name:
            sections.append(f"Familia: {name}")
        description = _safe_text(row.get("descripcion"))
        if description:
            sections.append(f"Descripción: {description}")
        linea_id = row.get("linea_id")
        if linea_id:
            sections.append(f"Línea asociada: {linea_id}")
        activo = row.get("activo")
        if activo is not None:
            sections.append(f"Activo: {'sí' if activo else 'no'}")
        summary = _metadata_summary(row.get("metadata"))
        if summary:
            sections.append(f"Metadata: {summary}")
        resources = self._resources_for("familia", row.get("id"), resource_map)
        resource_block = _resource_block(resources)
        if resource_block:
            sections.append(f"Recursos relacionados:\n{resource_block}")
        return "\n".join(sections)

    def _build_modelo_text(
        self,
        row: Mapping[str, Any],
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> str:
        sections = []
        name = _safe_text(row.get("nombre"))
        if name:
            sections.append(f"Modelo: {name}")
        description = _safe_text(row.get("descripcion"))
        if description:
            sections.append(f"Descripción: {description}")
        activo = row.get("activo")
        if activo is not None:
            sections.append(f"Activo: {'sí' if activo else 'no'}")
        summary = _metadata_summary(row.get("metadata"))
        if summary:
            sections.append(f"Metadata: {summary}")
        resources = self._resources_for("modelo", row.get("id"), resource_map)
        resource_block = _resource_block(resources)
        if resource_block:
            sections.append(f"Recursos relacionados:\n{resource_block}")
        return "\n".join(sections)

    def _build_producto_text(
        self,
        row: Mapping[str, Any],
        resource_map: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
    ) -> str:
        sections = []
        nombre = _safe_text(row.get("nombre"))
        if nombre:
            sections.append(f"Producto: {nombre}")
        slug = _safe_text(row.get("slug"))
        if slug:
            sections.append(f"Slug: {slug}")
        tipo = _safe_text(row.get("tipo"))
        if tipo:
            sections.append(f"Tipo: {tipo}")
        description = _safe_text(row.get("descripcion"))
        if description:
            sections.append(f"Descripción: {description}")
        short_desc = _safe_text(row.get("descripcion_corta"))
        if short_desc:
            sections.append(f"Resumen corto: {short_desc}")
        long_desc = _safe_text(row.get("descripcion_larga"))
        if long_desc:
            sections.append(f"Descripción extendida: {long_desc}")
        unidad = _safe_text(row.get("unidad"))
        if unidad:
            sections.append(f"Unidad: {unidad}")
        precio = row.get("precio_base")
        moneda = _safe_text(row.get("moneda"))
        if precio is not None:
            price_text = f"{precio}"
            if moneda:
                price_text += f" {moneda}"
            sections.append(f"Precio base: {price_text}")
        impuestos_summary = _metadata_summary(row.get("impuestos"))
        if impuestos_summary:
            sections.append(f"Impuestos: {impuestos_summary}")
        estado = row.get("activo")
        if estado is not None:
            sections.append(f"Activo: {'sí' if estado else 'no'}")
        requiere_factura = row.get("requiere_factura")
        if requiere_factura is not None:
            sections.append(
                f"Requiere factura: {'sí' if requiere_factura else 'no'}"
            )
        linea = row.get("linea") or {}
        if linea:
            linea_name = _safe_text(linea.get("nombre"))
            if linea_name:
                sections.append(f"Línea de negocio: {linea_name}")
        familia = row.get("familia") or {}
        if familia:
            familia_name = _safe_text(familia.get("nombre"))
            if familia_name:
                sections.append(f"Familia: {familia_name}")
        modelo = row.get("modelo") or {}
        if modelo:
            modelo_name = _safe_text(modelo.get("nombre"))
            if modelo_name:
                sections.append(f"Modelo: {modelo_name}")
        joined_metadata: dict[str, Any] = {}
        for candidate in (
            row.get("metadata"),
            row.get("metadatos"),
            row.get("metadatos_extra"),
        ):
            if isinstance(candidate, dict):
                for key, value in candidate.items():
                    if value is not None:
                        joined_metadata[str(key)] = value
        if joined_metadata:
            summary = _safe_text(json.dumps(joined_metadata, ensure_ascii=False))
            if summary:
                sections.append(f"Metadata: {summary}")
        resources = self._resources_for("producto", row.get("id"), resource_map)
        resource_block = _resource_block(resources)
        if resource_block:
            sections.append(f"Recursos asociados:\n{resource_block}")
        return "\n".join(sections)
