from app.services.tenant_onboarding import build_onboarding_progress


def _tenant() -> dict[str, object]:
    return {
        "nombre": "Tenant de prueba",
        "razon_social": "Tenant de prueba S.A.",
        "rfc": "ABC010101AA1",
        "contacto_nombre": "Persona responsable",
        "contacto_telefono": "5555555555",
        "correo_contacto_principal": "test@example.com",
        "telefono": "5555555555",
        "pais": "México",
        "estado": "Jalisco",
        "ciudad": "Guadalajara",
        "timezone": "America/Mexico_City",
        "idioma": "es",
        "moneda": "MXN",
        "logo_url": "https://example.com/logo.png",
        "config": {"whatsapp": {"meta": {}}},
    }


def test_whatsapp_requires_assisted_connection_when_record_exists() -> None:
    progress = build_onboarding_progress(
        tenant=_tenant(),
        routes=[{"canal": "whatsapp", "activo": True}],
        secrets=[],
        preferences=None,
        whatsapp_connection={"estado": "error"},
    )

    whatsapp = next(step for step in progress["pasos"] if step["id"] == "whatsapp")
    assert whatsapp["completado"] is False


def test_legacy_whatsapp_route_remains_compatible_without_assisted_record() -> None:
    progress = build_onboarding_progress(
        tenant=_tenant(),
        routes=[{"canal": "whatsapp", "activo": True}],
        secrets=[],
        preferences=None,
    )

    whatsapp = next(step for step in progress["pasos"] if step["id"] == "whatsapp")
    assert whatsapp["completado"] is True
