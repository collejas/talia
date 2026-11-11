import pytest

from app.services.postmark.manifest import compact_manifest, expand_manifest


def test_large_manifest_roundtrip_preserves_variants_and_recipients():
    entries = [
        {"ordinal": i, "payload": {"html": "x" * 10_620, "variant": i % 3},
         "detalle": {"email": f"person{i}@example.com"}}
        for i in range(2022)
    ]
    compact = compact_manifest(entries)
    assert expand_manifest(compact) == entries
    assert sum("payload" in row for row in compact) == 3
    assert "payload_ref" not in entries[3]


def test_legacy_manifest_stays_compatible():
    entries = [{"payload": {"body": "hola"}, "ordinal": 0}]
    assert expand_manifest(entries) == entries


@pytest.mark.parametrize("ref", [-1, 0, "0", True])
def test_invalid_reference_is_rejected(ref):
    with pytest.raises(ValueError, match="reference_invalid"):
        expand_manifest([{"payload_ref": ref}])
