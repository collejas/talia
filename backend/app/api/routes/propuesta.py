"""Rutas dedicadas a la propuesta Tal-IA."""

from typing import Sequence

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.services.propuesta_pdf import (
    PropuestaDocument,
    render_propuesta_ejecutiva_pdf,
    render_propuesta_pdf,
)
from app.services import EmailSendError, send_email
from app.services.tenant_runtime import MASTER_ORGANIZACION_ID, get_mail_runtime_settings

router = APIRouter(prefix="/propuesta", tags=["propuesta"])


class TableRowPayload(BaseModel):
    label: str
    cells: list[str]

    model_config = ConfigDict(extra="forbid")


class HeroCardPayload(BaseModel):
    caption: str
    title: str
    description: str

    model_config = ConfigDict(extra="forbid")


class ProposalTablePayload(BaseModel):
    proposal_title: str | None = Field(default=None, alias="proposalTitle")
    proposal_subtitle: str | None = Field(default=None, alias="proposalSubtitle")
    hero_cards: list[HeroCardPayload] | None = Field(default=None, alias="heroCards")
    hero_intro_one: str | None = Field(default=None, alias="heroIntroOne")
    hero_intro_two: str | None = Field(default=None, alias="heroIntroTwo")
    mvp_title: str | None = Field(default=None, alias="mvpTitle")
    mvp_intro: str | None = Field(default=None, alias="mvpIntro")
    mvp_items: list[str] | None = Field(default=None, alias="mvpItems")
    mvp_timeline: str | None = Field(default=None, alias="mvpTimeline")
    mvp_validity: str | None = Field(default=None, alias="mvpValidity")
    secondary_contact_name: str | None = Field(default=None, alias="secondaryContactName")
    secondary_contact_phone: str | None = Field(default=None, alias="secondaryContactPhone")
    secondary_contact_email: str | None = Field(default=None, alias="secondaryContactEmail")
    column_headers: list[str] | None = Field(default=None, alias="columnHeaders")
    renta_rows: list[TableRowPayload] | None = Field(default=None, alias="rentaRows")
    configuracion_rows: list[TableRowPayload] | None = Field(
        default=None,
        alias="configuracionRows",
    )

    model_config = ConfigDict(populate_by_name=True)


def _extract_payload_rows(rows: list[TableRowPayload] | None) -> list[dict[str, Sequence[str]]] | None:
    if not rows:
        return None
    return [row.dict() for row in rows]


