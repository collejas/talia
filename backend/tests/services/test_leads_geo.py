from app.services import leads_geo


def test_phone_location_from_number_resolves_dominant_state_for_lada() -> None:
    summary = leads_geo.phone_location_from_number("+5213121435746")

    assert summary.country_code == "MX"
    assert summary.lada == "312"
    assert summary.estado_clave == "06"
    assert summary.estado_nombre == "Colima"


def test_infer_contact_location_resolves_state_from_lada_when_missing_geo() -> None:
    location = leads_geo.infer_contact_location(
        contacto_id="contacto-test",
        data={
            "telefono_e164": "+5213121435746",
            "contacto_datos": {},
        },
        channels=["whatsapp"],
        identities=[],
    )

    assert location.lada == "312"
    assert location.estado_clave == "06"
    assert location.estado_nombre == "Colima"
    assert location.municipio_clave is not None
    assert location.municipio_cvegeo is not None
    assert location.municipio_cvegeo.startswith("06")
