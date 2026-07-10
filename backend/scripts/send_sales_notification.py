#!/usr/bin/env python3
"""Envía una notificación comercial por WhatsApp desde consola.

Este script evita depender del flujo CRM completo. Sirve para probar la plantilla
de vendedor directamente contra un número destino usando el runtime del tenant.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from uuid import UUID

try:  # pragma: no cover - ejecución local opcional con .env
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover
    load_dotenv = None  # type: ignore[assignment]

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.channels.whatsapp.service import TwilioSendResult, send_manual_message
from app.core.logging import configure_logging
from app.services import tenant_runtime


def _resolve_root(path: str) -> Path:
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return (Path(__file__).resolve().parents[2] / candidate).resolve()


def _parse_var_pair(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        raise argparse.ArgumentTypeError("Las variables deben tener formato CLAVE=VALOR")
    key, value = raw.split("=", 1)
    key = key.strip()
    value = value.strip()
    if not key:
        raise argparse.ArgumentTypeError("La clave de la variable no puede ir vacía")
    return key, value


def _build_template_variables(args: argparse.Namespace) -> dict[str, str]:
    variables = {
        "1": args.seller_name,
        "2": args.contact_name,
        "3": args.summary,
        "4": args.phone,
        "5": args.email,
        "6": args.company,
    }
    for raw_item in args.var or []:
        key, value = _parse_var_pair(raw_item)
        variables[key] = value
    return variables


async def _run(args: argparse.Namespace) -> int:
    organizacion_id = UUID(args.organizacion_id)
    whatsapp_settings = await tenant_runtime.get_whatsapp_runtime_settings(
        organizacion_id=organizacion_id,
        force_refresh=True,
    )

    template_name = args.template_name or whatsapp_settings.sales_template_name
    template_language = args.template_language or whatsapp_settings.sales_template_language or "es_MX"
    template_sid = args.template_sid or whatsapp_settings.sales_template_sid
    template_variables = _build_template_variables(args)

    if not template_name and not template_sid:
        print(
            "[send_sales_notification] ERROR: no hay template name ni template SID disponible.",
            file=sys.stderr,
        )
        return 1

    result: TwilioSendResult = await send_manual_message(
        to_number=args.to,
        template_sid=template_sid,
        template_name=template_name,
        template_language=template_language,
        template_variables=template_variables,
        organizacion_id=organizacion_id,
    )

    print(
        {
            "status": result.status,
            "provider": result.provider,
            "sid": result.sid,
            "error": result.error,
            "to": args.to,
            "template_name": template_name,
            "template_language": template_language,
            "template_sid": template_sid,
            "template_variables": template_variables,
        }
    )
    return 0 if result.status not in {"failed"} else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Envía una notificación comercial de prueba por WhatsApp."
    )
    parser.add_argument("--organizacion-id", required=True, help="UUID del tenant.")
    parser.add_argument("--to", required=True, help="Número destino en formato E.164.")
    parser.add_argument(
        "--template-name",
        default=None,
        help="Nombre de la plantilla de Meta. Si se omite, se usa la configuración del tenant.",
    )
    parser.add_argument(
        "--template-language",
        default=None,
        help="Idioma de la plantilla, por ejemplo es_MX. Si se omite, se usa la configuración del tenant.",
    )
    parser.add_argument(
        "--template-sid",
        default=None,
        help="SID de contenido si el tenant usa Twilio Content API.",
    )
    parser.add_argument("--seller-name", default="Vendedor de prueba", help="Variable 1.")
    parser.add_argument("--contact-name", default="Contacto de prueba", help="Variable 2.")
    parser.add_argument("--summary", default="Prueba de envío desde consola.", help="Variable 3.")
    parser.add_argument("--phone", default="+5210000000000", help="Variable 4.")
    parser.add_argument("--email", default="prueba@example.com", help="Variable 5.")
    parser.add_argument("--company", default="Sin empresa", help="Variable 6.")
    parser.add_argument(
        "--var",
        action="append",
        default=[],
        help="Sobrescribe una variable de plantilla con formato CLAVE=VALOR. Se puede repetir.",
    )
    parser.add_argument("--dotenv", type=str, default=None, help="Ruta opcional a .env.")
    args = parser.parse_args()

    if load_dotenv is not None:
        dotenv_path = args.dotenv
        if dotenv_path:
            candidate = _resolve_root(dotenv_path)
            if candidate.exists():
                load_dotenv(candidate)
        else:
            for candidate in (Path(".env"), Path("backend/.env")):
                if candidate.exists():
                    load_dotenv(candidate)

    configure_logging()

    return asyncio.run(_run(args))


if __name__ == "__main__":  # pragma: no cover - uso manual
    raise SystemExit(main())
