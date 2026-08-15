from app.services.web_tracking import (
    normalize_public_site_id,
    normalize_tracking_domain,
    normalize_tracking_url,
    request_tracking_domain,
)


def test_normalize_public_site_id_accepts_public_identifier() -> None:
    assert normalize_public_site_id(" TALIA_SITE_tenant_demo ") == "talia_site_tenant_demo"


def test_normalize_public_site_id_rejects_alias_or_uuid() -> None:
    assert normalize_public_site_id("tenant-demo") is None
    assert normalize_public_site_id("00000000-0000-0000-0000-000000000001") is None


def test_normalize_tracking_domain_removes_origin_port_and_trailing_dot() -> None:
    assert normalize_tracking_domain("https://www.example.com:443/path") == "www.example.com"
    assert normalize_tracking_domain("WWW.EXAMPLE.COM.") == "www.example.com"


def test_request_tracking_domain_prefers_origin() -> None:
    assert (
        request_tracking_domain(
            origin="https://tenant.example.com",
            referer="https://other.example.com/page",
        )
        == "tenant.example.com"
    )


def test_normalize_tracking_domain_rejects_credentials_and_localhost() -> None:
    assert normalize_tracking_domain("https://user:pass@example.com") is None
    assert normalize_tracking_domain("http://localhost:3000") is None


def test_normalize_tracking_url_decodes_html_query_separators() -> None:
    value = (
        "https://talia.mx/?utm_source=prospeccion&amp%3Butm_medium=email"
        "&amp%3Butm_campaign=cold_outreach&utm_content=image"
    )

    assert normalize_tracking_url(value) == (
        "https://talia.mx/?utm_source=prospeccion&utm_medium=email"
        "&utm_campaign=cold_outreach&utm_content=image"
    )


def test_normalize_tracking_url_preserves_encoded_parameter_values() -> None:
    value = "https://talia.mx/?q=uno%26dos&utm_campaign=cold_outreach"

    assert normalize_tracking_url(value) == value
