from app.services.result_identity import build_result_dedupe_key


def test_build_result_dedupe_key_prefers_external_id() -> None:
    key1 = build_result_dedupe_key("denue", external_id="ABC 123")
    key2 = build_result_dedupe_key("denue", external_id="abc123")

    assert key1 == key2
    assert key1.startswith("denue:ext:")


def test_build_result_dedupe_key_fallback_is_stable() -> None:
    key1 = build_result_dedupe_key(
        "google_places",
        name="Talia MX",
        address="Av. Juarez 100",
        phone="+52 55 1234 5678",
        actividad="Consultoria",
    )
    key2 = build_result_dedupe_key(
        "google_places",
        name="  talia mx  ",
        address="AV JUAREZ 100",
        phone="52-55-1234-5678",
        actividad="consultoría",
    )
    key3 = build_result_dedupe_key(
        "google_places",
        name="Otra empresa",
        address="Av. Juarez 100",
        phone="+52 55 1234 5678",
        actividad="Consultoria",
    )

    assert key1 == key2
    assert key1 != key3
    assert key1.startswith("google_places:md5:")
