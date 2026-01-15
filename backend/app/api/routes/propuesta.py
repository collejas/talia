"""Rutas dedicadas a la propuesta Tal-IA."""

from fastapi import APIRouter, Response

from app.services.propuesta_pdf import render_propuesta_pdf

router = APIRouter(prefix="/propuesta", tags=["propuesta"])


@router.get("/tal-ia/pdf", response_class=Response, include_in_schema=True)
async def download_propuesta_pdf() -> Response:
    """Devuelve la propuesta Tal-IA como PDF listo para descargar."""

    document = await render_propuesta_pdf()
    headers = {
        "Content-Disposition": f'attachment; filename="{document.filename}"',
    }
    return Response(content=document.content, media_type="application/pdf", headers=headers)
