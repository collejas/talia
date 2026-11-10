"""Public delivery state derived from durable acceptance evidence."""
from typing import Any


def public_contact_state(row: dict[str, Any]) -> str:
    state = str(row.get('estado') or 'pendiente')
    if row.get('canal') != 'correo':
        return state
    detail = row.get('detalle') or {}
    if row.get('accion') == 'postmark_queued':
        return 'en_cola'
    if state == 'enviado' and not row.get('proveedor_aceptado_en'):
        if detail.get('email_provider') == 'postmark' or detail.get('delivery_state') == 'queued':
            return 'en_cola'
    return state
