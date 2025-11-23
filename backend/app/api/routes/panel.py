"""Endpoints heredados del panel clásico.

Actualmente sólo se mantiene la ruta `/panel/env.js` para compartir la
configuración pública de Supabase con los assets estáticos legados.
"""

from fastapi import APIRouter, Response

from app.core.config import settings

router = APIRouter(prefix="", tags=["panel"])


@router.get("/panel/env.js")
async def panel_env_js() -> Response:
    """Expone configuración pública mínima para el panel legacy.

    Se conserva para compatibilidad con los bundles estáticos /panel que aún
    esperan `window.SUPABASE_URL` y `window.SUPABASE_ANON_KEY`.
    """
    url = (settings.supabase_url or "").rstrip("/")
    anon = getattr(settings, "supabase_anon", None) or ""
    body = "window.SUPABASE_URL = '" + url + "';\n" "window.SUPABASE_ANON_KEY = '" + anon + "';\n"
    return Response(content=body, media_type="application/javascript")
