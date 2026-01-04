"""Script CLI para reindexar el catálogo dentro de la vector store."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from uuid import UUID

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.logging import configure_logging, get_logger, resolve_log_level
from app.repositories.crm import CRMRepository
from app.services.catalog_embeddings import CatalogEmbeddingService

logger = get_logger("scripts.index_catalog")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recalcula todos los embeddings del catálogo para un tenant dado."
    )
    parser.add_argument(
        "--organizacion-id",
        required=True,
        help="UUID de la organización cuyas entidades deben reindexarse.",
    )
    parser.add_argument(
        "--include-inactive",
        action="store_true",
        help="Si se incluye, también se reindexan entidades marcadas como inactivas.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="Cantidad máxima de elementos que consulta por entidad (máx. 500).",
    )
    parser.add_argument(
        "--resources-limit",
        type=int,
        default=1000,
        help="Límite de recursos multimedia que se leen en cada ejecución.",
    )
    parser.add_argument(
        "--log-level",
        default="info",
        help="Nivel de logging (info, debug, warning, error).",
    )
    return parser.parse_args()


async def _run(
    organizacion_id: UUID,
    *,
    include_inactive: bool,
    limit: int,
    resources_limit: int,
) -> None:
    repo = CRMRepository()
    service = CatalogEmbeddingService(repo)
    await service.reindex_catalog(
        organizacion_id,
        include_inactive=include_inactive,
        limit=limit,
        resources_limit=resources_limit,
    )
    logger.info(
        "vector_store.reindex.success",
        extra={"organizacion_id": str(organizacion_id)},
    )


def main() -> None:
    args = parse_args()
    configure_logging(resolve_log_level(args.log_level))
    try:
        organizacion_id = UUID(args.organizacion_id)
    except ValueError as exc:
        logger.error(
            "vector_store.reindex.invalid_organizacion_id",
            extra={"value": args.organizacion_id},
        )
        raise SystemExit(1) from exc

    try:
        asyncio.run(
            _run(
                organizacion_id,
                include_inactive=args.include_inactive,
                limit=args.limit,
                resources_limit=args.resources_limit,
            )
        )
    except Exception:
        logger.exception(
            "vector_store.reindex.failed",
            extra={"organizacion_id": str(organizacion_id)},
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