def _normalize_proposal_payload(payload: ProposalTablePayload | None) -> dict:
    if not payload:
        return {
            "proposal_title": None,
            "proposal_subtitle": None,
            "hero_cards": None,
            "hero_intro_one": None,
            "hero_intro_two": None,
            "mvp_title": None,
            "mvp_intro": None,
            "mvp_items": None,
            "mvp_timeline": None,
            "mvp_validity": None,
            "secondary_contact_name": None,
            "secondary_contact_phone": None,
            "secondary_contact_email": None,
            "column_headers": None,
            "renta_rows": None,
            "configuracion_rows": None,
        }
    return {
        "proposal_title": payload.proposal_title,
        "proposal_subtitle": payload.proposal_subtitle,
        "hero_cards": [card.dict() for card in payload.hero_cards] if payload.hero_cards else None,
        "hero_intro_one": payload.hero_intro_one,
        "hero_intro_two": payload.hero_intro_two,
        "mvp_title": payload.mvp_title,
        "mvp_intro": payload.mvp_intro,
        "mvp_items": payload.mvp_items,
        "mvp_timeline": payload.mvp_timeline,
        "mvp_validity": payload.mvp_validity,
        "secondary_contact_name": payload.secondary_contact_name,
        "secondary_contact_phone": payload.secondary_contact_phone,
        "secondary_contact_email": payload.secondary_contact_email,
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

    model_config = ConfigDict(populate_by_name=True)


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


class ExecutiveCityPayload(BaseModel):
    name: str
    amount: int

    model_config = ConfigDict(extra="forbid")


class ExecutiveProposalPayload(BaseModel):
    proposal_title: str | None = Field(default=None, alias="proposalTitle")
    strategic_intro_one: str | None = Field(default=None, alias="strategicIntroOne")
    strategic_intro_two: str | None = Field(default=None, alias="strategicIntroTwo")
    strategic_intro_three: str | None = Field(default=None, alias="strategicIntroThree")
    hero_cards: list[HeroCardPayload] | None = Field(default=None, alias="heroCards")
    corporate_items: list[str] | None = Field(default=None, alias="corporateItems")
    corporate_investment: int | None = Field(default=None, alias="corporateInvestment")
    city_items: list[str] | None = Field(default=None, alias="cityItems")
    cities: list[ExecutiveCityPayload] | None = None
    special_total: int | None = Field(default=None, alias="specialTotal")
    special_conditions: list[str] | None = Field(default=None, alias="specialConditions")
    monthly_base: int | None = Field(default=None, alias="monthlyBase")
    monthly_additional: int | None = Field(default=None, alias="monthlyAdditional")
    mvp_title: str | None = Field(default=None, alias="mvpTitle")
    mvp_intro: str | None = Field(default=None, alias="mvpIntro")
    mvp_items: list[str] | None = Field(default=None, alias="mvpItems")
    mvp_timeline: str | None = Field(default=None, alias="mvpTimeline")
    mvp_validity: str | None = Field(default=None, alias="mvpValidity")
    secondary_contact_name: str | None = Field(default=None, alias="secondaryContactName")
    secondary_contact_phone: str | None = Field(default=None, alias="secondaryContactPhone")
    secondary_contact_email: str | None = Field(default=None, alias="secondaryContactEmail")

    model_config = ConfigDict(populate_by_name=True)


def _normalize_executive_payload(payload: ExecutiveProposalPayload | None) -> dict:
    if not payload:
        return {
            "proposal_title": None,
            "strategic_intro_one": None,
            "strategic_intro_two": None,
            "strategic_intro_three": None,
            "hero_cards": None,
            "corporate_items": None,
            "corporate_investment": None,
            "city_items": None,
            "cities": None,
            "special_total": None,
            "special_conditions": None,
            "monthly_base": None,
            "monthly_additional": None,
            "mvp_title": None,
            "mvp_intro": None,
            "mvp_items": None,
            "mvp_timeline": None,
            "mvp_validity": None,
            "secondary_contact_name": None,
            "secondary_contact_phone": None,
            "secondary_contact_email": None,
        }
    return {
        "proposal_title": payload.proposal_title,
        "strategic_intro_one": payload.strategic_intro_one,
        "strategic_intro_two": payload.strategic_intro_two,
        "strategic_intro_three": payload.strategic_intro_three,
        "hero_cards": [card.dict() for card in payload.hero_cards] if payload.hero_cards else None,
        "corporate_items": payload.corporate_items,
        "corporate_investment": payload.corporate_investment,
        "city_items": payload.city_items,
        "cities": [city.dict() for city in payload.cities] if payload.cities else None,
        "special_total": payload.special_total,
        "special_conditions": payload.special_conditions,
        "monthly_base": payload.monthly_base,
        "monthly_additional": payload.monthly_additional,
        "mvp_title": payload.mvp_title,
        "mvp_intro": payload.mvp_intro,
        "mvp_items": payload.mvp_items,
        "mvp_timeline": payload.mvp_timeline,
        "mvp_validity": payload.mvp_validity,
        "secondary_contact_name": payload.secondary_contact_name,
        "secondary_contact_phone": payload.secondary_contact_phone,
        "secondary_contact_email": payload.secondary_contact_email,
    }


@router.get("/ejecutiva/pdf", response_class=Response, include_in_schema=True)
async def download_propuesta_ejecutiva_pdf() -> Response:
    document = await render_propuesta_ejecutiva_pdf()
    return _build_document_response(document)


@router.post("/ejecutiva/pdf", response_class=Response, include_in_schema=True)
async def download_propuesta_ejecutiva_pdf_with_data(
    payload: ExecutiveProposalPayload | None = None,
) -> Response:
    document = await render_propuesta_ejecutiva_pdf(**_normalize_executive_payload(payload))
    return _build_document_response(document)


class ExecutiveProposalEmailPayload(BaseModel):
    recipients: list[EmailStr]
    subject: str = "Propuesta Ejecutiva Tal-IA"
    message: str | None = None
    proposal: ExecutiveProposalPayload | None = None

    model_config = ConfigDict(populate_by_name=True)


@router.post("/ejecutiva/email", include_in_schema=True)
async def email_propuesta_ejecutiva(payload: ExecutiveProposalEmailPayload) -> dict[str, str]:
    document = await render_propuesta_ejecutiva_pdf(**_normalize_executive_payload(payload.proposal))
    mail_settings = await get_mail_runtime_settings(organizacion_id=MASTER_ORGANIZACION_ID)
    try:
        message_id = send_email(
            subject=payload.subject,
            body_text=payload.message or "Adjunto encontrarás la propuesta ejecutiva Tal-IA.",
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
