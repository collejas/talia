"""Rutas dedicadas a la propuesta Tal-IA."""

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, EmailStr

from app.services.propuesta_pdf import render_propuesta_pdf
from app.services import EmailSendError, send_email
from app.services.tenant_runtime import MASTER_ORGANIZACION_ID, get_mail_runtime_settings

router = APIRouter(prefix="/propuesta", tags=["propuesta"])


@router.get("/tal-ia/pdf", response_class=Response, include_in_schema=True)
async def download_propuesta_pdf() -> Response:
    """Devuelve la propuesta Tal-IA como PDF listo para descargar."""

    document = await render_propuesta_pdf()
    headers = {
        "Content-Disposition": f'attachment; filename="{document.filename}"',
    }
    return Response(content=document.content, media_type="application/pdf", headers=headers)


class ProposalEmailPayload(BaseModel):
    recipients: list[EmailStr]
    subject: str = "Propuesta Tal-IA"
    message: str | None = None


@router.post("/tal-ia/email", include_in_schema=True)
async def email_propuesta(payload: ProposalEmailPayload) -> dict[str, str]:
    """Envía la propuesta Tal-IA como PDF adjunto."""

    document = await render_propuesta_pdf()
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
