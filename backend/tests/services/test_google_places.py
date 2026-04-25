from app.services.google_places import normalize_place_for_result


def test_normalize_place_for_result_materializes_google_columns() -> None:
    normalized = normalize_place_for_result(
        {
            "id": "place_123",
            "displayName": {"text": "Talia MX"},
            "formattedAddress": "Av. Juarez 100, Centro, 20000, Aguascalientes, Ags., Mexico",
            "location": {"latitude": 21.885, "longitude": -102.291},
            "primaryType": "consultant",
            "primaryTypeDisplayName": {"text": "Consultora"},
            "types": ["consultant", "point_of_interest", "establishment"],
            "internationalPhoneNumber": "+52 55 1234 5678",
            "websiteUri": "https://talia.mx",
            "googleMapsUri": "https://maps.google.com/?cid=123",
            "rating": 4.8,
            "userRatingCount": 42,
        }
    )

    assert normalized["address"] == "Av. Juarez 100, Centro, 20000, Aguascalientes, Ags., Mexico"
    assert normalized["address_full"] == normalized["address"]
    assert normalized["google_primary_type"] == "consultant"
    assert normalized["google_primary_type_display_name"] == "Consultora"
    assert normalized["google_types"] == ["consultant", "point_of_interest", "establishment"]
    assert normalized["phone"] == "+52 55 1234 5678"
    assert normalized["website"] == "https://talia.mx"
    assert normalized["maps_url"] == "https://maps.google.com/?cid=123"
