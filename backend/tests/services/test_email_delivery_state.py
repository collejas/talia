import pytest
from app.services.email_delivery_state import public_contact_state


@pytest.mark.parametrize('state,accepted,channel,provider,expected', [
    ('enviado', None, 'correo', 'postmark', 'en_cola'),
    ('enviado', '2026-11-10T18:00:00Z', 'correo', 'postmark', 'enviado'),
    ('entregado', None, 'correo', 'postmark', 'entregado'),
    ('enviado', None, 'whatsapp', 'meta', 'enviado'),
    ('enviado', None, 'correo', 'brevo', 'enviado'),
    ('error', None, 'correo', 'postmark', 'error'),
])
def test_public_state_requires_acceptance_for_postmark(state, accepted, channel, provider, expected):
    assert public_contact_state(dict(estado=state, canal=channel,
        proveedor_aceptado_en=accepted, detalle={'email_provider': provider})) == expected


def test_queue_log_stays_queue_even_after_later_delivery():
    assert public_contact_state({'canal': 'correo', 'estado': 'enviado',
                                 'accion': 'postmark_queued'}) == 'en_cola'


def test_uncertain_is_neither_rejected_nor_accepted():
    assert public_contact_state({'canal': 'correo', 'estado': 'enviado',
                                 'error': 'delivery_uncertain'}) == 'verificando_envio'
