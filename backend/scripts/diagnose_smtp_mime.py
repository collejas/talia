"""Diagnostica el MIME SMTP generado por la app y lo compara con un .eml externo.

Uso:

  poetry run python scripts/diagnose_smtp_mime.py \
    --organizacion-id 00000000-0000-0000-0000-000000000001 \
    --to collejas1@gmail.com \
    --subject "SMTP diag" \
    --body "ASCII body" \
    --output-dir /tmp/talia-smtp-diag

Opcionalmente, compara contra un .eml exportado desde Roundcube o Thunderbird:

  poetry run python scripts/diagnose_smtp_mime.py \
    --organizacion-id ... \
    --compare-with /tmp/roundcube.eml
"""

from __future__ import annotations

import argparse
import asyncio
import difflib
import smtplib
import ssl
from dataclasses import replace
from email import policy
from email.utils import make_msgid
from pathlib import Path
from uuid import UUID

from app.services.email import _build_smtp_email_message
from app.services.tenant_runtime import get_mail_runtime_settings


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _write_bytes(output_dir: Path, filename: str, content: bytes) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / filename
    path.write_bytes(content)
    return path


def _diagnostic_message_id(username: str | None) -> str:
    domain = (username or "talia.mx").split("@")[-1].strip() or "talia.mx"
    return make_msgid(domain=domain)


async def _build_raw_eml(
    *,
    organizacion_id: UUID,
    to_email: str,
    subject: str,
    body: str,
) -> tuple[str, bytes, str]:
    mail = await get_mail_runtime_settings(organizacion_id=organizacion_id)
    message = _build_smtp_email_message(
        message_id=_diagnostic_message_id(mail.username),
        subject=subject,
        body_text=body,
        body_html=None,
        recipients=[to_email],
        attachments=(),
        headers={},
        mail_settings=replace(mail, from_name=mail.from_name),
    )
    wire_bytes = message.as_bytes(policy=policy.SMTP)
    return str(message), wire_bytes, wire_bytes.decode("utf-8", errors="replace")


async def _send_raw_message(
    *,
    organizacion_id: UUID,
    to_email: str,
    subject: str,
    body: str,
) -> tuple[str, bytes, str]:
    mail = await get_mail_runtime_settings(organizacion_id=organizacion_id)
    message = _build_smtp_email_message(
        message_id=_diagnostic_message_id(mail.username),
        subject=subject,
        body_text=body,
        body_html=None,
        recipients=[to_email],
        attachments=(),
        headers={},
        mail_settings=replace(mail, from_name=mail.from_name),
    )
    wire_bytes = message.as_bytes(policy=policy.SMTP)
    smtp_host = (mail.outgoing_server or "").strip()
    smtp_port = mail.outgoing_port_smtp or 587
    username = (mail.username or "").strip()
    password = mail.password

    if not smtp_host or not username or not password:
        raise RuntimeError("Configuración SMTP incompleta para la prueba de diagnóstico.")

    def _deliver() -> None:
        context = ssl.create_default_context()
        if mail.use_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=10) as server:
                server.login(username, password)
                server.sendmail(username, [to_email], wire_bytes)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                if mail.use_tls:
                    server.starttls(context=context)
                server.login(username, password)
                server.sendmail(username, [to_email], wire_bytes)

    await asyncio.to_thread(_deliver)
    return message["Message-ID"] or "", wire_bytes, wire_bytes.decode("utf-8", errors="replace")


def _write_text(output_dir: Path, eml_name: str, eml_content: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    eml_path = output_dir / eml_name
    eml_path.write_text(eml_content, encoding="utf-8")
    return eml_path


def main() -> int:
    parser = argparse.ArgumentParser(description="SMTP MIME diagnostic for Tal-IA")
    parser.add_argument("--organizacion-id", required=True)
    parser.add_argument("--to", required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--compare-with", help="Path to a Roundcube/Thunderbird .eml file")
    parser.add_argument("--send", action="store_true", help="Send the message via SMTP after generating it")
    args = parser.parse_args()

    organizacion_id = UUID(args.organizacion_id)
    output_dir = Path(args.output_dir)

    if args.send:
        message_id, wire_bytes, eml_content = asyncio.run(
            _send_raw_message(
                organizacion_id=organizacion_id,
                to_email=args.to,
                subject=args.subject,
                body=args.body,
            )
        )
        print(f"Sent: {message_id}")
    else:
        _, wire_bytes, eml_content = asyncio.run(
            _build_raw_eml(
                organizacion_id=organizacion_id,
                to_email=args.to,
                subject=args.subject,
                body=args.body,
            )
        )

    generated_path = _write_bytes(output_dir, "app-generated.eml", wire_bytes)
    print(f"Generated: {generated_path}")

    if args.compare_with:
        compare_path = Path(args.compare_with)
        compare_content = _read_text(compare_path)
        generated_lines = eml_content.splitlines(keepends=True)
        compare_lines = compare_content.splitlines(keepends=True)
        diff = "".join(
            difflib.unified_diff(
                compare_lines,
                generated_lines,
                fromfile=str(compare_path),
                tofile=str(generated_path),
            )
        )
        diff_path = _write_text(output_dir, "mime.diff", diff or "No diff\n")
        print(f"Diff: {diff_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
