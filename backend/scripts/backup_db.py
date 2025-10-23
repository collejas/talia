#!/usr/bin/env python3
"""Herramienta para generar respaldos de la base de datos PostgreSQL."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import ParseResult, urlparse, urlunparse

try:  # pragma: no cover - scripts pueden usarse sin la dependencia instalada
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - la carga de .env es opcional
    load_dotenv = None  # type: ignore[assignment]


def _mask_database_url(url: str) -> str:
    """Regresa la URL de la base sin exponer la contraseña."""

    parsed = urlparse(url)
    if not parsed.hostname:
        return url

    username = parsed.username or ""
    hostname = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    userinfo = f"{username}@" if username else ""
    netloc = f"{userinfo}{hostname}{port}"
    masked: ParseResult = parsed._replace(netloc=netloc)
    return urlunparse(masked)


def _database_name_from_url(url: str) -> str:
    parsed = urlparse(url)
    database = parsed.path.lstrip("/") or "database"
    return database.replace("/", "_")


def _run_pg_dump(database_url: str, output_path: Path, extra_flags: Iterable[str]) -> None:
    cmd = [
        "pg_dump",
        f"--dbname={database_url}",
        "--no-owner",
        "--no-privileges",
        "--file",
        str(output_path),
        *extra_flags,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)  # noqa: PLW1510
    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        details = stderr or stdout or "pg_dump devolvió un código de error"
        raise RuntimeError(details)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Genera respaldos usando pg_dump. Por defecto crea un respaldo completo "
            "(estructura + datos) y otro con sólo la estructura."
        )
    )
    parser.add_argument(
        "--mode",
        choices=["all", "full", "schema"],
        default="all",
        help="Define qué respaldos generar. all (default) genera ambos.",
    )
    parser.add_argument(
        "--database-url",
        help="URL de conexión. Si se omite se usa la variable de entorno DATABASE_URL.",
    )
    parser.add_argument(
        "--output-dir",
        default="backups",
        help="Directorio donde guardar los archivos (default: backups).",
    )
    parser.add_argument(
        "--prefix",
        help="Prefijo para los nombres de archivo. Por defecto el nombre de la base.",
    )
    parser.add_argument(
        "--dotenv",
        help="Ruta al archivo .env a cargar antes de leer variables de entorno.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Reduce el output a sólo errores.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if load_dotenv is not None:
        dotenv_path = args.dotenv
        if dotenv_path:
            dotenv_file = Path(dotenv_path)
            if dotenv_file.exists():
                load_dotenv(dotenv_path)
        else:
            for candidate in (Path(".env"), Path("backend/.env")):
                if candidate.exists():
                    load_dotenv(candidate)

    database_url = args.database_url or os.getenv("DATABASE_URL")
    if not database_url:
        print(
            "[backup_db] ERROR: No se encontró DATABASE_URL. Usa --database-url o define la variable.",
            file=sys.stderr,
        )
        return 1

    if shutil.which("pg_dump") is None:
        print(
            "[backup_db] ERROR: pg_dump no está disponible en el PATH. Instala el cliente de PostgreSQL.",
            file=sys.stderr,
        )
        return 1

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    prefix = args.prefix or _database_name_from_url(database_url)
    masked_url = _mask_database_url(database_url)

    tasks: list[tuple[str, Path, list[str]]] = []
    if args.mode in {"all", "full"}:
        full_path = output_dir / f"{prefix}_{timestamp}_full.dump"
        tasks.append(("completo", full_path, ["--format=custom", "--compress=9"]))
    if args.mode in {"all", "schema"}:
        schema_path = output_dir / f"{prefix}_{timestamp}_schema.sql"
        tasks.append(("estructura", schema_path, ["--format=plain", "--schema-only"]))

    if not tasks:
        print("[backup_db] No hay tareas que ejecutar (revisa el modo).", file=sys.stderr)
        return 1

    for label, destination, flags in tasks:
        if not args.quiet:
            print(f"[backup_db] Generando respaldo {label} en {destination} (DB: {masked_url})")
        try:
            _run_pg_dump(database_url, destination, flags)
        except RuntimeError as exc:  # pragma: no cover - CLI
            print(
                f"[backup_db] ERROR al crear el respaldo {label}: {exc}",
                file=sys.stderr,
            )
            return 1

    if not args.quiet:
        print("[backup_db] Respaldo(s) generados correctamente.")
    return 0


if __name__ == "__main__":  # pragma: no cover - script manual
    sys.exit(main())
