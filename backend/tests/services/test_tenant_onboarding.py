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


def test_web_tracking_can_be_marked_as_not_used() -> None:
    progress = build_onboarding_progress(
        tenant=_tenant(),
        routes=[],
        secrets=[],
        preferences={"web_tracking_decision": "no_usar"},
    )

    pagina_web = next(step for step in progress["pasos"] if step["id"] == "pagina_web")
    assert pagina_web["completado"] is True
    assert progress["web_tracking_decision"] == "no_usar"


def test_web_tracking_requires_active_site_and_verified_domain_when_selected() -> None:
    base = {
        "web_tracking_decision": "usar",
    }
    pending = build_onboarding_progress(
        tenant=_tenant(),
        routes=[],
        secrets=[],
        preferences=base,
        web_tracking_sites=[{"id": "site-1", "active": True}],
        web_tracking_domains=[{"tracking_site_id": "site-1", "active": True, "verification_status": "pending"}],
    )
    assert next(step for step in pending["pasos"] if step["id"] == "pagina_web")["completado"] is False

    verified = build_onboarding_progress(
        tenant=_tenant(),
        routes=[],
        secrets=[],
        preferences=base,
        web_tracking_sites=[{"id": "site-1", "active": True}],
        web_tracking_domains=[{"tracking_site_id": "site-1", "active": True, "verification_status": "verified"}],
    )
    assert next(step for step in verified["pasos"] if step["id"] == "pagina_web")["completado"] is True


def test_google_places_can_be_marked_as_not_used() -> None:
    progress = build_onboarding_progress(
        tenant=_tenant(),
        routes=[],
        secrets=[{"clave": "denue.token"}],
        preferences={"google_places_decision": "no_usar"},
    )

    busqueda = next(step for step in progress["pasos"] if step["id"] == "busqueda")
    assert busqueda["completado"] is True


def test_google_places_is_required_when_selected() -> None:
    progress = build_onboarding_progress(
        tenant=_tenant(),
        routes=[],
        secrets=[{"clave": "denue.token"}],
        preferences={"google_places_decision": "usar"},
    )

    busqueda = next(step for step in progress["pasos"] if step["id"] == "busqueda")
    assert busqueda["completado"] is False


def test_brevo_tenant_completes_email_without_postmark_domain() -> None:
    tenant = _tenant()
    tenant["config"] = {
        "mail": {
            "incoming_server": "imap.example.com",
            "incoming_port_imap": 993,
            "outgoing_server": "smtp.example.com",
            "outgoing_port_smtp": 465,
            "use_ssl": True,
            "use_tls": False,
        },
        "brevo": {"sender_email": "sender@example.com"},
    }
    progress = build_onboarding_progress(
        tenant=tenant,
        routes=[],
        secrets=[{"clave": "mail.username"}, {"clave": "mail.password"}, {"clave": "brevo.api_key"}],
        preferences=None,
        email_service={"migration": {"status": "pending", "feature_enabled": False}},
    )

    correo = next(step for step in progress["pasos"] if step["id"] == "correo")
    assert correo["completado"] is True


def test_postmark_tenant_still_requires_verified_domain() -> None:
    tenant = _tenant()
    tenant["config"] = {
        "mail": {
            "incoming_server": "imap.example.com",
            "incoming_port_imap": 993,
            "outgoing_server": "smtp.example.com",
            "outgoing_port_smtp": 465,
            "use_ssl": True,
            "use_tls": False,
        },
    }
    progress = build_onboarding_progress(
        tenant=tenant,
        routes=[],
        secrets=[{"clave": "mail.username"}, {"clave": "mail.password"}],
        preferences=None,
        email_service={
            "migration": {"status": "active", "feature_enabled": True},
            "domain": {"status": "pending_dns", "verified_at": None, "default_from_email": None},
        },
    )

    correo = next(step for step in progress["pasos"] if step["id"] == "correo")
    assert correo["completado"] is False
