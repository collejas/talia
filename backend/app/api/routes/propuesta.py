"""Rutas dedicadas a la propuesta Tal-IA."""

from typing import Sequence

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, EmailStr, Extra, Field

from app.services.propuesta_pdf import PropuestaDocument, render_propuesta_pdf
from app.services import EmailSendError, send_email
from app.services.tenant_runtime import MASTER_ORGANIZACION_ID, get_mail_runtime_settings

router = APIRouter(prefix="/propuesta", tags=["propuesta"])


class TableRowPayload(BaseModel):
    label: str
    cells: list[str]

    class Config:
        extra = Extra.forbid


class ProposalTablePayload(BaseModel):
    column_headers: list[str] | None = Field(default=None, alias="columnHeaders")
    renta_rows: list[TableRowPayload] | None = Field(default=None, alias="rentaRows")
    configuracion_rows: list[TableRowPayload] | None = Field(
        default=None,
        alias="configuracionRows",
    )

    class Config:
        allow_population_by_field_name = True


def _extract_payload_rows(rows: list[TableRowPayload] | None) -> list[dict[str, Sequence[str]]] | None:
    if not rows:
        return None
    return [row.dict() for row in rows]


def _normalize_proposal_payload(payload: ProposalTablePayload | None) -> dict:
    if not payload:
        return {"column_headers": None, "renta_rows": None, "configuracion_rows": None}
    return {
        "column_headers": payload.column_headers,
        "renta_rows": _extract_payload_rows(payload.renta_rows),
        "configuracion_rows": _extract_payload_rows(payload.configuracion_rows),
    }


def _build_document_response(document: PropuestaDocument) -> Response:
    headers = {
        "Content-Disposition": f'attachment; filename="{document.filename}"',
    }
    return Response(content=document.content, media_type="application/pdf", headers=headers)


@router.get("/tal-ia/pdf", response_class=Response, include_in_schema=True)
async def download_propuesta_pdf() -> Response:
    """Devuelve la propuesta Tal-IA como PDF listo para descargar."""

    document = await render_propuesta_pdf()
    return _build_document_response(document)


@router.post("/tal-ia/pdf", response_class=Response, include_in_schema=True)
async def download_propuesta_pdf_with_data(
    payload: ProposalTablePayload | None = None,
) -> Response:
    """Genera la propuesta Tal-IA con datos personalizados."""

    document = await render_propuesta_pdf(**_normalize_proposal_payload(payload))
    return _build_document_response(document)


class ProposalEmailPayload(BaseModel):
    recipients: list[EmailStr]
    subject: str = "Propuesta Tal-IA"
    message: str | None = None
    proposal: ProposalTablePayload | None = None

    class Config:
        allow_population_by_field_name = True


@router.post("/tal-ia/email", include_in_schema=True)
async def email_propuesta(payload: ProposalEmailPayload) -> dict[str, str]:
    """Envía la propuesta Tal-IA como PDF adjunto."""

    document = await render_propuesta_pdf(**_normalize_proposal_payload(payload.proposal))
    mail_settings = await get_mail_runtime_settings(organizacion_id=MASTER_ORGANIZACION_ID)
    try:
        message_id = send_email(
            subject=payload.subject,
            body_text=payload.message or "Adjunto encontrarás la propuesta Tal-IA.",
            recipients=payload.recipients,
            attachments=[
                {
                    "filename": document.filename,
                    "content": document.content,
                    "maintype": "application",
                    "subtype": "pdf",
                },
            ],
            mail_settings=mail_settings,
        )
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"message_id": message_id}
